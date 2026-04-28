import { CAPITAL_RULEBOOK } from '../config/capital.constants.js';
import type { ContractBlueprint } from '../types/blueprint.js';
import type {
  CapitalAppSlug,
  ReserveLot,
  ReserveSeatRecord,
} from '../types/domain.js';
import {
  formatCapitalSeatStorageKey,
  formatReserveLotStorageKey,
  getReserveLotLifecycleStatus,
  isReserveSeatTerminalStatus,
} from '../utils/capital-lifecycle.js';
import { CapitalRegistry } from './CapitalRegistry.js';

export interface ReserveVaultConfig {
  readonly seatCap: number;
  readonly minimumAllocation72H: bigint;
  readonly lockDurationSeconds: number;
  readonly rewardClaimIntervalSeconds: number;
  readonly topUpsAreLotBased: true;
  readonly partialRedemptionAllowed: true;
  readonly liquidityQueueEnabled: false;
  readonly principalRedeemedFromVault: true;
  readonly rewardsUseAppRewardPool: true;
  readonly seatNeverReleased: true;
}

export const reserveVaultBlueprint: ContractBlueprint<ReserveVaultConfig> = {
  name: 'ReserveVault',
  purpose: 'Principal-custodied Reserve vault with lot-based accounting and direct mature-principal redemption.',
  config: {
    seatCap: CAPITAL_RULEBOOK.reserve.seatCap,
    minimumAllocation72H: CAPITAL_RULEBOOK.reserve.threshold72H,
    lockDurationSeconds: CAPITAL_RULEBOOK.reserve.lockDurationSeconds,
    rewardClaimIntervalSeconds: CAPITAL_RULEBOOK.reserve.rewardClaimIntervalSeconds,
    topUpsAreLotBased: CAPITAL_RULEBOOK.reserve.topUpsAreLotBased,
    partialRedemptionAllowed: CAPITAL_RULEBOOK.reserve.partialRedemptionAllowed,
    liquidityQueueEnabled: CAPITAL_RULEBOOK.reserve.insufficientLiquidityQueuesRequests,
    principalRedeemedFromVault: CAPITAL_RULEBOOK.reserve.principalRedeemedFromVault,
    rewardsUseAppRewardPool: CAPITAL_RULEBOOK.reserve.rewardsUseAppRewardPool,
    seatNeverReleased: CAPITAL_RULEBOOK.reserve.seatNeverReleased,
  },
  invariants: [
    'A reserve seat requires at least 720 72H.',
    'Each reserve lot stays locked for 72 days from its own allocation timestamp.',
    'Reserve principal remains custodied inside the vault until a lot matures or is redeemed.',
    'Partial redemption is allowed only against matured lots owned by the seat holder.',
    'Matured principal is redeemed from the same ReserveVault; no external liquidity queue exists.',
    'Reserve rewards are claimed from AppRewardPool, not from reserve principal.',
    'Full redemption moves the seat to historical without releasing the seat number.',
    'A later qualifying reallocation can reactivate the same reserve seat as active.',
  ],
  storage: [
    {
      name: 'seatOwners',
      type: 'map<seatNumber, owner>',
      description: 'Current owner address for each reserve seat.',
    },
    {
      name: 'lots',
      type: 'map<seatNumber + lotId, reserveLot>',
      description: 'Independent reserve top-up lots and maturity data.',
    },
    {
      name: 'principalCustodyBalance',
      type: '72H token balance',
      description: 'Custodied Reserve principal backing active and mature lots.',
    },
  ],
  entrypoints: [
    {
      name: 'allocateReserve',
      sender: 'user',
      description: 'Creates a new reserve seat allocation when the threshold is met.',
    },
    {
      name: 'topUpReserve',
      sender: 'user',
      description: 'Adds a new independent reserve lot to an existing reserve seat.',
    },
    {
      name: 'redeemReserve',
      sender: 'user',
      description: 'Redeems matured reserve principal in full or part from this vault.',
    },
  ],
  events: [
    {
      name: 'ReserveAllocated',
      description: 'A new reserve seat is funded.',
    },
    {
      name: 'ReserveLotAdded',
      description: 'A top-up reserve lot is added.',
    },
    {
      name: 'ReserveRedeemed',
      description: 'Reserve principal is redeemed from matured custodied lots.',
    },
  ],
  nextImplementationSteps: [
    'Define per-lot maturity and redemption ordering rules at the storage level.',
    'Wire audited Jetton transfer dispatch for principal redemption payouts.',
    'Bind reserve reward claims to AppRewardPool rather than this principal vault.',
    'Integrate seat lifecycle callbacks with CapitalRegistry.',
  ],
};

export interface ReserveAllocationInput {
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly amount72H: bigint;
  readonly timestamp: number;
}

export interface ReserveRedemptionInput {
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly requestedAmount72H: bigint;
  readonly timestamp: number;
  readonly lotId?: string;
}

export interface ReserveLiquidityInput {
  readonly amount72H: bigint;
}

export interface ReservePositionSnapshot {
  readonly seat: ReserveSeatRecord;
  readonly totalPrincipal72H: bigint;
  readonly maturedAvailable72H: bigint;
  readonly lots: readonly ReserveLot[];
  readonly principalCustodyBalance72H: bigint;
}

export interface ReserveRedemptionResult {
  readonly outcome: 'pending' | 'redeemed';
  readonly seat: ReserveSeatRecord;
  readonly requestId: string;
  readonly redeemedAmount72H: bigint;
}

export interface PendingReserveRedemption {
  readonly requestId: string;
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly seatNumber: number;
  readonly requestedAmount72H: bigint;
  readonly createdAtUnix: number;
  readonly lotId?: string;
}

function seatKey(app: CapitalAppSlug, seatNumber: number) {
  return formatCapitalSeatStorageKey(app, 'reserve', seatNumber);
}

function redemptionQueueKey(app: CapitalAppSlug, seatNumber: number, requestId: string) {
  return `${app}:${seatNumber}:${requestId}`;
}

function cloneLot(lot: ReserveLot): ReserveLot {
  return { ...lot };
}

function sortLots(left: ReserveLot, right: ReserveLot) {
  if (left.unlockAtUnix !== right.unlockAtUnix) {
    return left.unlockAtUnix - right.unlockAtUnix;
  }

  if (left.allocatedAtUnix !== right.allocatedAtUnix) {
    return left.allocatedAtUnix - right.allocatedAtUnix;
  }

  return formatReserveLotStorageKey(left.app, left.seatNumber, left.lotId).localeCompare(
    formatReserveLotStorageKey(right.app, right.seatNumber, right.lotId),
  );
}

export class ReserveVault {
  private readonly lotsBySeat = new Map<string, ReserveLot[]>();
  private readonly nextLotSequenceBySeat = new Map<string, number>();
  private readonly pendingRedemptions = new Map<string, PendingReserveRedemption>();
  private principalCustodyBalance72H = 0n;

  constructor(
    readonly registry: CapitalRegistry,
    readonly config: ReserveVaultConfig = reserveVaultBlueprint.config,
  ) {}

  getAvailableLiquidity72H() {
    return this.principalCustodyBalance72H;
  }

  getCustodiedPrincipal72H() {
    return this.principalCustodyBalance72H;
  }

  addLiquidity({ amount72H }: ReserveLiquidityInput) {
    throw new Error(`ReserveVault no longer accepts external liquidity additions (${amount72H} 72H). Fund AppRewardPool for rewards instead.`);
  }

  drainLiquidity({ amount72H }: ReserveLiquidityInput) {
    throw new Error(`ReserveVault principal cannot be drained (${amount72H} 72H requested).`);
  }

  allocateReserve(input: ReserveAllocationInput) {
    this.assertPositiveAmount(input.amount72H);

    if (input.amount72H < this.config.minimumAllocation72H) {
      throw new Error(`Reserve allocation must be at least ${this.config.minimumAllocation72H} 72H.`);
    }

    const seat = this.registry.assignOrReactivateReserveSeat(input.app, input.owner, input.timestamp);
    this.appendLot(seat, input.amount72H, input.timestamp);
    this.principalCustodyBalance72H += input.amount72H;
    this.registry.markReserveActive(input.app, seat.seatNumber, input.timestamp);

    return this.getSeatSnapshot(input.app, input.owner, input.timestamp);
  }

  topUpReserve(input: ReserveAllocationInput) {
    this.assertPositiveAmount(input.amount72H);

    const seat = this.registry.getReserveSeatByOwner(input.app, input.owner);

    if (!seat || isReserveSeatTerminalStatus(seat.status)) {
      throw new Error('Reserve top-up requires an active reserve seat. Use allocateReserve to reactivate.');
    }

    this.appendLot(seat, input.amount72H, input.timestamp);
    this.principalCustodyBalance72H += input.amount72H;
    this.registry.markReserveActive(input.app, seat.seatNumber, input.timestamp);

    return this.getSeatSnapshot(input.app, input.owner, input.timestamp);
  }

  getSeatSnapshot(app: CapitalAppSlug, owner: string, timestamp: number): ReservePositionSnapshot {
    const seat = this.registry.getReserveSeatByOwner(app, owner);

    if (!seat) {
      throw new Error(`No reserve seat found for ${owner} on ${app}.`);
    }

    const lots = this.getLotsForSeat(app, seat.seatNumber);
    const totalPrincipal72H = lots.reduce((sum, lot) => sum + (lot.amount72H - lot.redeemedAmount72H), 0n);
    const maturedAvailable72H = this.getMaturedAvailable72H(app, seat.seatNumber, timestamp);

    return {
      seat,
      totalPrincipal72H,
      maturedAvailable72H,
      lots,
      principalCustodyBalance72H: this.principalCustodyBalance72H,
    };
  }

  getLotsForSeat(app: CapitalAppSlug, seatNumber: number) {
    return (this.lotsBySeat.get(seatKey(app, seatNumber)) ?? []).slice().sort(sortLots).map(cloneLot);
  }

  getQueuedRequests(app?: CapitalAppSlug) {
    return Array.from(this.pendingRedemptions.values()).filter((request) => !app || request.app === app);
  }

  getMaturedAvailable72H(app: CapitalAppSlug, seatNumber: number, timestamp: number) {
    return this.getLotsForSeat(app, seatNumber).reduce((sum, lot) => {
      if (getReserveLotLifecycleStatus(lot, timestamp) === 'locked') {
        return sum;
      }

      return sum + (lot.amount72H - lot.redeemedAmount72H);
    }, 0n);
  }

  redeemReserve(input: ReserveRedemptionInput): ReserveRedemptionResult {
    this.assertPositiveAmount(input.requestedAmount72H);

    const seat = this.registry.getReserveSeatByOwner(input.app, input.owner);

    if (!seat) {
      throw new Error(`No reserve seat found for ${input.owner} on ${input.app}.`);
    }

    if (this.hasPendingRedemption(input.app, seat.seatNumber, input.lotId)) {
      throw new Error('Reserve redemption already pending.');
    }

    const maturedAvailable72H = input.lotId
      ? this.getMaturedAvailableForLot(input.app, seat.seatNumber, input.lotId, input.timestamp)
      : this.getMaturedAvailable72H(input.app, seat.seatNumber, input.timestamp);

    if (input.requestedAmount72H > maturedAvailable72H) {
      throw new Error('Requested redemption exceeds matured reserve principal.');
    }

    const requestId = `${input.app}:${seat.seatNumber}:redeem:${this.pendingRedemptions.size + 1}`;
    this.pendingRedemptions.set(requestId, {
      requestId,
      app: input.app,
      owner: input.owner,
      seatNumber: seat.seatNumber,
      requestedAmount72H: input.requestedAmount72H,
      createdAtUnix: input.timestamp,
      ...(input.lotId ? { lotId: input.lotId } : {}),
    });

    return {
      outcome: 'pending',
      seat,
      requestId,
      redeemedAmount72H: input.requestedAmount72H,
    };
  }

  finalizeRedemption(requestId: string, timestamp: number): ReserveRedemptionResult {
    const pending = this.pendingRedemptions.get(requestId);
    if (!pending) {
      throw new Error('Pending reserve redemption is missing.');
    }

    const redeemedAmount72H = pending.lotId
      ? this.applyLotRedemption(pending.app, pending.seatNumber, pending.lotId, pending.requestedAmount72H, timestamp)
      : this.applyRedemption(pending.app, pending.seatNumber, pending.requestedAmount72H, timestamp);
    this.pendingRedemptions.delete(requestId);

    return {
      outcome: 'redeemed',
      seat: this.syncSeatStatus(pending.app, pending.seatNumber, timestamp),
      requestId,
      redeemedAmount72H,
    };
  }

  failRedemption(requestId: string) {
    return this.pendingRedemptions.delete(requestId);
  }

  processRedemptionQueue(timestamp: number, addedLiquidity72H = 0n) {
    void timestamp;
    void addedLiquidity72H;
    return [];
  }

  private appendLot(seat: ReserveSeatRecord, amount72H: bigint, timestamp: number) {
    const key = seatKey(seat.app, seat.seatNumber);
    const lots = this.lotsBySeat.get(key) ?? [];
    const nextSequence = this.nextLotSequence(seat.app, seat.seatNumber);
    const lot: ReserveLot = {
      lotId: `lot-${String(nextSequence).padStart(4, '0')}`,
      seatNumber: seat.seatNumber,
      app: seat.app,
      amount72H,
      allocatedAtUnix: timestamp,
      unlockAtUnix: timestamp + this.config.lockDurationSeconds,
      redeemedAmount72H: 0n,
    };

    lots.push(lot);
    this.lotsBySeat.set(key, lots);
    return lot;
  }

  private nextLotSequence(app: CapitalAppSlug, seatNumber: number) {
    const key = seatKey(app, seatNumber);
    const next = this.nextLotSequenceBySeat.get(key) ?? this.getLotsForSeat(app, seatNumber).length + 1;
    this.nextLotSequenceBySeat.set(key, next + 1);
    return next;
  }

  private assertPositiveAmount(amount72H: bigint) {
    if (amount72H <= 0n) {
      throw new Error('Amount must be positive.');
    }
  }

  private applyRedemption(app: CapitalAppSlug, seatNumber: number, requestedAmount72H: bigint, timestamp: number) {
    let remaining = requestedAmount72H;
    const key = seatKey(app, seatNumber);
    const lots = (this.lotsBySeat.get(key) ?? []).slice().sort(sortLots);

    for (const lot of lots) {
      if (remaining === 0n) break;
      if (lot.unlockAtUnix > timestamp) continue;

      const availableInLot = lot.amount72H - lot.redeemedAmount72H;
      if (availableInLot <= 0n) continue;

      const redeemed = availableInLot >= remaining ? remaining : availableInLot;
      lot.redeemedAmount72H += redeemed;
      remaining -= redeemed;
    }

    if (remaining > 0n) {
      throw new Error('Internal redemption failure: mature lots could not satisfy the request.');
    }

    this.principalCustodyBalance72H -= requestedAmount72H;
    this.lotsBySeat.set(key, lots);

    return requestedAmount72H;
  }

  private applyLotRedemption(app: CapitalAppSlug, seatNumber: number, lotId: string, requestedAmount72H: bigint, timestamp: number) {
    const key = seatKey(app, seatNumber);
    const lots = (this.lotsBySeat.get(key) ?? []).slice().sort(sortLots);
    const lot = lots.find((entry) => entry.lotId === lotId);
    if (!lot) {
      throw new Error('Reserve lot not found.');
    }
    if (lot.unlockAtUnix > timestamp) {
      throw new Error('Reserve lot is still locked.');
    }
    if (requestedAmount72H > lot.amount72H - lot.redeemedAmount72H) {
      throw new Error('Requested redemption exceeds matured reserve principal.');
    }
    lot.redeemedAmount72H += requestedAmount72H;
    this.principalCustodyBalance72H -= requestedAmount72H;
    this.lotsBySeat.set(key, lots);
    return requestedAmount72H;
  }

  private getMaturedAvailableForLot(app: CapitalAppSlug, seatNumber: number, lotId: string, timestamp: number) {
    const lot = this.getLotsForSeat(app, seatNumber).find((entry) => entry.lotId === lotId);
    if (!lot || lot.unlockAtUnix > timestamp) {
      return 0n;
    }
    return lot.amount72H - lot.redeemedAmount72H;
  }

  private hasPendingRedemption(app: CapitalAppSlug, seatNumber: number, lotId?: string) {
    return Array.from(this.pendingRedemptions.values()).some(
      (request) => request.app === app && request.seatNumber === seatNumber && (!lotId || request.lotId === lotId),
    );
  }

  private syncSeatStatus(app: CapitalAppSlug, seatNumber: number, timestamp: number) {
    const lots = this.getLotsForSeat(app, seatNumber);
    const remainingPrincipal72H = lots.reduce((sum, lot) => sum + (lot.amount72H - lot.redeemedAmount72H), 0n);

    if (remainingPrincipal72H === 0n) {
      return this.registry.markReserveHistorical(app, seatNumber, timestamp);
    }

    return this.registry.markReserveActive(app, seatNumber, timestamp);
  }

}
