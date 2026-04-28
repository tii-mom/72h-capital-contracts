import { describe, expect, it } from 'vitest';

import { ALPHA_THRESHOLDS_72H, CAPITAL_RULEBOOK } from '../src/config/capital.constants.js';
import { NETWORKS } from '../src/config/networks.js';
import { AppRewardPool, appRewardPoolBlueprint } from '../src/contracts/AppRewardPool.js';
import { AlphaVault, alphaVaultBlueprint } from '../src/contracts/AlphaVault.js';
import { adminMultisigBlueprint } from '../src/contracts/AdminMultisig.js';
import { CapitalRegistry, capitalRegistryBlueprint } from '../src/contracts/CapitalRegistry.js';
import { ReserveVault, reserveVaultBlueprint } from '../src/contracts/ReserveVault.js';
import { testJettonBlueprint } from '../src/contracts/TestJetton.js';
import {
  ALPHA_CYCLE_LIFECYCLE_STATUSES,
  ALPHA_SEAT_LIFECYCLE_STATUSES,
  CAPITAL_SEAT_LIFECYCLE_STATUSES,
  CAPITAL_SEAT_TERMINAL_STATUSES,
  RESERVE_LOT_LIFECYCLE_STATUSES,
  RESERVE_SEAT_LIFECYCLE_STATUSES,
  formatAlphaCycleStorageKey,
  formatCapitalOwnerStorageKey,
  formatCapitalSeatStorageKey,
  formatReserveLotStorageKey,
  getAlphaCycleLifecycleStatus,
  getReserveLotLifecycleStatus,
  isAlphaSeatTerminalStatus,
  isCapitalSeatTerminalStatus,
  isReserveSeatTerminalStatus,
} from '../src/types/lifecycle.js';
import { daysToSeconds, weeksToSeconds } from '../src/utils/time.js';

const DAY = daysToSeconds(1);

describe('capital rulebook', () => {
  it('locks reserve rules to the agreed business constraints', () => {
    expect(CAPITAL_RULEBOOK.reserve.seatCap).toBe(72);
    expect(CAPITAL_RULEBOOK.reserve.threshold72H).toBe(720n);
    expect(CAPITAL_RULEBOOK.reserve.lockDurationSeconds).toBe(daysToSeconds(72));
    expect(CAPITAL_RULEBOOK.reserve.rewardClaimIntervalSeconds).toBe(daysToSeconds(7));
    expect(CAPITAL_RULEBOOK.reserve.topUpsAreLotBased).toBe(true);
    expect(CAPITAL_RULEBOOK.reserve.partialRedemptionAllowed).toBe(true);
    expect(CAPITAL_RULEBOOK.reserve.insufficientLiquidityQueuesRequests).toBe(false);
    expect(CAPITAL_RULEBOOK.reserve.principalRedeemedFromVault).toBe(true);
    expect(CAPITAL_RULEBOOK.reserve.rewardsUseAppRewardPool).toBe(true);
    expect(CAPITAL_RULEBOOK.reserve.seatNeverReleased).toBe(true);
    expect(CAPITAL_RULEBOOK.reserve.fullRedemptionStatus).toBe('historical');
    expect(CAPITAL_RULEBOOK.reserve.reallocationStatus).toBe('active');
  });

  it('locks alpha rules to the agreed business constraints', () => {
    expect(CAPITAL_RULEBOOK.alpha.seatCap).toBe(9);
    expect(CAPITAL_RULEBOOK.alpha.durationSeconds).toBe(weeksToSeconds(72));
    expect(CAPITAL_RULEBOOK.alpha.settlementIntervalSeconds).toBe(weeksToSeconds(7));
    expect(CAPITAL_RULEBOOK.alpha.principalRedeemable).toBe(false);
    expect(CAPITAL_RULEBOOK.alpha.topUpsAllowed).toBe(true);
    expect(CAPITAL_RULEBOOK.alpha.completedStatus).toBe('completed');
  });

  it('locks app-specific alpha thresholds', () => {
    expect(ALPHA_THRESHOLDS_72H['72hours']).toBe(72_000n);
    expect(ALPHA_THRESHOLDS_72H.wan).toBe(72_000n);
    expect(ALPHA_THRESHOLDS_72H['multi-millionaire']).toBe(720_000n);
  });

  it('locks shared token and gas rules', () => {
    expect(CAPITAL_RULEBOOK.shared.rewardToken).toBe('72H');
    expect(CAPITAL_RULEBOOK.shared.gasPayer).toBe('user');
  });

  it('locks deployment environment boundaries for testnet and mainnet jettons', () => {
    expect(NETWORKS.testnet.deployerAddressEnv).toBe('TON_TESTNET_DEPLOYER_ADDRESS');
    expect(NETWORKS.testnet.jetton.masterAddressEnv).toBe('TON_TESTNET_72H_JETTON_MASTER_ADDRESS');
    expect(NETWORKS.testnet.jetton.modeEnv).toBe('TON_TESTNET_72H_JETTON_MODE');
    expect(NETWORKS.testnet.jetton.testnetMockAllowed).toBe(true);
    expect(NETWORKS.mainnet.deployerAddressEnv).toBe('TON_MAINNET_DEPLOYER_ADDRESS');
    expect(NETWORKS.mainnet.jetton.masterAddressEnv).toBe('TON_MAINNET_72H_JETTON_MASTER_ADDRESS');
    expect(NETWORKS.mainnet.jetton.mainnetMasterRequired).toBe(true);
    expect(NETWORKS.mainnet.jetton.testnetMockAllowed).toBe(false);
  });
});

describe('capital lifecycle helpers', () => {
  it('keeps the explicit lifecycle vocabularies aligned with the business model', () => {
    expect(CAPITAL_SEAT_LIFECYCLE_STATUSES).toEqual([
      'available',
      'locked',
      'active',
      'matured',
      'historical',
      'completed',
    ]);

    expect(RESERVE_SEAT_LIFECYCLE_STATUSES).toEqual([
      'available',
      'locked',
      'active',
      'matured',
      'historical',
    ]);

    expect(ALPHA_SEAT_LIFECYCLE_STATUSES).toEqual(['available', 'active', 'completed']);
    expect(RESERVE_LOT_LIFECYCLE_STATUSES).toEqual(['locked', 'matured', 'partially_redeemed', 'redeemed']);
    expect(ALPHA_CYCLE_LIFECYCLE_STATUSES).toEqual(['scheduled', 'settled', 'claimed', 'completed']);
    expect(CAPITAL_SEAT_TERMINAL_STATUSES).toEqual(['historical', 'completed']);
  });

  it('derives reserve lot lifecycle status from maturity and redemption state', () => {
    expect(getReserveLotLifecycleStatus({ amount72H: 1_000n, redeemedAmount72H: 0n, unlockAtUnix: 1_000 }, 999)).toBe(
      'locked',
    );
    expect(getReserveLotLifecycleStatus({ amount72H: 1_000n, redeemedAmount72H: 0n, unlockAtUnix: 1_000 }, 1_000)).toBe(
      'matured',
    );
    expect(
      getReserveLotLifecycleStatus({ amount72H: 1_000n, redeemedAmount72H: 250n, unlockAtUnix: 1_000 }, 1_000),
    ).toBe('partially_redeemed');
    expect(
      getReserveLotLifecycleStatus({ amount72H: 1_000n, redeemedAmount72H: 1_000n, unlockAtUnix: 1_000 }, 1_000),
    ).toBe('redeemed');
  });

  it('derives alpha cycle lifecycle status from settlement, claim, and completion state', () => {
    expect(
      getAlphaCycleLifecycleStatus({
        settledReward72H: 0n,
        claimedReward72H: 0n,
        completed: false,
      }),
    ).toBe('scheduled');

    expect(
      getAlphaCycleLifecycleStatus({
        settledReward72H: 1_000n,
        claimedReward72H: 0n,
        completed: false,
      }),
    ).toBe('settled');

    expect(
      getAlphaCycleLifecycleStatus({
        settledReward72H: 1_000n,
        claimedReward72H: 1_000n,
        claimedAtUnix: 1_710_000_000,
        completed: false,
      }),
    ).toBe('claimed');

    expect(
      getAlphaCycleLifecycleStatus({
        settledReward72H: 1_000n,
        claimedReward72H: 1_000n,
        claimedAtUnix: 1_710_000_000,
        completed: true,
      }),
    ).toBe('completed');
  });

  it('formats deterministic storage keys for on-chain compatible state records', () => {
    expect(formatCapitalSeatStorageKey('72hours', 'reserve', 7)).toBe('72hours:reserve:7');
    expect(formatCapitalSeatStorageKey('wan', 'alpha', 3)).toBe('wan:alpha:3');
    expect(formatCapitalOwnerStorageKey('multi-millionaire', 'wallet-a')).toBe('multi-millionaire:wallet-a');
    expect(formatReserveLotStorageKey('72hours', 2, 'lot-9')).toBe('72hours:2:lot-9');
    expect(formatAlphaCycleStorageKey('wan', 1, 4)).toBe('wan:1:4');
  });

  it('marks only historical reserve and completed alpha seats as terminal', () => {
    expect(isReserveSeatTerminalStatus('historical')).toBe(true);
    expect(isReserveSeatTerminalStatus('active')).toBe(false);
    expect(isAlphaSeatTerminalStatus('completed')).toBe(true);
    expect(isAlphaSeatTerminalStatus('active')).toBe(false);
    expect(isCapitalSeatTerminalStatus('historical')).toBe(true);
    expect(isCapitalSeatTerminalStatus('completed')).toBe(true);
  });
});

describe('contract blueprints', () => {
  it('documents reserve-specific invariants in the reserve vault', () => {
    expect(reserveVaultBlueprint.invariants).toContain('A reserve seat requires at least 720 72H.');
    expect(reserveVaultBlueprint.invariants).toContain(
      'Each reserve lot stays locked for 72 days from its own allocation timestamp.',
    );
    expect(reserveVaultBlueprint.invariants).toContain(
      'Matured principal is redeemed from the same ReserveVault; no external liquidity queue exists.',
    );
  });

  it('documents alpha-specific invariants in the alpha vault', () => {
    expect(alphaVaultBlueprint.invariants).toContain('Alpha principal is non-redeemable once allocated.');
    expect(alphaVaultBlueprint.invariants).toContain('Settlement executes every 7 weeks.');
    expect(alphaVaultBlueprint.invariants).toContain('After 72 weeks the seat becomes completed.');
  });

  it('documents seat lifecycle control in the registry', () => {
    expect(capitalRegistryBlueprint.invariants).toContain('Reserve seat cap is 72 per app.');
    expect(capitalRegistryBlueprint.invariants).toContain('Alpha seat cap is 9 per app.');
    expect(capitalRegistryBlueprint.invariants).toContain('Seat identifiers are never released once assigned.');
  });

  it('documents 72H-only rewards in the app reward pool', () => {
    expect(appRewardPoolBlueprint.config.rewardToken).toBe('72H');
    expect(appRewardPoolBlueprint.config.reserveWeight).toBe(1);
    expect(appRewardPoolBlueprint.config.alphaWeight).toBe(10);
    expect(appRewardPoolBlueprint.config.principalIsolation).toBe(true);
    expect(appRewardPoolBlueprint.invariants).toContain(
      'RewardPool holds rewards only; it never receives or redeems Reserve or Alpha principal.',
    );
  });

  it('documents the testnet-only 72H Jetton rehearsal boundary', () => {
    expect(testJettonBlueprint.config.symbol).toBe('72H');
    expect(testJettonBlueprint.config.decimals).toBe(9);
    expect(testJettonBlueprint.config.networkScope).toBe('testnet-only');
    expect(testJettonBlueprint.config.mainnetAllowed).toBe(false);
    expect(testJettonBlueprint.invariants).toContain(
      'TestJetton72H is testnet-only and must never be referenced by mainnet deployment manifests.',
    );
  });

  it('documents privileged governance assumptions in the admin authority', () => {
    expect(adminMultisigBlueprint.config.signerCount).toBe(1);
    expect(adminMultisigBlueprint.config.minApprovals).toBe(1);
    expect(adminMultisigBlueprint.config.approvalModel).toBe('single-admin');
    expect(adminMultisigBlueprint.config.replayProtection).toBe('operation-id + nonce + target');
    expect(adminMultisigBlueprint.config.manages).toEqual([
      'CapitalRegistry',
      'ReserveVault',
      'AlphaVault',
      'AppRewardPool',
    ]);
    expect(adminMultisigBlueprint.invariants).toContain(
      'Privileged operations require administrator approval before execution.',
    );
    expect(adminMultisigBlueprint.invariants).toContain(
      'Emergency controls can pause write paths but cannot rewrite completed seat history.',
    );
  });
});

describe('CapitalRegistry + ReserveVault state machine', () => {
  function createSystem() {
    const registry = new CapitalRegistry();
    const reserveVault = new ReserveVault(registry);
    return { registry, reserveVault };
  }

  it('assigns one reserve seat per owner and reuses the same seat on reactivation', () => {
    const { registry, reserveVault } = createSystem();
    const allocatedAt = 1_710_000_000;

    const firstPosition = reserveVault.allocateReserve({
      app: '72hours',
      owner: 'wallet-a',
      amount72H: 720n,
      timestamp: allocatedAt,
    });

    expect(firstPosition.seat.seatNumber).toBe(1);
    expect(firstPosition.seat.status).toBe('active');

    const firstRedeem = reserveVault.redeemReserve({
      app: '72hours',
      owner: 'wallet-a',
      requestedAmount72H: 720n,
      timestamp: allocatedAt + CAPITAL_RULEBOOK.reserve.lockDurationSeconds,
    });
    reserveVault.finalizeRedemption(firstRedeem.requestId, allocatedAt + CAPITAL_RULEBOOK.reserve.lockDurationSeconds);

    expect(registry.getReserveSeatByOwner('72hours', 'wallet-a')?.status).toBe('historical');

    const reactivated = reserveVault.allocateReserve({
      app: '72hours',
      owner: 'wallet-a',
      amount72H: 900n,
      timestamp: allocatedAt + CAPITAL_RULEBOOK.reserve.lockDurationSeconds + DAY,
    });

    expect(reactivated.seat.seatNumber).toBe(1);
    expect(reactivated.seat.status).toBe('active');
  });

  it('enforces reserve seat capacity per app', () => {
    const { reserveVault } = createSystem();
    const allocatedAt = 1_710_000_000;

    for (let index = 0; index < CAPITAL_RULEBOOK.reserve.seatCap; index += 1) {
      reserveVault.allocateReserve({
        app: 'wan',
        owner: `wallet-${index}`,
        amount72H: 720n,
        timestamp: allocatedAt + index,
      });
    }

    expect(() =>
      reserveVault.allocateReserve({
        app: 'wan',
        owner: 'wallet-overflow',
        amount72H: 720n,
        timestamp: allocatedAt + 999,
      }),
    ).toThrow(/capacity reached/i);
  });

  it('keeps reserve owner lookup scoped per app', () => {
    const { registry, reserveVault } = createSystem();
    const allocatedAt = 1_710_000_000;

    for (const app of ['72hours', 'wan', 'multi-millionaire'] as const) {
      reserveVault.allocateReserve({
        app,
        owner: 'wallet-cross-app',
        amount72H: 720n,
        timestamp: allocatedAt,
      });
    }

    expect(registry.getReserveSeatByOwner('72hours', 'wallet-cross-app')?.seatNumber).toBe(1);
    expect(registry.getReserveSeatByOwner('wan', 'wallet-cross-app')?.seatNumber).toBe(1);
    expect(registry.getReserveSeatByOwner('multi-millionaire', 'wallet-cross-app')?.seatNumber).toBe(1);
    expect(registry.listReserveSeats('72hours')).toHaveLength(1);
    expect(registry.listReserveSeats('wan')).toHaveLength(1);
    expect(registry.listReserveSeats('multi-millionaire')).toHaveLength(1);
  });

  it('creates independent lots for top-ups and keeps their unlock times separate', () => {
    const { reserveVault } = createSystem();
    const allocatedAt = 1_710_000_000;

    reserveVault.allocateReserve({
      app: '72hours',
      owner: 'wallet-a',
      amount72H: 720n,
      timestamp: allocatedAt,
    });

    reserveVault.topUpReserve({
      app: '72hours',
      owner: 'wallet-a',
      amount72H: 400n,
      timestamp: allocatedAt + DAY,
    });

    const position = reserveVault.getSeatSnapshot('72hours', 'wallet-a', allocatedAt + DAY);
    expect(position.lots).toHaveLength(2);
    expect(position.lots[0]!.unlockAtUnix).toBe(allocatedAt + CAPITAL_RULEBOOK.reserve.lockDurationSeconds);
    expect(position.lots[1]!.unlockAtUnix).toBe(allocatedAt + DAY + CAPITAL_RULEBOOK.reserve.lockDurationSeconds);
  });

  it('allows partial redemption against matured lots only', () => {
    const { reserveVault } = createSystem();
    const allocatedAt = 1_710_000_000;

    reserveVault.allocateReserve({
      app: '72hours',
      owner: 'wallet-a',
      amount72H: 2_000n,
      timestamp: allocatedAt,
    });

    const redeemed = reserveVault.redeemReserve({
      app: '72hours',
      owner: 'wallet-a',
      requestedAmount72H: 500n,
      timestamp: allocatedAt + CAPITAL_RULEBOOK.reserve.lockDurationSeconds,
    });

    expect(redeemed.outcome).toBe('pending');
    expect(redeemed.redeemedAmount72H).toBe(500n);
    reserveVault.finalizeRedemption(redeemed.requestId, allocatedAt + CAPITAL_RULEBOOK.reserve.lockDurationSeconds);

    const position = reserveVault.getSeatSnapshot(
      '72hours',
      'wallet-a',
      allocatedAt + CAPITAL_RULEBOOK.reserve.lockDurationSeconds,
    );

    expect(position.totalPrincipal72H).toBe(1_500n);
    expect(position.seat.status).toBe('active');
  });

  it('rejects redemption when maturity is not yet reached', () => {
    const { reserveVault } = createSystem();
    const allocatedAt = 1_710_000_000;

    reserveVault.allocateReserve({
      app: 'wan',
      owner: 'wallet-b',
      amount72H: 1_000n,
      timestamp: allocatedAt,
    });

    expect(() =>
      reserveVault.redeemReserve({
        app: 'wan',
        owner: 'wallet-b',
        requestedAmount72H: 400n,
        timestamp: allocatedAt + DAY,
      }),
    ).toThrow(/matured reserve principal/i);
  });

  it('keeps reserve principal custodied and rejects external liquidity operations', () => {
    const { reserveVault } = createSystem();
    const allocatedAt = 1_710_000_000;

    reserveVault.allocateReserve({
      app: '72hours',
      owner: 'wallet-custody',
      amount72H: 1_500n,
      timestamp: allocatedAt,
    });

    expect(reserveVault.getCustodiedPrincipal72H()).toBe(1_500n);
    expect(() => reserveVault.drainLiquidity({ amount72H: 1n })).toThrow(/cannot be drained/i);
    expect(() => reserveVault.addLiquidity({ amount72H: 1n })).toThrow(/AppRewardPool/i);

    const redeem = reserveVault.redeemReserve({
      app: '72hours',
      owner: 'wallet-custody',
      requestedAmount72H: 500n,
      timestamp: allocatedAt + CAPITAL_RULEBOOK.reserve.lockDurationSeconds,
    });

    expect(reserveVault.getCustodiedPrincipal72H()).toBe(1_500n);
    expect(reserveVault.getQueuedRequests('72hours')).toHaveLength(1);
    reserveVault.finalizeRedemption(redeem.requestId, allocatedAt + CAPITAL_RULEBOOK.reserve.lockDurationSeconds);
    expect(reserveVault.getCustodiedPrincipal72H()).toBe(1_000n);
    expect(reserveVault.getQueuedRequests('72hours')).toHaveLength(0);
  });

  it('marks the seat historical after full redemption', () => {
    const { registry, reserveVault } = createSystem();
    const allocatedAt = 1_710_000_000;

    reserveVault.allocateReserve({
      app: 'multi-millionaire',
      owner: 'wallet-mm',
      amount72H: 720n,
      timestamp: allocatedAt,
    });

    const redeem = reserveVault.redeemReserve({
      app: 'multi-millionaire',
      owner: 'wallet-mm',
      requestedAmount72H: 720n,
      timestamp: allocatedAt + CAPITAL_RULEBOOK.reserve.lockDurationSeconds,
    });
    reserveVault.finalizeRedemption(redeem.requestId, allocatedAt + CAPITAL_RULEBOOK.reserve.lockDurationSeconds);

    expect(registry.getReserveSeatByOwner('multi-millionaire', 'wallet-mm')?.status).toBe('historical');
  });

  it('claims app rewards through the isolated RewardPool', () => {
    const registry = new CapitalRegistry();
    const reserveVault = new ReserveVault(registry);
    const rewardPool = new AppRewardPool(registry);
    const allocatedAt = 1_710_000_000;

    reserveVault.allocateReserve({
      app: '72hours',
      owner: 'wallet-reward-reserve',
      amount72H: 720n,
      timestamp: allocatedAt,
    });
    rewardPool.fundRewards({
      app: '72hours',
      amount72H: 1_000n,
      timestamp: allocatedAt + DAY,
    });

    const reserveClaim = rewardPool.claimReward({
      app: '72hours',
      seatType: 'reserve',
      owner: 'wallet-reward-reserve',
      timestamp: allocatedAt + CAPITAL_RULEBOOK.reserve.rewardClaimIntervalSeconds,
    });
    expect(reserveClaim.amount72H).toBe(1_000n);
    expect(() =>
      rewardPool.claimReward({
        app: '72hours',
        seatType: 'alpha',
        owner: 'wallet-reward-alpha',
        timestamp: allocatedAt + CAPITAL_RULEBOOK.alpha.settlementIntervalSeconds,
      }),
    ).toThrow(/alpha rewards are closed/i);

    expect(() =>
      rewardPool.claimReward({
        app: '72hours',
        seatType: 'reserve',
        owner: 'wallet-reward-reserve',
        timestamp: allocatedAt + CAPITAL_RULEBOOK.reserve.rewardClaimIntervalSeconds + DAY,
      }),
    ).toThrow(/reward cannot be claimed yet/i);
  });
});

describe('CapitalRegistry + AlphaVault state machine', () => {
  function createSystem() {
    const registry = new CapitalRegistry();
    const alphaVault = new AlphaVault(registry);
    return { registry, alphaVault };
  }

  it('enforces alpha seat capacity per app', () => {
    const { alphaVault } = createSystem();
    const allocatedAt = 1_710_000_000;

    for (let index = 0; index < CAPITAL_RULEBOOK.alpha.seatCap; index += 1) {
      alphaVault.allocateAlpha({
        app: '72hours',
        owner: `alpha-${index}`,
        amount72H: 72_000n,
        timestamp: allocatedAt + index,
      });
    }

    expect(() =>
      alphaVault.allocateAlpha({
        app: '72hours',
        owner: 'alpha-overflow',
        amount72H: 72_000n,
        timestamp: allocatedAt + 999,
      }),
    ).toThrow(/capacity reached/i);
  });

  it('enforces the app-specific alpha threshold on allocation', () => {
    const { alphaVault } = createSystem();
    const allocatedAt = 1_710_000_000;

    expect(() =>
      alphaVault.allocateAlpha({
        app: 'multi-millionaire',
        owner: 'alpha-under',
        amount72H: ALPHA_THRESHOLDS_72H['multi-millionaire'] - 1n,
        timestamp: allocatedAt,
      }),
    ).toThrow(/at least 720000 72H/i);

    const allocated = alphaVault.allocateAlpha({
      app: 'multi-millionaire',
      owner: 'alpha-qualified',
      amount72H: ALPHA_THRESHOLDS_72H['multi-millionaire'],
      timestamp: allocatedAt,
    });

    expect(allocated.principal72H).toBe(ALPHA_THRESHOLDS_72H['multi-millionaire']);
    expect(allocated.seat.status).toBe('active');
  });

  it('tracks top-ups as additional principal without allowing redemption', () => {
    const { alphaVault } = createSystem();
    const allocatedAt = 1_710_000_000;

    alphaVault.allocateAlpha({
      app: 'wan',
      owner: 'alpha-topup',
      amount72H: 72_000n,
      timestamp: allocatedAt,
    });

    alphaVault.topUpAlpha({
      app: 'wan',
      owner: 'alpha-topup',
      amount72H: 18_000n,
      timestamp: allocatedAt + DAY,
    });

    const snapshot = alphaVault.getSeatSnapshot('wan', 'alpha-topup', allocatedAt + DAY);
    expect(snapshot.principal72H).toBe(90_000n);
    expect(snapshot.topUps).toHaveLength(2);
    expect(() => alphaVault.redeemAlpha('wan', 'alpha-topup')).toThrow(/non-redeemable/i);
  });

  it('rejects early settlement and settles on the 7-week cadence', () => {
    const { alphaVault } = createSystem();
    const allocatedAt = 1_710_000_000;
    const sevenWeeks = weeksToSeconds(7);

    alphaVault.allocateAlpha({
      app: '72hours',
      owner: 'alpha-settle',
      amount72H: 72_000n,
      timestamp: allocatedAt,
    });

    expect(() =>
      alphaVault.settleAlphaCycle({
        app: '72hours',
        owner: 'alpha-settle',
        settledReward72H: 1_000n,
        timestamp: allocatedAt + sevenWeeks - DAY,
      }),
    ).toThrow(/7-week boundary/i);

    const firstSettlement = alphaVault.settleAlphaCycle({
      app: '72hours',
      owner: 'alpha-settle',
      settledReward72H: 1_000n,
      timestamp: allocatedAt + sevenWeeks,
    });

    expect(firstSettlement.settlementCycles).toHaveLength(1);
    expect(firstSettlement.settledReward72H).toBe(1_000n);

    expect(() =>
      alphaVault.settleAlphaCycle({
        app: '72hours',
        owner: 'alpha-settle',
        settledReward72H: 1_000n,
        timestamp: allocatedAt + sevenWeeks * 2 - DAY,
      }),
    ).toThrow(/7-week boundary/i);
  });

  it('claims settled yield only after the interval and only once per settlement window', () => {
    const { alphaVault } = createSystem();
    const allocatedAt = 1_710_000_000;
    const sevenWeeks = weeksToSeconds(7);

    alphaVault.allocateAlpha({
      app: 'wan',
      owner: 'alpha-claim',
      amount72H: 72_000n,
      timestamp: allocatedAt,
    });

    expect(() => alphaVault.claimReward('wan', 'alpha-claim', allocatedAt + sevenWeeks)).toThrow(
      /no settled alpha yield/i,
    );

    alphaVault.settleAlphaCycle({
      app: 'wan',
      owner: 'alpha-claim',
      settledReward72H: 2_500n,
      timestamp: allocatedAt + sevenWeeks,
    });

    const firstClaim = alphaVault.claimReward('wan', 'alpha-claim', allocatedAt + sevenWeeks);
    expect(firstClaim.claimedReward72H).toBe(2_500n);

    expect(() => alphaVault.claimReward('wan', 'alpha-claim', allocatedAt + sevenWeeks + DAY)).toThrow(
      /cannot be claimed yet/i,
    );
  });

  it('marks the seat completed after 72 weeks and keeps principal non-redeemable', () => {
    const { alphaVault } = createSystem();
    const allocatedAt = 1_710_000_000;
    const seventyTwoWeeks = CAPITAL_RULEBOOK.alpha.durationSeconds;

    alphaVault.allocateAlpha({
      app: 'multi-millionaire',
      owner: 'alpha-complete',
      amount72H: ALPHA_THRESHOLDS_72H['multi-millionaire'],
      timestamp: allocatedAt,
    });

    const completed = alphaVault.markCompleted('multi-millionaire', 'alpha-complete', allocatedAt + seventyTwoWeeks);

    expect(completed.seat.status).toBe('completed');
    expect(completed.seat.completedAtUnix).toBe(allocatedAt + seventyTwoWeeks);
    expect(() =>
      alphaVault.topUpAlpha({
        app: 'multi-millionaire',
        owner: 'alpha-complete',
        amount72H: 1_000n,
        timestamp: allocatedAt + seventyTwoWeeks + DAY,
      }),
    ).toThrow(/after completion/i);
    expect(() => alphaVault.redeemAlpha('multi-millionaire', 'alpha-complete')).toThrow(/non-redeemable/i);
  });

  it('does not allow alpha reallocation for the same owner; top-up is the only principal increase path', () => {
    const { alphaVault } = createSystem();
    const allocatedAt = 1_710_000_000;

    alphaVault.allocateAlpha({
      app: '72hours',
      owner: 'alpha-repeat',
      amount72H: 72_000n,
      timestamp: allocatedAt,
    });

    expect(() =>
      alphaVault.allocateAlpha({
        app: '72hours',
        owner: 'alpha-repeat',
        amount72H: 72_000n,
        timestamp: allocatedAt + DAY,
      }),
    ).toThrow(/already exists/i);

    const topUp = alphaVault.topUpAlpha({
      app: '72hours',
      owner: 'alpha-repeat',
      amount72H: 1_000n,
      timestamp: allocatedAt + DAY,
    });

    expect(topUp.seat.seatNumber).toBe(1);
    expect(topUp.principal72H).toBe(73_000n);
  });

  it('exhausts alpha settlement cycles at the 72-week plan boundary', () => {
    const { alphaVault } = createSystem();
    const allocatedAt = 1_710_000_000;
    const sevenWeeks = CAPITAL_RULEBOOK.alpha.settlementIntervalSeconds;

    alphaVault.allocateAlpha({
      app: 'wan',
      owner: 'alpha-cycle-limit',
      amount72H: 72_000n,
      timestamp: allocatedAt,
    });

    for (let cycle = 1; cycle <= 10; cycle += 1) {
      alphaVault.settleAlphaCycle({
        app: 'wan',
        owner: 'alpha-cycle-limit',
        settledReward72H: BigInt(cycle),
        timestamp: allocatedAt + sevenWeeks * cycle,
      });
    }

    expect(alphaVault.getSettlementCyclesForSeat('wan', 1)).toHaveLength(10);
    expect(() =>
      alphaVault.settleAlphaCycle({
        app: 'wan',
        owner: 'alpha-cycle-limit',
        settledReward72H: 11n,
        timestamp: allocatedAt + sevenWeeks * 11,
      }),
    ).toThrow(/cycles are exhausted/i);
  });
});
