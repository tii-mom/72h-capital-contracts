import type {
  AlphaCycleLifecycleStatus,
  AlphaCycleStorageKey,
  AlphaSeatLifecycleStatus,
  CapitalOwnerStorageKey,
  CapitalSeatLifecycleStatus,
  CapitalSeatStorageKey,
  ReserveLotLifecycleStatus,
  ReserveLotStorageKey,
  ReserveSeatLifecycleStatus,
} from './lifecycle.js';

export type CapitalAppSlug = '72hours' | 'wan' | 'multi-millionaire';

export type CapitalSeatType = 'reserve' | 'alpha';

export type CapitalSeatStatus = CapitalSeatLifecycleStatus;

export type ReserveSeatStatus = ReserveSeatLifecycleStatus;

export type AlphaSeatStatus = AlphaSeatLifecycleStatus;

export type CapitalSeatStorageIdentityKey = CapitalSeatStorageKey;
export type CapitalOwnerStorageIdentityKey = CapitalOwnerStorageKey;
export type ReserveLotStorageIdentityKey = ReserveLotStorageKey;
export type AlphaCycleStorageIdentityKey = AlphaCycleStorageKey;

export type AlphaCycleStatus = AlphaCycleLifecycleStatus;

export interface CapitalSeatStorageRecord {
  readonly storageKey: CapitalSeatStorageKey;
  readonly ownerStorageKey: CapitalOwnerStorageKey;
  readonly app: CapitalAppSlug;
  readonly seatType: CapitalSeatType;
  readonly seatNumber: number;
  readonly owner: string;
  readonly status: CapitalSeatLifecycleStatus;
}

export type RewardTokenSymbol = '72H';

export type GasPayer = 'user';

export interface SharedCapitalRules {
  readonly rewardToken: RewardTokenSymbol;
  readonly gasPayer: GasPayer;
}

export interface ReserveRules {
  readonly seatCap: number;
  readonly threshold72H: bigint;
  readonly lockDurationSeconds: number;
  readonly rewardClaimIntervalSeconds: number;
  readonly topUpsAreLotBased: true;
  readonly partialRedemptionAllowed: true;
  readonly insufficientLiquidityQueuesRequests: false;
  readonly principalRedeemedFromVault: true;
  readonly rewardsUseAppRewardPool: true;
  readonly seatNeverReleased: true;
  readonly fullRedemptionStatus: 'historical';
  readonly reallocationStatus: 'active';
}

export interface AlphaRules {
  readonly seatCap: number;
  readonly durationSeconds: number;
  readonly settlementIntervalSeconds: number;
  readonly principalRedeemable: false;
  readonly topUpsAllowed: true;
  readonly completedStatus: 'completed';
  readonly thresholds72H: Readonly<Record<CapitalAppSlug, bigint>>;
}

export interface CapitalRulebook {
  readonly shared: SharedCapitalRules;
  readonly reserve: ReserveRules;
  readonly alpha: AlphaRules;
}

export interface CapitalSeatIdentity {
  readonly app: CapitalAppSlug;
  readonly seatType: CapitalSeatType;
  readonly seatNumber: number;
  readonly owner: string;
  readonly status: CapitalSeatLifecycleStatus;
}

export interface ReserveSeatRecord extends CapitalSeatIdentity {
  readonly seatType: 'reserve';
  readonly status: ReserveSeatLifecycleStatus;
  readonly assignedAtUnix: number;
  readonly historicalAtUnix?: number;
  readonly lastActivatedAtUnix: number;
}

export interface ReserveLot {
  readonly lotId: string;
  readonly seatNumber: number;
  readonly app: CapitalAppSlug;
  readonly amount72H: bigint;
  readonly allocatedAtUnix: number;
  readonly unlockAtUnix: number;
  redeemedAmount72H: bigint;
}

export interface ReserveLotStorageRecord {
  readonly storageKey: ReserveLotStorageKey;
  readonly app: CapitalAppSlug;
  readonly seatNumber: number;
  readonly lotId: string;
  readonly amount72H: bigint;
  readonly allocatedAtUnix: number;
  readonly unlockAtUnix: number;
  readonly redeemedAmount72H: bigint;
  readonly lifecycleStatus: ReserveLotLifecycleStatus;
}

export interface RedemptionRequest {
  readonly requestId: string;
  readonly seatNumber: number;
  readonly app: CapitalAppSlug;
  readonly requestedAmount72H: bigint;
  readonly createdAtUnix: number;
  readonly queued: false;
}

export interface QueuedRedemptionRequest extends RedemptionRequest {
  readonly owner: string;
}

export type RewardSeatType = CapitalSeatType;

export interface RewardPoolFunding {
  readonly fundingId: string;
  readonly app: CapitalAppSlug;
  readonly amount72H: bigint;
  readonly fundedAtUnix: number;
}

export interface RewardClaim {
  readonly claimId: string;
  readonly app: CapitalAppSlug;
  readonly seatType: RewardSeatType;
  readonly seatNumber: number;
  readonly owner: string;
  readonly amount72H: bigint;
  readonly claimedAtUnix: number;
}

export interface AlphaCycle {
  readonly app: CapitalAppSlug;
  readonly seatNumber: number;
  readonly cycleNumber: number;
  readonly startsAtUnix: number;
  readonly settlesAtUnix: number;
  readonly settledReward72H: bigint;
  readonly claimedReward72H: bigint;
  readonly claimedAtUnix?: number;
  readonly completed: boolean;
}

export interface AlphaCycleStorageRecord {
  readonly storageKey: AlphaCycleStorageKey;
  readonly app: CapitalAppSlug;
  readonly seatNumber: number;
  readonly cycleNumber: number;
  readonly startsAtUnix: number;
  readonly settlesAtUnix: number;
  readonly settledReward72H: bigint;
  readonly claimedReward72H: bigint;
  readonly claimedAtUnix?: number;
  readonly lifecycleStatus: AlphaCycleLifecycleStatus;
}

export interface AlphaTopUp {
  readonly topUpId: string;
  readonly seatNumber: number;
  readonly app: CapitalAppSlug;
  readonly amount72H: bigint;
  readonly toppedUpAtUnix: number;
}

export interface AlphaSeatRecord extends CapitalSeatIdentity {
  readonly seatType: 'alpha';
  readonly status: AlphaSeatLifecycleStatus;
  readonly assignedAtUnix: number;
  readonly completedAtUnix?: number;
  readonly lastActivatedAtUnix: number;
}

export interface AlphaPosition {
  readonly app: CapitalAppSlug;
  readonly seatNumber: number;
  readonly owner: string;
  readonly principal72H: bigint;
  readonly allocatedAtUnix: number;
  readonly completesAtUnix: number;
  readonly status: AlphaSeatLifecycleStatus;
  readonly completedAtUnix?: number;
  readonly lastSettlementAtUnix?: number;
  readonly lastClaimAtUnix?: number;
  readonly settledReward72H: bigint;
  readonly claimableReward72H: bigint;
}
