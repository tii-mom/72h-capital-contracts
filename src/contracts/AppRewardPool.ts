import { CAPITAL_RULEBOOK } from '../config/capital.constants.js';
import type { ContractBlueprint } from '../types/blueprint.js';
import type { CapitalAppSlug, CapitalSeatType, RewardClaim, RewardPoolFunding } from '../types/domain.js';
import { CapitalRegistry } from './CapitalRegistry.js';

const REWARD_SCALE = 1_000_000_000n;

export interface AppRewardPoolConfig {
  readonly rewardToken: '72H';
  readonly reserveClaimIntervalSeconds: number;
  readonly alphaClaimIntervalSeconds: number;
  readonly reserveWeight: 1;
  readonly alphaWeight: 10;
  readonly principalIsolation: true;
  readonly distributionAuthority: 'single-admin-or-app-revenue';
}

export interface RewardFundingInput {
  readonly app: CapitalAppSlug;
  readonly amount72H: bigint;
  readonly timestamp: number;
}

export interface RewardClaimInput {
  readonly app: CapitalAppSlug;
  readonly seatType: CapitalSeatType;
  readonly owner: string;
  readonly timestamp: number;
}

export interface RewardPoolSnapshot {
  readonly app: CapitalAppSlug;
  readonly availableRewards72H: bigint;
  readonly cumulativeRewardPerWeightScaled: bigint;
  readonly totalRewardWeight: bigint;
  readonly funded72H: bigint;
  readonly claimed72H: bigint;
}

export const appRewardPoolBlueprint: ContractBlueprint<AppRewardPoolConfig> = {
  name: 'AppRewardPool',
  purpose: 'Per-application 72H reward pool. It receives app-generated rewards and pays Reserve/Alpha claims without touching principal vaults.',
  config: {
    rewardToken: CAPITAL_RULEBOOK.shared.rewardToken,
    reserveClaimIntervalSeconds: CAPITAL_RULEBOOK.reserve.rewardClaimIntervalSeconds,
    alphaClaimIntervalSeconds: CAPITAL_RULEBOOK.alpha.settlementIntervalSeconds,
    reserveWeight: 1,
    alphaWeight: 10,
    principalIsolation: true,
    distributionAuthority: 'single-admin-or-app-revenue',
  },
  invariants: [
    'RewardPool holds rewards only; it never receives or redeems Reserve or Alpha principal.',
    'Rewards are denominated in 72H only.',
    'Reserve seats use reward weight 1 and can claim every 7 days.',
    'Alpha seats use reward weight 10 and can claim every 7 weeks.',
    'Reward claims can be zero and never imply a fixed APY.',
    'Reward funding is app-scoped and must be indexed separately from principal movements.',
  ],
  storage: [
    {
      name: 'availableRewards',
      type: '72H token balance',
      description: 'App-scoped reward balance available for claims.',
    },
    {
      name: 'cumulativeRewardPerWeight',
      type: 'map<appSlug, uint>',
      description: 'Scaled cumulative reward-per-weight ledger for Reserve and Alpha holders.',
    },
    {
      name: 'claimedBySeat',
      type: 'map<appSlug + seatType + seatNumber, uint>',
      description: 'Scaled reward already consumed by each seat.',
    },
    {
      name: 'lastClaimAt',
      type: 'map<appSlug + seatType + seatNumber, timestamp>',
      description: 'Cadence guard for Reserve 7-day and Alpha 7-week claims.',
    },
  ],
  entrypoints: [
    {
      name: 'fundRewards',
      sender: 'multisig',
      description: 'Adds app-generated 72H rewards to a specific application pool.',
    },
    {
      name: 'claimReward',
      sender: 'user',
      description: 'Claims variable 72H rewards according to seat type, weight, and cadence.',
    },
    {
      name: 'pauseRewards',
      sender: 'multisig',
      description: 'Pauses reward claims during incidents without affecting principal vaults.',
    },
  ],
  events: [
    {
      name: 'RewardPoolFunded',
      description: 'An application reward pool receives 72H reward funding.',
    },
    {
      name: 'RewardClaimed',
      description: 'A Reserve or Alpha seat claims available 72H rewards.',
    },
  ],
  nextImplementationSteps: [
    'Wire audited Jetton transfer dispatch for reward claims.',
    'Expose cumulative reward-per-weight getters for indexer reconciliation.',
    'Add pause controls through AdminAuthority.',
  ],
};

function seatKey(app: CapitalAppSlug, seatType: CapitalSeatType, seatNumber: number) {
  return `${app}:${seatType}:${seatNumber}` as const;
}

export class AppRewardPool {
  private readonly availableRewardsByApp = new Map<CapitalAppSlug, bigint>();
  private readonly cumulativeRewardPerWeightByApp = new Map<CapitalAppSlug, bigint>();
  private readonly claimedScaledBySeat = new Map<string, bigint>();
  private readonly lastClaimAt = new Map<string, number>();
  private readonly fundingHistory: RewardPoolFunding[] = [];
  private readonly claimHistory: RewardClaim[] = [];

  constructor(
    readonly registry: CapitalRegistry,
    readonly config: AppRewardPoolConfig = appRewardPoolBlueprint.config,
  ) {}

  fundRewards(input: RewardFundingInput): RewardPoolSnapshot {
    this.assertPositiveAmount(input.amount72H);
    const totalWeight = this.getTotalRewardWeight(input.app);

    if (totalWeight <= 0n) {
      throw new Error(`Cannot fund ${input.app} RewardPool before eligible seats exist.`);
    }

    const increment = (input.amount72H * REWARD_SCALE) / totalWeight;
    const current = this.cumulativeRewardPerWeightByApp.get(input.app) ?? 0n;
    this.cumulativeRewardPerWeightByApp.set(input.app, current + increment);
    this.availableRewardsByApp.set(input.app, this.getAvailableRewards72H(input.app) + input.amount72H);
    this.fundingHistory.push({
      fundingId: `${input.app}:reward-funding:${this.fundingHistory.length + 1}`,
      app: input.app,
      amount72H: input.amount72H,
      fundedAtUnix: input.timestamp,
    });

    return this.getSnapshot(input.app);
  }

  claimReward(input: RewardClaimInput): RewardClaim {
    if (input.seatType === 'alpha') {
      throw new Error('Alpha rewards are closed for v1.');
    }

    const seat = input.seatType === 'reserve'
      ? this.registry.getReserveSeatByOwner(input.app, input.owner)
      : this.registry.getAlphaSeatByOwner(input.app, input.owner);

    if (!seat) {
      throw new Error(`No ${input.seatType} seat found for ${input.owner} on ${input.app}.`);
    }

    if (input.seatType === 'reserve' && seat.status !== 'active' && seat.status !== 'matured') {
      throw new Error('Reserve rewards require an active or matured reserve seat.');
    }

    const key = seatKey(input.app, input.seatType, seat.seatNumber);
    const lastClaimAt = this.lastClaimAt.get(key);
    const cadence = this.config.reserveClaimIntervalSeconds;

    if (lastClaimAt !== undefined && input.timestamp - lastClaimAt < cadence) {
      throw new Error(`${input.seatType} reward cannot be claimed yet.`);
    }

    const claimable = this.getClaimableReward72H(input.app, input.seatType, seat.seatNumber);

    if (claimable <= 0n) {
      throw new Error('No app reward is available to claim.');
    }

    const scaledClaim = claimable * REWARD_SCALE;
    this.claimedScaledBySeat.set(key, (this.claimedScaledBySeat.get(key) ?? 0n) + scaledClaim);
    this.availableRewardsByApp.set(input.app, this.getAvailableRewards72H(input.app) - claimable);
    this.lastClaimAt.set(key, input.timestamp);

    const claim: RewardClaim = {
      claimId: `${key}:reward-claim:${this.claimHistory.length + 1}`,
      app: input.app,
      seatType: input.seatType,
      seatNumber: seat.seatNumber,
      owner: input.owner,
      amount72H: claimable,
      claimedAtUnix: input.timestamp,
    };
    this.claimHistory.push(claim);
    return claim;
  }

  getClaimableReward72H(app: CapitalAppSlug, seatType: CapitalSeatType, seatNumber: number) {
    const key = seatKey(app, seatType, seatNumber);
    const weight = BigInt(this.getWeight(seatType));
    const cumulative = this.cumulativeRewardPerWeightByApp.get(app) ?? 0n;
    const entitledScaled = cumulative * weight;
    const claimedScaled = this.claimedScaledBySeat.get(key) ?? 0n;

    if (entitledScaled <= claimedScaled) {
      return 0n;
    }

    return (entitledScaled - claimedScaled) / REWARD_SCALE;
  }

  getSnapshot(app: CapitalAppSlug): RewardPoolSnapshot {
    return {
      app,
      availableRewards72H: this.getAvailableRewards72H(app),
      cumulativeRewardPerWeightScaled: this.cumulativeRewardPerWeightByApp.get(app) ?? 0n,
      totalRewardWeight: this.getTotalRewardWeight(app),
      funded72H: this.fundingHistory.filter((entry) => entry.app === app).reduce((sum, entry) => sum + entry.amount72H, 0n),
      claimed72H: this.claimHistory.filter((entry) => entry.app === app).reduce((sum, entry) => sum + entry.amount72H, 0n),
    };
  }

  private getAvailableRewards72H(app: CapitalAppSlug) {
    return this.availableRewardsByApp.get(app) ?? 0n;
  }

  private getTotalRewardWeight(app: CapitalAppSlug) {
    const reserveWeight = this.registry
      .listReserveSeats(app)
      .filter((seat) => seat.status === 'active' || seat.status === 'matured')
      .length * this.config.reserveWeight;
    return BigInt(reserveWeight);
  }

  private getWeight(seatType: CapitalSeatType) {
    return seatType === 'alpha' ? this.config.alphaWeight : this.config.reserveWeight;
  }

  private assertPositiveAmount(amount72H: bigint) {
    if (amount72H <= 0n) {
      throw new Error('Reward amount must be positive.');
    }
  }
}
