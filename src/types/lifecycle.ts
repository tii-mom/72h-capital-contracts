export type CapitalSeatLifecycleStatus =
  | 'available'
  | 'locked'
  | 'active'
  | 'matured'
  | 'historical'
  | 'completed';

export type ReserveSeatLifecycleStatus = Extract<
  CapitalSeatLifecycleStatus,
  'available' | 'locked' | 'active' | 'matured' | 'historical'
>;

export type AlphaSeatLifecycleStatus = Extract<CapitalSeatLifecycleStatus, 'available' | 'active' | 'completed'>;

export type ReserveLotLifecycleStatus = 'locked' | 'matured' | 'partially_redeemed' | 'redeemed';

export type AlphaCycleLifecycleStatus = 'scheduled' | 'settled' | 'claimed' | 'completed';

export type CapitalSeatStorageKey = `${string}:${'reserve' | 'alpha'}:${number}`;
export type CapitalOwnerStorageKey = `${string}:${string}`;
export type ReserveLotStorageKey = `${string}:${number}:${string}`;
export type AlphaCycleStorageKey = `${string}:${number}:${number}`;

export const CAPITAL_SEAT_LIFECYCLE_STATUSES = [
  'available',
  'locked',
  'active',
  'matured',
  'historical',
  'completed',
] as const satisfies readonly CapitalSeatLifecycleStatus[];

export const RESERVE_SEAT_LIFECYCLE_STATUSES = [
  'available',
  'locked',
  'active',
  'matured',
  'historical',
] as const satisfies readonly ReserveSeatLifecycleStatus[];

export const ALPHA_SEAT_LIFECYCLE_STATUSES = ['available', 'active', 'completed'] as const satisfies readonly AlphaSeatLifecycleStatus[];

export const RESERVE_LOT_LIFECYCLE_STATUSES = [
  'locked',
  'matured',
  'partially_redeemed',
  'redeemed',
] as const satisfies readonly ReserveLotLifecycleStatus[];

export const ALPHA_CYCLE_LIFECYCLE_STATUSES = [
  'scheduled',
  'settled',
  'claimed',
  'completed',
] as const satisfies readonly AlphaCycleLifecycleStatus[];

export const CAPITAL_SEAT_TERMINAL_STATUSES = ['historical', 'completed'] as const satisfies readonly Extract<
  CapitalSeatLifecycleStatus,
  'historical' | 'completed'
>[];

export interface ReserveLotLifecycleSnapshot {
  readonly amount72H: bigint;
  readonly redeemedAmount72H: bigint;
  readonly unlockAtUnix: number;
}

export interface AlphaCycleLifecycleSnapshot {
  readonly settledReward72H: bigint;
  readonly claimedReward72H: bigint;
  readonly claimedAtUnix?: number;
  readonly completed: boolean;
}

export const formatCapitalSeatStorageKey = (
  app: string,
  seatType: 'reserve' | 'alpha',
  seatNumber: number,
): CapitalSeatStorageKey => `${app}:${seatType}:${seatNumber}`;

export const formatCapitalOwnerStorageKey = (app: string, owner: string): CapitalOwnerStorageKey =>
  `${app}:${owner}`;

export const formatReserveLotStorageKey = (
  app: string,
  seatNumber: number,
  lotId: string,
): ReserveLotStorageKey => `${app}:${seatNumber}:${lotId}`;

export const formatAlphaCycleStorageKey = (
  app: string,
  seatNumber: number,
  cycleNumber: number,
): AlphaCycleStorageKey => `${app}:${seatNumber}:${cycleNumber}`;

export const getReserveLotLifecycleStatus = (
  snapshot: ReserveLotLifecycleSnapshot,
  timestamp: number,
): ReserveLotLifecycleStatus => {
  if (snapshot.redeemedAmount72H >= snapshot.amount72H) {
    return 'redeemed';
  }

  if (timestamp < snapshot.unlockAtUnix) {
    return 'locked';
  }

  if (snapshot.redeemedAmount72H > 0n) {
    return 'partially_redeemed';
  }

  return 'matured';
};

export const getAlphaCycleLifecycleStatus = (snapshot: AlphaCycleLifecycleSnapshot): AlphaCycleLifecycleStatus => {
  if (snapshot.completed) {
    return 'completed';
  }

  if (snapshot.claimedAtUnix !== undefined || snapshot.claimedReward72H > 0n) {
    return 'claimed';
  }

  if (snapshot.settledReward72H > 0n) {
    return 'settled';
  }

  return 'scheduled';
};

export const isCapitalSeatTerminalStatus = (status: CapitalSeatLifecycleStatus): boolean =>
  CAPITAL_SEAT_TERMINAL_STATUSES.includes(status as (typeof CAPITAL_SEAT_TERMINAL_STATUSES)[number]);

export const isReserveSeatTerminalStatus = (status: ReserveSeatLifecycleStatus): boolean => status === 'historical';

export const isAlphaSeatTerminalStatus = (status: AlphaSeatLifecycleStatus): boolean => status === 'completed';
