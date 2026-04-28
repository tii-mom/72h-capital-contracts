import { daysToSeconds, weeksToSeconds } from '../utils/time.js';
import type { CapitalAppSlug, CapitalRulebook } from '../types/domain.js';

export const CAPITAL_APP_SLUGS = ['72hours', 'wan', 'multi-millionaire'] as const satisfies readonly CapitalAppSlug[];

export const ALPHA_THRESHOLDS_72H: Readonly<Record<CapitalAppSlug, bigint>> = {
  '72hours': 72_000n,
  wan: 72_000n,
  'multi-millionaire': 720_000n,
};

export const CAPITAL_RULEBOOK: CapitalRulebook = {
  shared: {
    rewardToken: '72H',
    gasPayer: 'user',
  },
  reserve: {
    seatCap: 72,
    threshold72H: 720n,
    lockDurationSeconds: daysToSeconds(72),
    rewardClaimIntervalSeconds: daysToSeconds(7),
    topUpsAreLotBased: true,
    partialRedemptionAllowed: true,
    insufficientLiquidityQueuesRequests: false,
    principalRedeemedFromVault: true,
    rewardsUseAppRewardPool: true,
    seatNeverReleased: true,
    fullRedemptionStatus: 'historical',
    reallocationStatus: 'active',
  },
  alpha: {
    seatCap: 9,
    durationSeconds: weeksToSeconds(72),
    settlementIntervalSeconds: weeksToSeconds(7),
    principalRedeemable: false,
    topUpsAllowed: true,
    completedStatus: 'completed',
    thresholds72H: ALPHA_THRESHOLDS_72H,
  },
};

export const getAlphaThreshold72H = (app: CapitalAppSlug): bigint => ALPHA_THRESHOLDS_72H[app];
