import { ALPHA_THRESHOLDS_72H, CAPITAL_RULEBOOK } from '../config/capital.constants.js';
import type { ContractBlueprint } from '../types/blueprint.js';
import type { AlphaCycle, AlphaPosition, AlphaSeatRecord, AlphaTopUp, CapitalAppSlug } from '../types/domain.js';
import { CapitalRegistry } from './CapitalRegistry.js';

export interface AlphaVaultConfig {
  readonly seatCap: number;
  readonly durationSeconds: number;
  readonly completionWindowSeconds: number;
  readonly settlementIntervalSeconds: number;
  readonly settlementCadenceSeconds: number;
  readonly principalRedeemable: false;
  readonly topUpsAllowed: true;
  readonly completionStatus: 'completed';
  readonly thresholds72H: Readonly<Record<CapitalAppSlug, bigint>>;
}

export interface AlphaAllocationInput {
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly amount72H: bigint;
  readonly timestamp: number;
}

export interface AlphaSettlementInput {
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly settledReward72H: bigint;
  readonly timestamp: number;
}

export interface AlphaClaimResult {
  readonly app: CapitalAppSlug;
  readonly seatNumber: number;
  readonly claimedAtUnix: number;
  readonly claimedReward72H: bigint;
}

export interface AlphaPositionSnapshot {
  readonly seat: AlphaSeatRecord;
  readonly principal72H: bigint;
  readonly settledReward72H: bigint;
  readonly claimableReward72H: bigint;
  readonly topUps: readonly AlphaTopUp[];
  readonly settlementCycles: readonly AlphaCycle[];
}

export interface AlphaLifecycleSnapshot {
  readonly app: CapitalAppSlug;
  readonly seatNumber: number;
  readonly assignedAtUnix: number;
  readonly completionAtUnix: number;
  readonly settlementCadenceSeconds: number;
  readonly completionStatus: 'completed';
  readonly principalRedeemable: false;
  readonly topUpsAllowed: true;
}

export const alphaVaultBlueprint: ContractBlueprint<AlphaVaultConfig> = {
  name: 'AlphaVault',
  purpose: 'Alpha Allocation vault with fixed non-redeemable principal, periodic settlements, and completion after 72 weeks.',
  config: {
    seatCap: CAPITAL_RULEBOOK.alpha.seatCap,
    durationSeconds: CAPITAL_RULEBOOK.alpha.durationSeconds,
    completionWindowSeconds: CAPITAL_RULEBOOK.alpha.durationSeconds,
    settlementIntervalSeconds: CAPITAL_RULEBOOK.alpha.settlementIntervalSeconds,
    settlementCadenceSeconds: CAPITAL_RULEBOOK.alpha.settlementIntervalSeconds,
    principalRedeemable: CAPITAL_RULEBOOK.alpha.principalRedeemable,
    topUpsAllowed: CAPITAL_RULEBOOK.alpha.topUpsAllowed,
    completionStatus: CAPITAL_RULEBOOK.alpha.completedStatus,
    thresholds72H: ALPHA_THRESHOLDS_72H,
  },
  invariants: [
    'An alpha seat cap is 9 per app.',
    'Alpha allocations are lifecycle-scoped: active, then completed after 72 weeks.',
    'Alpha principal is non-redeemable once allocated.',
    'Alpha top-ups are allowed and increase tracked principal.',
    'Settlement executes every 7 weeks.',
    'Settled alpha yield is claimable in 72H on a 7-week cadence.',
    'After 72 weeks the seat becomes completed.',
    'Principal remains non-redeemable after completion.',
    'A completed alpha seat keeps its identity, claim history, and non-redeemable principal.',
    'Alpha thresholds are app-specific: 72hours=72,000; wan=72,000; multi-millionaire=720,000.',
  ],
  storage: [
    {
      name: 'positions',
      type: 'map<seatNumber, alphaPosition>',
      description: 'Owner, principal, start time, completion time, status, and yield accounting for each alpha seat.',
    },
    {
      name: 'topUps',
      type: 'map<seatNumber + topUpId, alphaTopUp>',
      description: 'Alpha top-up ledger for principal growth. Top-ups are additive and do not reopen redemption.',
    },
    {
      name: 'settlementCycles',
      type: 'map<seatNumber + cycleNumber, alphaSettlementCycle>',
      description: 'Settlement cadence every 7 weeks with claimable 72H yield batches.',
    },
    {
      name: 'claimLedger',
      type: 'map<seatNumber, lastClaimAt>',
      description: 'Tracks settled reward claims per alpha seat so claims only cover fresh, unclaimed cycles.',
    },
    {
      name: 'completionLedger',
      type: 'map<seatNumber, completionAt>',
      description: 'Records the 72-week completion boundary that flips a seat into completed state.',
    },
  ],
  entrypoints: [
    {
      name: 'allocateAlpha',
      sender: 'user',
      description: 'Creates a new alpha seat allocation when the app threshold is met. Principal begins as locked and non-redeemable.',
    },
    {
      name: 'topUpAlpha',
      sender: 'user',
      description: 'Adds new principal to an existing alpha seat without changing seat identity or redemption rules.',
    },
    {
      name: 'settleAlphaCycle',
      sender: 'multisig',
      description: 'Commits a 7-week alpha settlement batch for a seat. Settlement is yield-only and never unlocks principal.',
    },
    {
      name: 'claimReward',
      sender: 'user',
      description: 'Claims settled alpha yield denominated in 72H. Claims only consume already-settled, unclaimed cycles.',
    },
    {
      name: 'markCompleted',
      sender: 'multisig',
      description: 'Transitions a matured alpha seat to completed after 72 weeks. Completion is terminal for lifecycle status, not principal exit.',
    },
    {
      name: 'redeemAlpha',
      sender: 'user',
      description: 'Rejects any attempt to redeem alpha principal. The principal is non-redeemable before and after completion.',
    },
  ],
  events: [
    {
      name: 'AlphaAllocated',
      description: 'A new alpha seat is funded.',
    },
    {
      name: 'AlphaTopUpAdded',
      description: 'Additional principal is added to an alpha seat.',
    },
    {
      name: 'AlphaSettled',
      description: 'A 7-week alpha settlement cycle is committed.',
    },
    {
      name: 'AlphaRewardClaimed',
      description: 'Alpha yield has been claimed in 72H.',
    },
    {
      name: 'AlphaCompleted',
      description: 'An alpha seat reaches completed state after 72 weeks.',
    },
  ],
  nextImplementationSteps: [
    'Encode app-specific threshold checks on-chain and bind them to the 9-seat alpha cap.',
    'Specify the 7-week settlement message shape, treasury funding handshake, and claim digest.',
    'Persist the 72-week completion boundary so lifecycle changes never permit principal exit.',
  ],
};

type SeatKey = `${CapitalAppSlug}:${number}`;

function seatKey(app: CapitalAppSlug, seatNumber: number): SeatKey {
  return `${app}:${seatNumber}`;
}

function cloneTopUp(topUp: AlphaTopUp): AlphaTopUp {
  return { ...topUp };
}

function cloneCycle(cycle: AlphaCycle): AlphaCycle {
  return { ...cycle };
}

function cloneSeat(record: AlphaSeatRecord): AlphaSeatRecord {
  return { ...record };
}

export class AlphaVault {
  private readonly topUpsBySeat = new Map<SeatKey, AlphaTopUp[]>();
  private readonly settlementCyclesBySeat = new Map<SeatKey, AlphaCycle[]>();
  private readonly lastClaimAt = new Map<SeatKey, number>();
  private nextTopUpSequence = 1;

  constructor(
    readonly registry: CapitalRegistry,
    readonly config: AlphaVaultConfig = alphaVaultBlueprint.config,
  ) {}

  allocateAlpha(input: AlphaAllocationInput): AlphaPositionSnapshot {
    this.assertPositiveAmount(input.amount72H);
    this.assertThreshold(input.app, input.amount72H);

    const seat = this.registry.assignAlphaSeat(input.app, input.owner, input.timestamp);
    this.appendTopUp(seat, input.amount72H, input.timestamp);

    return this.getSeatSnapshot(input.app, input.owner, input.timestamp);
  }

  topUpAlpha(input: AlphaAllocationInput): AlphaPositionSnapshot {
    this.assertPositiveAmount(input.amount72H);

    const seat = this.getCurrentSeat(input.app, input.owner, input.timestamp);

    if (!seat) {
      throw new Error(`No alpha seat found for ${input.owner} on ${input.app}.`);
    }

    if (seat.status === 'completed') {
      throw new Error('Alpha top-up is unavailable after completion.');
    }

    this.appendTopUp(seat, input.amount72H, input.timestamp);
    this.registry.markAlphaActive(input.app, seat.seatNumber, input.timestamp);

    return this.getSeatSnapshot(input.app, input.owner, input.timestamp);
  }

  settleAlphaCycle(input: AlphaSettlementInput): AlphaPositionSnapshot {
    this.assertPositiveAmount(input.settledReward72H);

    const seat = this.registry.getAlphaSeatByOwner(input.app, input.owner);

    if (!seat) {
      throw new Error(`No alpha seat found for ${input.owner} on ${input.app}.`);
    }

    this.assertNotCompleted(seat);

    const cycles = this.getCyclesForSeat(input.app, seat.seatNumber);
    const cycleNumber = cycles.length + 1;
    const maxCycles = this.getMaxSettlementCycles();

    if (cycleNumber > maxCycles) {
      throw new Error('Alpha settlement cycles are exhausted for this seat.');
    }

    const expectedSettleAtUnix = this.getSettlementBoundaryUnix(seat.assignedAtUnix, cycleNumber);

    if (input.timestamp < expectedSettleAtUnix) {
      throw new Error('Alpha settlement cannot happen before the next 7-week boundary.');
    }

    const cycle: AlphaCycle = {
      app: input.app,
      seatNumber: seat.seatNumber,
      cycleNumber,
      startsAtUnix: expectedSettleAtUnix - this.config.settlementIntervalSeconds,
      settlesAtUnix: input.timestamp,
      settledReward72H: input.settledReward72H,
      claimedReward72H: 0n,
      completed: cycleNumber === maxCycles,
    };

    this.appendCycle(input.app, seat.seatNumber, cycle);

    if (this.isCompletionReached(seat, input.timestamp)) {
      this.registry.markAlphaCompleted(input.app, seat.seatNumber, input.timestamp);
    } else {
      this.registry.markAlphaActive(input.app, seat.seatNumber, input.timestamp);
    }

    return this.getSeatSnapshot(input.app, input.owner, input.timestamp);
  }

  claimReward(app: CapitalAppSlug, owner: string, timestamp: number): AlphaClaimResult {
    const seat = this.getCurrentSeat(app, owner, timestamp);

    if (!seat) {
      throw new Error(`No alpha seat found for ${owner} on ${app}.`);
    }

    const key = seatKey(app, seat.seatNumber);
    const lastClaimAt = this.lastClaimAt.get(key) ?? seat.assignedAtUnix;

    if (timestamp - lastClaimAt < this.config.settlementIntervalSeconds) {
      throw new Error('Alpha settled yield cannot be claimed yet.');
    }

    const claimableReward72H = this.getClaimableReward72H(app, seat.seatNumber, timestamp, lastClaimAt);

    if (claimableReward72H <= 0n) {
      throw new Error('No settled alpha yield is available to claim.');
    }

    this.lastClaimAt.set(key, timestamp);
    this.markCyclesClaimed(app, seat.seatNumber, timestamp, lastClaimAt);

    return {
      app,
      seatNumber: seat.seatNumber,
      claimedAtUnix: timestamp,
      claimedReward72H: claimableReward72H,
    };
  }

  markCompleted(app: CapitalAppSlug, owner: string, timestamp: number): AlphaPositionSnapshot {
    const seat = this.registry.getAlphaSeatByOwner(app, owner);

    if (!seat) {
      throw new Error(`No alpha seat found for ${owner} on ${app}.`);
    }

    if (!this.isCompletionReached(seat, timestamp)) {
      throw new Error('Alpha seat cannot be completed before 72 weeks.');
    }

    const completedSeat = this.registry.markAlphaCompleted(app, seat.seatNumber, timestamp);
    return this.getSeatSnapshot(app, owner, timestamp, completedSeat);
  }

  redeemAlpha(_app: CapitalAppSlug, _owner: string): never {
    throw new Error('Alpha principal is non-redeemable.');
  }

  getSeatSnapshot(
    app: CapitalAppSlug,
    owner: string,
    timestamp: number,
    seatOverride?: AlphaSeatRecord,
  ): AlphaPositionSnapshot {
    const seat = seatOverride ?? this.registry.getAlphaSeatByOwner(app, owner);

    if (!seat) {
      throw new Error(`No alpha seat found for ${owner} on ${app}.`);
    }

    const topUps = this.getTopUpsForSeat(app, seat.seatNumber);
    const settlementCycles = this.getCyclesForSeat(app, seat.seatNumber);
    const principal72H = topUps.reduce((sum, topUp) => sum + topUp.amount72H, 0n);
    const settledReward72H = settlementCycles.reduce((sum, cycle) => sum + cycle.settledReward72H, 0n);
    const lastClaimAtUnix = this.lastClaimAt.get(seatKey(app, seat.seatNumber));
    const claimableReward72H = this.getClaimableReward72H(app, seat.seatNumber, timestamp, lastClaimAtUnix);

    return {
      seat: cloneSeat(seat),
      principal72H,
      settledReward72H,
      claimableReward72H,
      topUps,
      settlementCycles,
    };
  }

  getTopUpsForSeat(app: CapitalAppSlug, seatNumber: number) {
    return (this.topUpsBySeat.get(seatKey(app, seatNumber)) ?? []).map(cloneTopUp);
  }

  getSettlementCyclesForSeat(app: CapitalAppSlug, seatNumber: number) {
    return (this.settlementCyclesBySeat.get(seatKey(app, seatNumber)) ?? []).map(cloneCycle);
  }

  private appendTopUp(seat: AlphaSeatRecord, amount72H: bigint, timestamp: number) {
    const key = seatKey(seat.app, seat.seatNumber);
    const topUps = this.topUpsBySeat.get(key) ?? [];
    const topUp: AlphaTopUp = {
      topUpId: `top-up-${this.nextTopUpSequence++}`,
      seatNumber: seat.seatNumber,
      app: seat.app,
      amount72H,
      toppedUpAtUnix: timestamp,
    };

    topUps.push(topUp);
    this.topUpsBySeat.set(key, topUps);
    return topUp;
  }

  private appendCycle(app: CapitalAppSlug, seatNumber: number, cycle: AlphaCycle) {
    const key = seatKey(app, seatNumber);
    const cycles = this.settlementCyclesBySeat.get(key) ?? [];
    cycles.push({ ...cycle });
    this.settlementCyclesBySeat.set(key, cycles);
  }

  private getCyclesForSeat(app: CapitalAppSlug, seatNumber: number) {
    return (this.settlementCyclesBySeat.get(seatKey(app, seatNumber)) ?? []).map(cloneCycle).sort((left, right) => {
      if (left.cycleNumber !== right.cycleNumber) {
        return left.cycleNumber - right.cycleNumber;
      }

      return left.settlesAtUnix - right.settlesAtUnix;
    });
  }

  private getClaimableReward72H(
    app: CapitalAppSlug,
    seatNumber: number,
    timestamp: number,
    lastClaimAtUnix?: number,
  ) {
    const lastClaimBase = lastClaimAtUnix ?? this.registry.getAlphaSeat(app, seatNumber)?.assignedAtUnix ?? timestamp;

    return this.getCyclesForSeat(app, seatNumber).reduce((sum, cycle) => {
      if (cycle.settlesAtUnix <= lastClaimBase || cycle.settlesAtUnix > timestamp) {
        return sum;
      }

      return sum + cycle.settledReward72H;
    }, 0n);
  }

  private markCyclesClaimed(app: CapitalAppSlug, seatNumber: number, timestamp: number, lastClaimAtUnix: number) {
    const key = seatKey(app, seatNumber);
    const cycles = this.getCyclesForSeat(app, seatNumber).map((cycle) => {
      if (cycle.settlesAtUnix <= lastClaimAtUnix || cycle.settlesAtUnix > timestamp) {
        return cycle;
      }

      return {
        ...cycle,
        claimedAtUnix: timestamp,
        claimedReward72H: cycle.settledReward72H,
      };
    });

    this.settlementCyclesBySeat.set(key, cycles);
  }

  private assertPositiveAmount(amount72H: bigint) {
    if (amount72H <= 0n) {
      throw new Error('Amount must be positive.');
    }
  }

  private assertThreshold(app: CapitalAppSlug, amount72H: bigint) {
    const threshold72H = this.config.thresholds72H[app];

    if (amount72H < threshold72H) {
      throw new Error(`Alpha allocation must be at least ${threshold72H} 72H for ${app}.`);
    }
  }

  private assertNotCompleted(seat: AlphaSeatRecord) {
    if (seat.status === 'completed') {
      throw new Error('Alpha seat is already completed.');
    }
  }

  private getCurrentSeat(app: CapitalAppSlug, owner: string, timestamp: number) {
    const seat = this.registry.getAlphaSeatByOwner(app, owner);

    if (!seat) {
      return undefined;
    }

    if (this.isCompletionReached(seat, timestamp)) {
      return this.registry.markAlphaCompleted(app, seat.seatNumber, timestamp);
    }

    return seat;
  }

  private getMaxSettlementCycles() {
    return Math.floor(this.config.durationSeconds / this.config.settlementIntervalSeconds);
  }

  private getSettlementBoundaryUnix(assignedAtUnix: number, cycleNumber: number) {
    return assignedAtUnix + cycleNumber * this.config.settlementIntervalSeconds;
  }

  private isCompletionReached(seat: AlphaSeatRecord, timestamp: number) {
    return timestamp >= this.getCompletionDeadlineUnix(seat);
  }

  private getCompletionDeadlineUnix(seat: AlphaSeatRecord) {
    return seat.assignedAtUnix + this.config.completionWindowSeconds;
  }

  describeLifecycle(app: CapitalAppSlug, owner: string, timestamp: number): AlphaLifecycleSnapshot {
    const seat = this.getCurrentSeat(app, owner, timestamp);

    if (!seat) {
      throw new Error(`No alpha seat found for ${owner} on ${app}.`);
    }

    return {
      app: seat.app,
      seatNumber: seat.seatNumber,
      assignedAtUnix: seat.assignedAtUnix,
      completionAtUnix: this.getCompletionDeadlineUnix(seat),
      settlementCadenceSeconds: this.config.settlementCadenceSeconds,
      completionStatus: this.config.completionStatus,
      principalRedeemable: this.config.principalRedeemable,
      topUpsAllowed: this.config.topUpsAllowed,
    };
  }
}
