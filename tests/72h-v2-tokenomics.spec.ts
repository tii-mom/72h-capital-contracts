import { Blockchain, internal as sandboxInternal } from '@ton/sandbox';
import { Address, beginCell, Cell, Slice, toNano } from '@ton/core';
import { describe, expect, it } from 'vitest';

const ONE_72H = 1_000_000_000n;
const ROUND_AMOUNT = 500_000_000n * ONE_72H;
const ROUND_PERSONAL_DEPOSIT_AMOUNT = 250_000_000n * ONE_72H;
const ROUND_TEAM_DEPOSIT_AMOUNT = 125_000_000n * ONE_72H;
const ROUND_REFERRAL_AMOUNT = 75_000_000n * ONE_72H;
const ROUND_LEADERBOARD_AMOUNT = 50_000_000n * ONE_72H;
const PRESALE_STAGE_CAP = 1_500_000_000n * ONE_72H;
const PRESALE_TOTAL = 4_500_000_000n * ONE_72H;
const CLAIM_WINDOW_SECONDS = 60 * 24 * 60 * 60;
const BOUNCE_GRACE_SECONDS = 72 * 60 * 60;
const SEASON_CLAIM_SWEEP_QUERY_OFFSET = 7_207_000_600_000_000n;
const PRICE_STAGE_ONE_USD9 = 10_000_000n;
const PRICE_STAGE_TWO_USD9 = 30_000_000n;
const PRICE_STAGE_THREE_USD9 = 50_000_000n;
const PRICE_STAGE_FOUR_USD9 = 70_000_000n;
const PRICE_STAGE_FIVE_USD9 = 100_000_000n;

interface OpenedContract {
  readonly address: Address;
  send(via: { address?: Address }, args: { value: bigint; bounce?: boolean | null }, message: unknown): Promise<{
    transactions: { outMessages: { values(): Iterable<{ body: Cell }> } }[];
  }>;
  [key: string]: unknown;
}

interface JettonTransferPayout {
  readonly queryId: bigint;
  readonly amount: bigint;
  readonly destination: Address;
  readonly responseDestination: Address;
  readonly customPayload: Cell | null;
  readonly forwardTonAmount: bigint;
  readonly forwardPayloadInRef: boolean;
  readonly forwardPayloadBits: number;
}

interface SeasonFundTransferConfirm {
  readonly queryId: bigint;
  readonly amount72H: bigint;
}

async function openTactContract<T extends { fromInit: (...args: never[]) => Promise<unknown> }>(
  blockchain: Blockchain,
  wrapperPath: string,
  exportName: string,
  args: unknown[],
) {
  const wrapper = (await import(wrapperPath)) as Record<string, T>;
  const contractFactory = wrapper[exportName];
  if (!contractFactory) {
    throw new Error(`Missing generated wrapper export ${exportName}`);
  }
  return blockchain.openContract((await contractFactory.fromInit(...(args as never[]))) as Parameters<typeof blockchain.openContract>[0]) as unknown as OpenedContract;
}

function parseJettonTransfer(body: Cell): JettonTransferPayout {
  const slice = body.beginParse();
  if (slice.loadUint(32) !== 0x0f8a7ea5) {
    throw new Error('not a JettonTransfer');
  }

  const payout = {
    queryId: slice.loadUintBig(64),
    amount: slice.loadCoins(),
    destination: slice.loadAddress(),
    responseDestination: slice.loadAddress(),
    customPayload: slice.loadMaybeRef(),
    forwardTonAmount: slice.loadCoins(),
    forwardPayloadInRef: slice.loadBit(),
    forwardPayloadBits: slice.remainingBits,
  };
  if (payout.forwardPayloadInRef || payout.forwardPayloadBits !== 0) {
    throw new Error('JettonTransfer forward payload must be empty inline Either.left.');
  }
  return payout;
}

function findJettonTransfer(result: { transactions: readonly { outMessages: { values(): Iterable<{ body: Cell }> } }[] }) {
  for (const transaction of result.transactions) {
    for (const message of transaction.outMessages.values()) {
      try {
        return parseJettonTransfer(message.body);
      } catch {
        // Other outbound messages are irrelevant for these proofs.
      }
    }
  }

  throw new Error('Expected a JettonTransfer outbound message.');
}

function parseSeasonFundTransferConfirm(body: Cell): SeasonFundTransferConfirm {
  const slice = body.beginParse();
  if (slice.loadUint(32) !== 0x72060006) {
    throw new Error('not a ConfirmSeasonFundTransfer');
  }

  return {
    queryId: slice.loadUintBig(64),
    amount72H: slice.loadCoins(),
  };
}

function findSeasonFundTransferConfirm(result: { transactions: readonly { outMessages: { values(): Iterable<{ body: Cell }> } }[] }) {
  for (const transaction of result.transactions) {
    for (const message of transaction.outMessages.values()) {
      try {
        return parseSeasonFundTransferConfirm(message.body);
      } catch {
        // Other outbound messages are irrelevant for these proofs.
      }
    }
  }

  throw new Error('Expected a ConfirmSeasonFundTransfer outbound message.');
}

interface SeasonRewardAmounts {
  readonly personal: bigint;
  readonly team: bigint;
  readonly referral: bigint;
  readonly leaderboard: bigint;
}

const SAMPLE_SEASON_AMOUNTS: SeasonRewardAmounts = {
  personal: 4_000n * ONE_72H,
  team: 3_000n * ONE_72H,
  referral: 2_000n * ONE_72H,
  leaderboard: 1_000n * ONE_72H,
};

function totalSeasonRewardAmount(amounts: SeasonRewardAmounts) {
  return amounts.personal + amounts.team + amounts.referral + amounts.leaderboard;
}

function seasonLeafHash(jettonMaster: Address, claimContract: Address, seasonId: bigint, account: Address, amounts: SeasonRewardAmounts) {
  return BigInt(
    `0x${beginCell()
      .storeUint(1n, 32)
      .storeRef(beginCell().storeAddress(jettonMaster).storeAddress(claimContract).endCell())
      .storeRef(beginCell()
        .storeUint(seasonId, 8)
        .storeAddress(account)
        .storeCoins(amounts.personal)
        .storeCoins(amounts.team)
        .storeCoins(amounts.referral)
        .storeCoins(amounts.leaderboard)
        .storeCoins(totalSeasonRewardAmount(amounts))
        .endCell())
      .endCell()
      .hash()
      .toString('hex')}`,
  );
}

function claimSeasonRewardMessage(queryId: bigint, seasonId: bigint, amounts: SeasonRewardAmounts) {
  return {
    $$type: 'ClaimSeasonReward',
    queryId,
    seasonId,
    personalDepositAmount72H: amounts.personal,
    teamDepositAmount72H: amounts.team,
    referralAmount72H: amounts.referral,
    leaderboardAmount72H: amounts.leaderboard,
    proof: beginCell().endCell(),
  };
}

function bouncedJettonTransferBody(queryId: bigint, amount: bigint) {
  return beginCell()
    .storeUint(0xffffffff, 32)
    .storeUint(0x0f8a7ea5, 32)
    .storeUint(queryId, 64)
    .storeCoins(amount)
    .endCell();
}

describe('72H V2 tokenomics contracts', () => {
  it('routes every 4-hour SeasonVault round to either user rewards or fund vesting, never admin wallet', async () => {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_800_000_000;

    const owner = await blockchain.treasury('owner');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const vaultJettonWallet = await blockchain.treasury('season-vault-jetton-wallet');
    const claimContract = await blockchain.treasury('claim-contract');
    const fundVesting = await blockchain.treasury('fund-vesting');
    const forgedBouncer = await blockchain.treasury('forged-bouncer');

    const vault = await openTactContract(
      blockchain,
      '../build/tact/SeasonVault/SeasonVault_SeasonVault.js',
      'SeasonVault',
      [owner.address, jettonMaster.address, vaultJettonWallet.address, owner.address, owner.address],
    );

    await vault.send(owner.getSender(), { value: toNano('1') }, null);
    await vault.send(
      owner.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'SetSeasonVaultRoutes',
        claimContract: claimContract.address,
        fundVestingContract: fundVesting.address,
      },
    );
    await vault.send(
      vaultJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: ROUND_AMOUNT * 18n,
        sender: owner.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );
    await vault.send(
      owner.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'SetSeasonVaultRoutes',
        claimContract: owner.address,
        fundVestingContract: owner.address,
      },
    );

    const success = await vault.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RecordSeasonRound',
        roundId: 1n,
        startAt: 1_800_000_000n,
        endAt: 1_800_014_400n,
        startPriceUsd9: 100_000_000n,
        endPriceUsd9: 125_000_000n,
        success: true,
        evidenceHash: 11n,
      },
    );
    expect(() => findJettonTransfer(success)).toThrow('Expected a JettonTransfer outbound message.');
    expect(await (vault.getGetSeasonClaimable72H as (seasonId: bigint) => Promise<bigint>)(1n)).toBe(ROUND_AMOUNT);
    expect(await (vault.getGetRoundPersonalDepositAmount72H as () => Promise<bigint>)()).toBe(ROUND_PERSONAL_DEPOSIT_AMOUNT);
    expect(await (vault.getGetRoundTeamDepositAmount72H as () => Promise<bigint>)()).toBe(ROUND_TEAM_DEPOSIT_AMOUNT);
    expect(await (vault.getGetRoundReferralAmount72H as () => Promise<bigint>)()).toBe(ROUND_REFERRAL_AMOUNT);
    expect(await (vault.getGetRoundLeaderboardAmount72H as () => Promise<bigint>)()).toBe(ROUND_LEADERBOARD_AMOUNT);
    await blockchain.sendMessage(sandboxInternal({
      from: forgedBouncer.address,
      to: vault.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(1n, ROUND_AMOUNT),
    }));
    expect(await (vault.getGetAllocated72H as () => Promise<bigint>)()).toBe(ROUND_AMOUNT);
    expect(await (vault.getGetUserRewardAllocated72H as () => Promise<bigint>)()).toBe(ROUND_AMOUNT);
    expect(await (vault.getIsRoundRecorded as (roundId: bigint) => Promise<boolean>)(1n)).toBe(true);

    const failure = await vault.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RecordSeasonRound',
        roundId: 2n,
        startAt: 1_800_014_400n,
        endAt: 1_800_028_800n,
        startPriceUsd9: 125_000_000n,
        endPriceUsd9: 130_000_000n,
        success: false,
        evidenceHash: 12n,
      },
    );
    const failureTransfer = findJettonTransfer(failure);
    expect(failureTransfer.amount).toBe(ROUND_AMOUNT);
    expect(failureTransfer.destination.equals(fundVesting.address)).toBe(true);
    expect(await (vault.getGetUserRewardAllocated72H as () => Promise<bigint>)()).toBe(ROUND_AMOUNT);
    expect(await (vault.getGetFundAllocated72H as () => Promise<bigint>)()).toBe(ROUND_AMOUNT);
    expect(await (vault.getGetPendingFundTransferCount as () => Promise<bigint>)()).toBe(1n);

    await vault.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RecordSeasonRound',
        roundId: 3n,
        startAt: 1_800_028_800n,
        endAt: 1_800_043_200n,
        startPriceUsd9: 100_000_003n,
        endPriceUsd9: 125_000_003n,
        success: true,
        evidenceHash: 103n,
      },
    );
    expect(await (vault.getIsRoundRecorded as (roundId: bigint) => Promise<boolean>)(3n)).toBe(false);

    await vault.send(
      forgedBouncer.getSender(),
      { value: toNano('0.05') },
      { $$type: 'ConfirmSeasonFundTransfer', queryId: 2n, amount72H: ROUND_AMOUNT },
    );
    expect(await (vault.getGetPendingFundTransferCount as () => Promise<bigint>)()).toBe(1n);

    await vault.send(
      fundVesting.getSender(),
      { value: toNano('0.05') },
      { $$type: 'ConfirmSeasonFundTransfer', queryId: 2n, amount72H: ROUND_AMOUNT - 1n },
    );
    expect(await (vault.getGetPendingFundTransferCount as () => Promise<bigint>)()).toBe(1n);

    await vault.send(
      fundVesting.getSender(),
      { value: toNano('0.05') },
      { $$type: 'ConfirmSeasonFundTransfer', queryId: 2n, amount72H: ROUND_AMOUNT },
    );
    expect(await (vault.getGetPendingFundTransferCount as () => Promise<bigint>)()).toBe(0n);

    for (let roundId = 3n; roundId <= 18n; roundId += 1n) {
      const startAt = 1_800_000_000n + ((roundId - 1n) * 14_400n);
      await vault.send(
        owner.getSender(),
        { value: toNano('0.2') },
        {
          $$type: 'RecordSeasonRound',
          roundId,
          startAt,
          endAt: startAt + 14_400n,
          startPriceUsd9: 100_000_000n + roundId,
          endPriceUsd9: 125_000_000n + roundId,
          success: true,
          evidenceHash: 100n + roundId,
        },
      );
    }

    const finalizedAmount = ROUND_AMOUNT * 17n;
    expect(await (vault.getGetSeasonClaimable72H as (seasonId: bigint) => Promise<bigint>)(1n)).toBe(finalizedAmount);
    const finalize = await vault.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'FinalizeSeasonRewards',
        queryId: 9_001n,
        seasonId: 1n,
        evidenceHash: 999n,
      },
    );
    const finalizeTransfer = findJettonTransfer(finalize);
    expect(finalizeTransfer.amount).toBe(finalizedAmount);
    expect(finalizeTransfer.destination.equals(claimContract.address)).toBe(true);
    expect(await (vault.getGetSeasonFinalized72H as (seasonId: bigint) => Promise<bigint>)(1n)).toBe(finalizedAmount);
    expect(await (vault.getGetPendingSeasonFinalizeAmount as (queryId: bigint) => Promise<bigint>)(9_001n)).toBe(finalizedAmount);
  });

  it('keeps failed-round transfer pending so a bounce cannot create a season-history gap', async () => {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_800_000_000;

    const owner = await blockchain.treasury('owner');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const vaultJettonWallet = await blockchain.treasury('season-vault-jetton-wallet');
    const claimContract = await blockchain.treasury('claim-contract');
    const fundVesting = await blockchain.treasury('fund-vesting');

    const vault = await openTactContract(
      blockchain,
      '../build/tact/SeasonVault/SeasonVault_SeasonVault.js',
      'SeasonVault',
      [owner.address, jettonMaster.address, vaultJettonWallet.address, claimContract.address, fundVesting.address],
    );

    await vault.send(owner.getSender(), { value: toNano('1') }, null);
    await vault.send(
      vaultJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: ROUND_AMOUNT * 18n,
        sender: owner.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );

    await vault.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RecordSeasonRound',
        roundId: 1n,
        startAt: 1_800_000_000n,
        endAt: 1_800_014_400n,
        startPriceUsd9: 100_000_000n,
        endPriceUsd9: 125_000_000n,
        success: true,
        evidenceHash: 11n,
      },
    );
    await vault.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RecordSeasonRound',
        roundId: 2n,
        startAt: 1_800_014_400n,
        endAt: 1_800_028_800n,
        startPriceUsd9: 125_000_000n,
        endPriceUsd9: 130_000_000n,
        success: false,
        evidenceHash: 12n,
      },
    );

    expect(await (vault.getGetPendingFundTransferCount as () => Promise<bigint>)()).toBe(1n);
    await vault.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RecordSeasonRound',
        roundId: 3n,
        startAt: 1_800_028_800n,
        endAt: 1_800_043_200n,
        startPriceUsd9: 130_000_000n,
        endPriceUsd9: 131_000_000n,
        success: true,
        evidenceHash: 13n,
      },
    );
    expect(await (vault.getIsRoundRecorded as (roundId: bigint) => Promise<boolean>)(3n)).toBe(false);
    expect(await (vault.getGetHighestRecordedRoundId as () => Promise<bigint>)()).toBe(2n);

    await blockchain.sendMessage(sandboxInternal({
      from: vaultJettonWallet.address,
      to: vault.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(2n, ROUND_AMOUNT),
    }));
    expect(await (vault.getGetPendingFundTransferCount as () => Promise<bigint>)()).toBe(0n);
    expect(await (vault.getIsRoundRecorded as (roundId: bigint) => Promise<boolean>)(2n)).toBe(false);
    expect(await (vault.getGetHighestRecordedRoundId as () => Promise<bigint>)()).toBe(1n);
    expect(await (vault.getGetAllocated72H as () => Promise<bigint>)()).toBe(ROUND_AMOUNT);
    expect(await (vault.getGetFundAllocated72H as () => Promise<bigint>)()).toBe(0n);

    await vault.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RecordSeasonRound',
        roundId: 2n,
        startAt: 1_800_014_400n,
        endAt: 1_800_028_800n,
        startPriceUsd9: 125_000_000n,
        endPriceUsd9: 130_000_000n,
        success: true,
        evidenceHash: 14n,
      },
    );
    expect(await (vault.getIsRoundRecorded as (roundId: bigint) => Promise<boolean>)(2n)).toBe(true);
  });

  it('keeps SeasonClaim rewards locked until price stages unlock, then pays only the unlocked cumulative share', async () => {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_800_000_000;

    const owner = await blockchain.treasury('owner');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const claimJettonWallet = await blockchain.treasury('claim-jetton-wallet');
    const seasonVault = await blockchain.treasury('season-vault');
    const claimant = await blockchain.treasury('claimant');
    const claimantJettonWallet = await blockchain.treasury('claimant-jetton-wallet');

    const claim = await openTactContract(
      blockchain,
      '../build/tact/SeasonClaim/SeasonClaim_SeasonClaim.js',
      'SeasonClaim',
      [owner.address, jettonMaster.address, claimJettonWallet.address, owner.address],
    );

    await claim.send(owner.getSender(), { value: toNano('1') }, null);
    await claim.send(
      owner.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'SetSeasonClaimSeasonVault',
        seasonVault: seasonVault.address,
      },
    );
    await claim.send(
      claimJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: ROUND_AMOUNT,
        sender: seasonVault.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );
    await claim.send(
      owner.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'SetSeasonClaimSeasonVault',
        seasonVault: owner.address,
      },
    );
    await claim.send(
      claimJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 2n,
        amount: ONE_72H,
        sender: owner.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );
    expect(await (claim.getGetFunded72H as () => Promise<bigint>)()).toBe(ROUND_AMOUNT);

    const allocation = totalSeasonRewardAmount(SAMPLE_SEASON_AMOUNTS);
    const leaf = seasonLeafHash(jettonMaster.address, claim.address, 1n, claimant.address, SAMPLE_SEASON_AMOUNTS);
    await claim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RegisterSeasonClaim',
        seasonId: 1n,
        merkleRoot: leaf,
        totalAmount72H: ROUND_AMOUNT,
        personalDepositTotal72H: ROUND_PERSONAL_DEPOSIT_AMOUNT,
        teamDepositTotal72H: ROUND_TEAM_DEPOSIT_AMOUNT,
        referralTotal72H: ROUND_REFERRAL_AMOUNT,
        leaderboardTotal72H: ROUND_LEADERBOARD_AMOUNT,
        openAt: 1_800_000_000n,
        evidenceHash: 21n,
      },
    );

    blockchain.now = 1_800_000_000 + 72 * 60 * 60;
    await claim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockClaimStage',
        stage: 1n,
        priceUsd9: PRICE_STAGE_ONE_USD9,
        observedAt: 1_800_000_000n,
        evidenceHash: 22n,
      },
    );
    expect(await (claim.getGetClaimWindowSeconds as () => Promise<bigint>)()).toBe(BigInt(CLAIM_WINDOW_SECONDS));
    expect(await (claim.getGetBounceGraceSeconds as () => Promise<bigint>)()).toBe(BigInt(BOUNCE_GRACE_SECONDS));

    const firstClaim = await claim.send(
      claimant.getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(101n, 1n, SAMPLE_SEASON_AMOUNTS),
    );
    const firstTransfer = findJettonTransfer(firstClaim);
    expect(firstTransfer.amount).toBe((allocation * 2000n) / 10000n);
    expect(firstTransfer.destination.equals(claimant.address)).toBe(true);

    const stageOneClaimAmount = (allocation * 2000n) / 10000n;
    expect(await (claim.getGetClaimedByLeaf as (leaf: bigint) => Promise<bigint>)(leaf)).toBe(stageOneClaimAmount);
    expect(await (claim.getGetPendingClaimAmountByRound as (roundId: bigint) => Promise<bigint>)(1n)).toBe(stageOneClaimAmount);

    const duplicateAfterClaim = await claim.send(
      claimant.getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(102n, 1n, SAMPLE_SEASON_AMOUNTS),
    );
    expect(() => findJettonTransfer(duplicateAfterClaim)).toThrow('Expected a JettonTransfer outbound message.');

    await claim.send(claimantJettonWallet.getSender(), { value: toNano('0.05') }, { $$type: 'JettonExcesses', queryId: 101n });
    expect(await (claim.getGetClaimedByLeaf as (leaf: bigint) => Promise<bigint>)(leaf)).toBe(stageOneClaimAmount);
    expect(await (claim.getGetPendingClaimAmount as (queryId: bigint) => Promise<bigint>)(101n)).toBe(stageOneClaimAmount);

    await blockchain.sendMessage(sandboxInternal({
      from: claimantJettonWallet.address,
      to: claim.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(101n, stageOneClaimAmount),
    }));
    expect(await (claim.getGetClaimedByLeaf as (leaf: bigint) => Promise<bigint>)(leaf)).toBe(stageOneClaimAmount);
    expect(await (claim.getGetPendingClaimAmountByRound as (roundId: bigint) => Promise<bigint>)(1n)).toBe(stageOneClaimAmount);

    await blockchain.sendMessage(sandboxInternal({
      from: claimJettonWallet.address,
      to: claim.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(101n, stageOneClaimAmount),
    }));
    expect(await (claim.getGetClaimedByLeaf as (leaf: bigint) => Promise<bigint>)(leaf)).toBe(0n);
    expect(await (claim.getGetPendingClaimAmountByRound as (roundId: bigint) => Promise<bigint>)(1n)).toBe(0n);

    const retryAfterBounce = await claim.send(
      claimant.getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(102n, 1n, SAMPLE_SEASON_AMOUNTS),
    );
    const retryTransfer = findJettonTransfer(retryAfterBounce);
    expect(retryTransfer.amount).toBe(stageOneClaimAmount);
    expect(await (claim.getGetClaimedByLeaf as (leaf: bigint) => Promise<bigint>)(leaf)).toBe(stageOneClaimAmount);
    expect(await (claim.getGetPendingClaimAmountByRound as (roundId: bigint) => Promise<bigint>)(1n)).toBe(stageOneClaimAmount);

    await claim.send(claimantJettonWallet.getSender(), { value: toNano('0.05') }, { $$type: 'JettonExcesses', queryId: 101n });
    expect(await (claim.getGetClaimedByLeaf as (leaf: bigint) => Promise<bigint>)(leaf)).toBe(stageOneClaimAmount);

    blockchain.now = 1_800_000_000 + 72 * 60 * 60 + BOUNCE_GRACE_SECONDS + 1;
    await claim.send(
      owner.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'SettleSeasonClaimPending',
        queryId: 102n,
      },
    );
    expect(await (claim.getGetPendingClaimAmountByRound as (roundId: bigint) => Promise<bigint>)(1n)).toBe(0n);
    expect(await (claim.getGetClaimedByLeaf as (leaf: bigint) => Promise<bigint>)(leaf)).toBe(stageOneClaimAmount);

    await claim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockClaimStage',
        stage: 2n,
        priceUsd9: PRICE_STAGE_TWO_USD9,
        observedAt: 1_800_000_000n,
        evidenceHash: 23n,
      },
    );
    expect(await (claim.getGetUnlockedBps as () => Promise<bigint>)()).toBe(4000n);

    const secondStageClaim = await claim.send(
      claimant.getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(103n, 1n, SAMPLE_SEASON_AMOUNTS),
    );
    const secondStageTransfer = findJettonTransfer(secondStageClaim);
    expect(secondStageTransfer.amount).toBe(stageOneClaimAmount);
    expect(await (claim.getGetClaimedByLeaf as (leaf: bigint) => Promise<bigint>)(leaf)).toBe((allocation * 4000n) / 10000n);

    blockchain.now = (blockchain.now ?? 1_800_000_000) + BOUNCE_GRACE_SECONDS + 1;
    await claim.send(
      owner.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'SettleSeasonClaimPending',
        queryId: 103n,
      },
    );
    expect(await (claim.getGetPendingClaimAmountByRound as (roundId: bigint) => Promise<bigint>)(1n)).toBe(0n);

    await claim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockClaimStage',
        stage: 3n,
        priceUsd9: PRICE_STAGE_THREE_USD9,
        observedAt: 1_800_000_000n,
        evidenceHash: 24n,
      },
    );
    expect(await (claim.getGetUnlockedBps as () => Promise<bigint>)()).toBe(6000n);

    const thirdStageClaim = await claim.send(
      claimant.getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(104n, 1n, SAMPLE_SEASON_AMOUNTS),
    );
    const thirdStageTransfer = findJettonTransfer(thirdStageClaim);
    expect(thirdStageTransfer.amount).toBe(stageOneClaimAmount);
    expect(await (claim.getGetClaimedByLeaf as (claimLeaf: bigint) => Promise<bigint>)(leaf)).toBe((allocation * 6000n) / 10000n);
    expect(await (claim.getGetPendingClaimAmountByRound as (roundId: bigint) => Promise<bigint>)(1n)).toBe(stageOneClaimAmount);

    blockchain.now = (blockchain.now ?? 1_800_000_000) + BOUNCE_GRACE_SECONDS + 1;
    await claim.send(
      owner.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'SettleSeasonClaimPending',
        queryId: 104n,
      },
    );
    expect(await (claim.getGetPendingClaimAmountByRound as (roundId: bigint) => Promise<bigint>)(1n)).toBe(0n);

    await claim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockClaimStage',
        stage: 4n,
        priceUsd9: PRICE_STAGE_FOUR_USD9,
        observedAt: 1_800_000_000n,
        evidenceHash: 25n,
      },
    );
    expect(await (claim.getGetUnlockedBps as () => Promise<bigint>)()).toBe(8000n);

    const fourthStageClaim = await claim.send(
      claimant.getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(105n, 1n, SAMPLE_SEASON_AMOUNTS),
    );
    const fourthStageTransfer = findJettonTransfer(fourthStageClaim);
    expect(fourthStageTransfer.amount).toBe(stageOneClaimAmount);
    expect(await (claim.getGetClaimedByLeaf as (claimLeaf: bigint) => Promise<bigint>)(leaf)).toBe((allocation * 8000n) / 10000n);
    expect(await (claim.getGetPendingClaimAmountByRound as (roundId: bigint) => Promise<bigint>)(1n)).toBe(stageOneClaimAmount);

    blockchain.now = (blockchain.now ?? 1_800_000_000) + BOUNCE_GRACE_SECONDS + 1;
    await claim.send(
      owner.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'SettleSeasonClaimPending',
        queryId: 105n,
      },
    );
    expect(await (claim.getGetPendingClaimAmountByRound as (roundId: bigint) => Promise<bigint>)(1n)).toBe(0n);

    await claim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockClaimStage',
        stage: 5n,
        priceUsd9: PRICE_STAGE_FIVE_USD9,
        observedAt: 1_800_000_000n,
        evidenceHash: 26n,
      },
    );
    expect(await (claim.getGetUnlockedBps as () => Promise<bigint>)()).toBe(10000n);

    const fifthStageClaim = await claim.send(
      claimant.getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(106n, 1n, SAMPLE_SEASON_AMOUNTS),
    );
    const fifthStageTransfer = findJettonTransfer(fifthStageClaim);
    expect(fifthStageTransfer.amount).toBe(stageOneClaimAmount);
    expect(await (claim.getGetClaimedByLeaf as (claimLeaf: bigint) => Promise<bigint>)(leaf)).toBe(allocation);
    expect(await (claim.getGetPendingClaimAmountByRound as (roundId: bigint) => Promise<bigint>)(1n)).toBe(stageOneClaimAmount);

    const reservedQueryClaim = await claim.send(
      claimant.getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(SEASON_CLAIM_SWEEP_QUERY_OFFSET, 1n, SAMPLE_SEASON_AMOUNTS),
    );
    expect(() => findJettonTransfer(reservedQueryClaim)).toThrow('Expected a JettonTransfer outbound message.');
  });

  it('blocks expired-round sweep until pending claim transfers are settled or bounced', async () => {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_800_000_000;

    const owner = await blockchain.treasury('owner');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const claimJettonWallet = await blockchain.treasury('claim-jetton-wallet');
    const seasonVault = await blockchain.treasury('season-vault');
    const claimant = await blockchain.treasury('claimant');

    const claim = await openTactContract(
      blockchain,
      '../build/tact/SeasonClaim/SeasonClaim_SeasonClaim.js',
      'SeasonClaim',
      [owner.address, jettonMaster.address, claimJettonWallet.address, owner.address],
    );

    await claim.send(owner.getSender(), { value: toNano('1') }, null);
    await claim.send(
      owner.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'SetSeasonClaimSeasonVault',
        seasonVault: seasonVault.address,
      },
    );
    await claim.send(
      claimJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: ROUND_AMOUNT,
        sender: seasonVault.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );

    const allocation = totalSeasonRewardAmount(SAMPLE_SEASON_AMOUNTS);
    const leaf = seasonLeafHash(jettonMaster.address, claim.address, 1n, claimant.address, SAMPLE_SEASON_AMOUNTS);
    await claim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RegisterSeasonClaim',
        seasonId: 1n,
        merkleRoot: leaf,
        totalAmount72H: ROUND_AMOUNT,
        personalDepositTotal72H: ROUND_PERSONAL_DEPOSIT_AMOUNT,
        teamDepositTotal72H: ROUND_TEAM_DEPOSIT_AMOUNT,
        referralTotal72H: ROUND_REFERRAL_AMOUNT,
        leaderboardTotal72H: ROUND_LEADERBOARD_AMOUNT,
        openAt: 1_800_000_000n,
        evidenceHash: 121n,
      },
    );
    blockchain.now = 1_800_000_000 + 72 * 60 * 60;
    await claim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockClaimStage',
        stage: 1n,
        priceUsd9: PRICE_STAGE_ONE_USD9,
        observedAt: 1_800_000_000n,
        evidenceHash: 122n,
      },
    );

    const claimAmount = (allocation * 2000n) / 10000n;
    await claim.send(
      claimant.getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(401n, 1n, SAMPLE_SEASON_AMOUNTS),
    );
    expect(await (claim.getGetPendingClaimAmountByRound as (roundId: bigint) => Promise<bigint>)(1n)).toBe(claimAmount);

    blockchain.now = 1_800_000_000 + CLAIM_WINDOW_SECONDS + 1;
    const sweepBeforeGrace = await claim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'SweepExpiredSeasonClaim',
        seasonId: 1n,
      },
    );
    expect(() => findJettonTransfer(sweepBeforeGrace)).toThrow('Expected a JettonTransfer outbound message.');

    blockchain.now = 1_800_000_000 + CLAIM_WINDOW_SECONDS + BOUNCE_GRACE_SECONDS + 1;
    const sweepWithPending = await claim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'SweepExpiredSeasonClaim',
        seasonId: 1n,
      },
    );
    expect(() => findJettonTransfer(sweepWithPending)).toThrow('Expected a JettonTransfer outbound message.');

    await blockchain.sendMessage(sandboxInternal({
      from: claimJettonWallet.address,
      to: claim.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(401n, claimAmount),
    }));
    expect(await (claim.getGetPendingClaimAmountByRound as (roundId: bigint) => Promise<bigint>)(1n)).toBe(0n);
    expect(await (claim.getGetClaimedByLeaf as (roundLeaf: bigint) => Promise<bigint>)(leaf)).toBe(0n);

    const sweepAfterBounce = await claim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'SweepExpiredSeasonClaim',
        seasonId: 1n,
      },
    );
    const sweepTransfer = findJettonTransfer(sweepAfterBounce);
    expect(sweepTransfer.queryId).toBe(SEASON_CLAIM_SWEEP_QUERY_OFFSET + 1n);
    expect(sweepTransfer.amount).toBe(ROUND_AMOUNT);
    await blockchain.sendMessage(sandboxInternal({
      from: claimJettonWallet.address,
      to: claim.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(SEASON_CLAIM_SWEEP_QUERY_OFFSET + 1n, ROUND_AMOUNT - ONE_72H),
    }));
    expect(await (claim.getGetReserved72H as () => Promise<bigint>)()).toBe(0n);
    const repeatSweepAfterWrongAmountBounce = await claim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'SweepExpiredSeasonClaim',
        seasonId: 1n,
      },
    );
    expect(() => findJettonTransfer(repeatSweepAfterWrongAmountBounce)).toThrow('Expected a JettonTransfer outbound message.');

    const cleanupOpenAt = BigInt(blockchain.now - 72 * 60 * 60);
    const claim2 = await openTactContract(
      blockchain,
      '../build/tact/SeasonClaim/SeasonClaim_SeasonClaim.js',
      'SeasonClaim',
      [owner.address, jettonMaster.address, claimJettonWallet.address, seasonVault.address],
    );
    await claim2.send(owner.getSender(), { value: toNano('1') }, null);
    await claim2.send(
      claimJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 2n,
        amount: ROUND_AMOUNT,
        sender: seasonVault.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );
    const leaf2 = seasonLeafHash(jettonMaster.address, claim2.address, 1n, claimant.address, SAMPLE_SEASON_AMOUNTS);
    await claim2.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RegisterSeasonClaim',
        seasonId: 1n,
        merkleRoot: leaf2,
        totalAmount72H: ROUND_AMOUNT,
        personalDepositTotal72H: ROUND_PERSONAL_DEPOSIT_AMOUNT,
        teamDepositTotal72H: ROUND_TEAM_DEPOSIT_AMOUNT,
        referralTotal72H: ROUND_REFERRAL_AMOUNT,
        leaderboardTotal72H: ROUND_LEADERBOARD_AMOUNT,
        openAt: cleanupOpenAt,
        evidenceHash: 123n,
      },
    );
    await claim2.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockClaimStage',
        stage: 1n,
        priceUsd9: PRICE_STAGE_ONE_USD9,
        observedAt: cleanupOpenAt,
        evidenceHash: 124n,
      },
    );
    await claim2.send(
      claimant.getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(402n, 1n, SAMPLE_SEASON_AMOUNTS),
    );

    await claim2.send(
      owner.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'SettleSeasonClaimPending',
        queryId: 402n,
      },
    );
    expect(await (claim2.getGetPendingClaimAmountByRound as (roundId: bigint) => Promise<bigint>)(1n)).toBe(claimAmount);

    blockchain.now = Number(cleanupOpenAt) + CLAIM_WINDOW_SECONDS + BOUNCE_GRACE_SECONDS + 1;
    await claim2.send(
      owner.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'SettleSeasonClaimPending',
        queryId: 402n,
      },
    );
    expect(await (claim2.getGetPendingClaimAmountByRound as (roundId: bigint) => Promise<bigint>)(1n)).toBe(0n);

    const sweepAfterCleanup = await claim2.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'SweepExpiredSeasonClaim',
        seasonId: 1n,
      },
    );
    const cleanupSweepTransfer = findJettonTransfer(sweepAfterCleanup);
    expect(cleanupSweepTransfer.amount).toBe(ROUND_AMOUNT - claimAmount);
  });

  it('locks failed-round fund rewards behind 0.01 / 0.03 / 0.05 / 0.07 / 0.10 USD stages held for 72 hours', async () => {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_800_000_000;

    const owner = await blockchain.treasury('owner');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const fundJettonWallet = await blockchain.treasury('fund-jetton-wallet');
    const seasonVault = await blockchain.treasury('season-vault');
    const fundWallet = await blockchain.treasury('fund-wallet');

    const fund = await openTactContract(
      blockchain,
      '../build/tact/FundVesting/FundVesting_FundVesting.js',
      'FundVesting',
      [owner.address, jettonMaster.address, fundJettonWallet.address, owner.address, fundWallet.address],
    );

    await fund.send(owner.getSender(), { value: toNano('1') }, null);
    await fund.send(
      owner.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'SetFundSeasonVault',
        seasonVault: seasonVault.address,
      },
    );
    const funding = await fund.send(
      fundJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: ROUND_AMOUNT,
        sender: seasonVault.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );
    const fundingConfirm = findSeasonFundTransferConfirm(funding);
    expect(fundingConfirm.queryId).toBe(1n);
    expect(fundingConfirm.amount72H).toBe(ROUND_AMOUNT);
    await fund.send(
      owner.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'SetFundSeasonVault',
        seasonVault: owner.address,
      },
    );
    await fund.send(
      fundJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 2n,
        amount: ONE_72H,
        sender: owner.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );
    expect(await (fund.getGetFunded72H as () => Promise<bigint>)()).toBe(ROUND_AMOUNT);

    blockchain.now = 1_800_000_000 + 72 * 60 * 60;
    await fund.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockFundStage',
        stage: 1n,
        priceUsd9: PRICE_STAGE_ONE_USD9,
        observedAt: 1_800_000_000n,
        evidenceHash: 31n,
      },
    );
    expect(await (fund.getGetUnlockedBps as () => Promise<bigint>)()).toBe(2000n);
    expect(await (fund.getGetAvailableToWithdraw72H as () => Promise<bigint>)()).toBe((ROUND_AMOUNT * 2000n) / 10000n);

    const overWithdraw = await fund.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'WithdrawFund',
        queryId: 300n,
        amount72H: (ROUND_AMOUNT * 2000n) / 10000n + ONE_72H,
        purposeHash: 33n,
      },
    );
    expect(() => findJettonTransfer(overWithdraw)).toThrow('Expected a JettonTransfer outbound message.');
    expect(await (fund.getGetWithdrawn72H as () => Promise<bigint>)()).toBe(0n);

    const withdraw = await fund.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'WithdrawFund',
        queryId: 301n,
        amount72H: (ROUND_AMOUNT * 2000n) / 10000n,
        purposeHash: 32n,
      },
    );
    const transfer = findJettonTransfer(withdraw);
    expect(transfer.destination.equals(fundWallet.address)).toBe(true);
    expect(transfer.amount).toBe((ROUND_AMOUNT * 2000n) / 10000n);

    await fund.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockFundStage',
        stage: 2n,
        priceUsd9: PRICE_STAGE_TWO_USD9 - 1n,
        observedAt: 1_800_000_000n,
        evidenceHash: 34n,
      },
    );
    expect(await (fund.getGetUnlockedBps as () => Promise<bigint>)()).toBe(2000n);

    await fund.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockFundStage',
        stage: 2n,
        priceUsd9: PRICE_STAGE_TWO_USD9,
        observedAt: 1_800_000_000n,
        evidenceHash: 35n,
      },
    );
    expect(await (fund.getGetUnlockedBps as () => Promise<bigint>)()).toBe(4000n);
    expect(await (fund.getGetAvailableToWithdraw72H as () => Promise<bigint>)()).toBe((ROUND_AMOUNT * 2000n) / 10000n);

    await fund.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockFundStage',
        stage: 3n,
        priceUsd9: PRICE_STAGE_THREE_USD9,
        observedAt: 1_800_000_000n,
        evidenceHash: 36n,
      },
    );
    expect(await (fund.getGetUnlockedBps as () => Promise<bigint>)()).toBe(6000n);

    await fund.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockFundStage',
        stage: 4n,
        priceUsd9: PRICE_STAGE_FOUR_USD9,
        observedAt: 1_800_000_000n,
        evidenceHash: 37n,
      },
    );
    expect(await (fund.getGetUnlockedBps as () => Promise<bigint>)()).toBe(8000n);

    await fund.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockFundStage',
        stage: 5n,
        priceUsd9: PRICE_STAGE_FIVE_USD9,
        observedAt: 1_800_000_000n,
        evidenceHash: 38n,
      },
    );
    expect(await (fund.getGetUnlockedBps as () => Promise<bigint>)()).toBe(10000n);

    const walletChangeAfterFunding = await fund.send(
      owner.getSender(),
      { value: toNano('0.05') },
      { $$type: 'SetFundJettonWallet', wallet: owner.address },
    );
    expect(() => findJettonTransfer(walletChangeAfterFunding)).toThrow('Expected a JettonTransfer outbound message.');
    await fund.send(
      fundJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 2n,
        amount: ONE_72H,
        sender: seasonVault.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );
    expect(await (fund.getGetFunded72H as () => Promise<bigint>)()).toBe(ROUND_AMOUNT + ONE_72H);
  });

  it('rejects forged or mismatched FundVesting transfer bounces and only rolls back true wallet bounces', async () => {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_800_000_000;

    const owner = await blockchain.treasury('owner');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const fundJettonWallet = await blockchain.treasury('fund-jetton-wallet');
    const seasonVault = await blockchain.treasury('season-vault');
    const fundWallet = await blockchain.treasury('fund-wallet');
    const forgedBouncer = await blockchain.treasury('forged-bouncer');

    const fund = await openTactContract(
      blockchain,
      '../build/tact/FundVesting/FundVesting_FundVesting.js',
      'FundVesting',
      [owner.address, jettonMaster.address, fundJettonWallet.address, seasonVault.address, fundWallet.address],
    );

    await fund.send(owner.getSender(), { value: toNano('1') }, null);
    await fund.send(
      fundJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: ROUND_AMOUNT,
        sender: seasonVault.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );

    blockchain.now = 1_800_000_000 + 72 * 60 * 60;
    await fund.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockFundStage',
        stage: 1n,
        priceUsd9: PRICE_STAGE_ONE_USD9,
        observedAt: 1_800_000_000n,
        evidenceHash: 131n,
      },
    );

    const withdrawAmount = (ROUND_AMOUNT * 2000n) / 10000n;
    const withdraw = await fund.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'WithdrawFund',
        queryId: 901n,
        amount72H: withdrawAmount,
        purposeHash: 132n,
      },
    );
    expect(findJettonTransfer(withdraw).amount).toBe(withdrawAmount);
    expect(await (fund.getGetWithdrawn72H as () => Promise<bigint>)()).toBe(withdrawAmount);
    expect(await (fund.getGetWithdrawalAmount as (queryId: bigint) => Promise<bigint>)(901n)).toBe(withdrawAmount);

    await blockchain.sendMessage(sandboxInternal({
      from: forgedBouncer.address,
      to: fund.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(901n, withdrawAmount),
    }));
    expect(await (fund.getGetWithdrawn72H as () => Promise<bigint>)()).toBe(withdrawAmount);
    expect(await (fund.getGetWithdrawalAmount as (queryId: bigint) => Promise<bigint>)(901n)).toBe(withdrawAmount);

    await blockchain.sendMessage(sandboxInternal({
      from: fundJettonWallet.address,
      to: fund.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(901n, withdrawAmount - ONE_72H),
    }));
    expect(await (fund.getGetWithdrawn72H as () => Promise<bigint>)()).toBe(withdrawAmount);
    expect(await (fund.getGetWithdrawalAmount as (queryId: bigint) => Promise<bigint>)(901n)).toBe(withdrawAmount);

    await blockchain.sendMessage(sandboxInternal({
      from: fundJettonWallet.address,
      to: fund.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(901n, withdrawAmount),
    }));
    expect(await (fund.getGetWithdrawn72H as () => Promise<bigint>)()).toBe(0n);
    expect(await (fund.getGetWithdrawalAmount as (queryId: bigint) => Promise<bigint>)(901n)).toBe(0n);

    const retry = await fund.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'WithdrawFund',
        queryId: 901n,
        amount72H: withdrawAmount,
        purposeHash: 133n,
      },
    );
    expect(findJettonTransfer(retry).amount).toBe(withdrawAmount);
    expect(await (fund.getGetWithdrawn72H as () => Promise<bigint>)()).toBe(withdrawAmount);
  });

  it('keeps presale simple: TON only, 3 fixed stages, wallet cap, and unsold sweep to the unlocked development fund', async () => {
    const blockchain = await Blockchain.create();
    const owner = await blockchain.treasury('owner');
    const buyer = await blockchain.treasury('buyer');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const presaleJettonWallet = await blockchain.treasury('presale-jetton-wallet');
    const proceedsWallet = await blockchain.treasury('proceeds-wallet');
    const developmentFund = await blockchain.treasury('development-fund');
    const forgedBouncer = await blockchain.treasury('forged-bouncer');

    const tokensPerTonStage1 = 100_000n * ONE_72H;
    const presale = await openTactContract(
      blockchain,
      '../build/tact/PresaleVault/PresaleVault_PresaleVault.js',
      'PresaleVault',
      [
        owner.address,
        jettonMaster.address,
        presaleJettonWallet.address,
        proceedsWallet.address,
        developmentFund.address,
        tokensPerTonStage1,
        80_000n * ONE_72H,
        60_000n * ONE_72H,
        200_000n * ONE_72H,
      ],
    );

    await presale.send(owner.getSender(), { value: toNano('1') }, null);
    await presale.send(
      presaleJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: PRESALE_TOTAL,
        sender: owner.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );

    const inactiveBuy = await presale.send(
      buyer.getSender(),
      { value: toNano('1.2') },
      {
        $$type: 'BuyPresale',
        queryId: 398n,
        stage: 1n,
        tonAmount: toNano('1'),
        minTokens72H: 100_000n * ONE_72H,
      },
    );
    expect(() => findJettonTransfer(inactiveBuy)).toThrow('Expected a JettonTransfer outbound message.');
    expect(await (presale.getGetSold72H as () => Promise<bigint>)()).toBe(0n);

    const sweepBeforeOpen = await presale.send(
      owner.getSender(),
      { value: toNano('0.2') },
      { $$type: 'SweepUnsoldPresale', queryId: 399n },
    );
    expect(() => findJettonTransfer(sweepBeforeOpen)).toThrow('Expected a JettonTransfer outbound message.');

    await presale.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'SetPresaleActive', active: true });

    const wrongStageBuy = await presale.send(
      buyer.getSender(),
      { value: toNano('1.2') },
      {
        $$type: 'BuyPresale',
        queryId: 400n,
        stage: 2n,
        tonAmount: toNano('1'),
        minTokens72H: 80_000n * ONE_72H,
      },
    );
    expect(() => findJettonTransfer(wrongStageBuy)).toThrow('Expected a JettonTransfer outbound message.');
    expect(await (presale.getGetSoldByStage as (stage: bigint) => Promise<bigint>)(2n)).toBe(0n);

    const buy = await presale.send(
      buyer.getSender(),
      { value: toNano('1.2') },
      {
        $$type: 'BuyPresale',
        queryId: 401n,
        stage: 1n,
        tonAmount: toNano('1'),
        minTokens72H: 100_000n * ONE_72H,
      },
    );
    const transfer = findJettonTransfer(buy);
    expect(transfer.amount).toBe(100_000n * ONE_72H);
    expect(transfer.destination.equals(buyer.address)).toBe(true);
    expect(await (presale.getGetSoldByStage as (stage: bigint) => Promise<bigint>)(1n)).toBe(100_000n * ONE_72H);
    expect(await (presale.getGetPurchasedByBuyer as (buyer: Address) => Promise<bigint>)(buyer.address)).toBe(100_000n * ONE_72H);
    expect(await (presale.getGetCurrentStage as () => Promise<bigint>)()).toBe(1n);
    await blockchain.sendMessage(sandboxInternal({
      from: forgedBouncer.address,
      to: presale.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(401n, 100_000n * ONE_72H),
    }));
    expect(await (presale.getGetSold72H as () => Promise<bigint>)()).toBe(100_000n * ONE_72H);
    expect(await (presale.getGetSaleProceedsTon as () => Promise<bigint>)()).toBe(toNano('1'));
    expect(await (presale.getGetPurchasedByBuyer as (buyer: Address) => Promise<bigint>)(buyer.address)).toBe(100_000n * ONE_72H);

    await presale.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'SetPresaleActive', active: false });
    await presale.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'SetPresaleStage', stage: 2n });
    expect(await (presale.getGetCurrentStage as () => Promise<bigint>)()).toBe(2n);
    await presale.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'SetPresaleStage', stage: 1n });
    expect(await (presale.getGetCurrentStage as () => Promise<bigint>)()).toBe(2n);
    await presale.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'SetPresaleActive', active: true });
    const stageTwoBuy = await presale.send(
      buyer.getSender(),
      { value: toNano('1.2') },
      {
        $$type: 'BuyPresale',
        queryId: 402n,
        stage: 2n,
        tonAmount: toNano('1'),
        minTokens72H: 80_000n * ONE_72H,
      },
    );
    const stageTwoTransfer = findJettonTransfer(stageTwoBuy);
    expect(stageTwoTransfer.amount).toBe(80_000n * ONE_72H);
    expect(await (presale.getGetSoldByStage as (stage: bigint) => Promise<bigint>)(2n)).toBe(80_000n * ONE_72H);

    const capBoundaryBuy = await presale.send(
      buyer.getSender(),
      { value: toNano('0.45') },
      {
        $$type: 'BuyPresale',
        queryId: 404n,
        stage: 2n,
        tonAmount: toNano('0.25'),
        minTokens72H: 20_000n * ONE_72H,
      },
    );
    const capBoundaryTransfer = findJettonTransfer(capBoundaryBuy);
    expect(capBoundaryTransfer.amount).toBe(20_000n * ONE_72H);
    expect(await (presale.getGetPurchasedByBuyer as (buyer: Address) => Promise<bigint>)(buyer.address)).toBe(200_000n * ONE_72H);

    const overCapBuy = await presale.send(
      buyer.getSender(),
      { value: toNano('1.2') },
      {
        $$type: 'BuyPresale',
        queryId: 405n,
        stage: 2n,
        tonAmount: toNano('1'),
        minTokens72H: 80_000n * ONE_72H,
      },
    );
    expect(() => findJettonTransfer(overCapBuy)).toThrow('Expected a JettonTransfer outbound message.');

    await presale.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'SetPresaleActive', active: false });
    const sweep = await presale.send(owner.getSender(), { value: toNano('0.2') }, { $$type: 'SweepUnsoldPresale', queryId: 403n });
    const sweepTransfer = findJettonTransfer(sweep);
    expect(sweepTransfer.destination.equals(developmentFund.address)).toBe(true);
    expect(sweepTransfer.amount).toBe(PRESALE_TOTAL - 200_000n * ONE_72H);
    expect(await (presale.getGetStageCap72H as () => Promise<bigint>)()).toBe(PRESALE_STAGE_CAP);
  });

  it('lets the unlocked DevelopmentFund use regular fund inventory without price-stage locks', async () => {
    const blockchain = await Blockchain.create();
    const owner = await blockchain.treasury('owner');
    const recipient = await blockchain.treasury('recipient');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const fundJettonWallet = await blockchain.treasury('fund-jetton-wallet');
    const forgedBouncer = await blockchain.treasury('forged-bouncer');

    const developmentFund = await openTactContract(
      blockchain,
      '../build/tact/DevelopmentFund/DevelopmentFund_DevelopmentFund.js',
      'DevelopmentFund',
      [owner.address, jettonMaster.address, fundJettonWallet.address],
    );

    await developmentFund.send(owner.getSender(), { value: toNano('1') }, null);
    await developmentFund.send(
      fundJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: 50_000_000n * ONE_72H,
        sender: owner.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );

    const withdraw = await developmentFund.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'WithdrawDevelopmentFund',
        queryId: 701n,
        amount72H: 10_000_000n * ONE_72H,
        destination: recipient.address,
        purposeHash: 72n,
      },
    );

    const transfer = findJettonTransfer(withdraw);
    expect(transfer.amount).toBe(10_000_000n * ONE_72H);
    expect(transfer.destination.equals(recipient.address)).toBe(true);
    expect(await (developmentFund.getGetAvailable72H as () => Promise<bigint>)()).toBe(40_000_000n * ONE_72H);
    expect(await (developmentFund.getGetWithdrawalPurposeHash as (queryId: bigint) => Promise<bigint>)(701n)).toBe(72n);
    await blockchain.sendMessage(sandboxInternal({
      from: forgedBouncer.address,
      to: developmentFund.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(701n, 10_000_000n * ONE_72H),
    }));
    expect(await (developmentFund.getGetWithdrawn72H as () => Promise<bigint>)()).toBe(10_000_000n * ONE_72H);
    expect(await (developmentFund.getGetWithdrawalAmount as (queryId: bigint) => Promise<bigint>)(701n)).toBe(10_000_000n * ONE_72H);
  });

  it('releases team reserve only to the configured team wallet after a 72-hour price hold', async () => {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_800_000_000;

    const owner = await blockchain.treasury('owner');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const teamJettonWallet = await blockchain.treasury('team-jetton-wallet');
    const teamWallet = await blockchain.treasury('team-wallet');
    const forgedBouncer = await blockchain.treasury('forged-bouncer');

    const teamVesting = await openTactContract(
      blockchain,
      '../build/tact/TeamVesting/TeamVesting_TeamVesting.js',
      'TeamVesting',
      [owner.address, jettonMaster.address, teamJettonWallet.address, teamWallet.address],
    );

    await teamVesting.send(owner.getSender(), { value: toNano('1') }, null);
    await teamVesting.send(
      teamJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: 300_000_000n * ONE_72H,
        sender: owner.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );

    blockchain.now = 1_800_000_000 + 72 * 60 * 60;
    const unlock = await teamVesting.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockTeamStage',
        queryId: 501n,
        stage: 1n,
        priceUsd9: 100_000_000n,
        observedAt: 1_800_000_000n,
        evidenceHash: 51n,
      },
    );
    const transfer = findJettonTransfer(unlock);
    expect(transfer.amount).toBe(100_000_000n * ONE_72H);
    expect(transfer.destination.equals(teamWallet.address)).toBe(true);
    expect(transfer.destination.equals(owner.address)).toBe(false);
    expect(await (teamVesting.getGetReleased72H as () => Promise<bigint>)()).toBe(100_000_000n * ONE_72H);
    await blockchain.sendMessage(sandboxInternal({
      from: forgedBouncer.address,
      to: teamVesting.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(501n, 100_000_000n * ONE_72H),
    }));
    expect(await (teamVesting.getGetReleased72H as () => Promise<bigint>)()).toBe(100_000_000n * ONE_72H);
    expect(await (teamVesting.getIsStageReleased as (stage: bigint) => Promise<boolean>)(1n)).toBe(true);
  });

  it('lets EcosystemTreasury fund only explicitly approved app contracts', async () => {
    const blockchain = await Blockchain.create();
    const owner = await blockchain.treasury('owner');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const ecosystemJettonWallet = await blockchain.treasury('ecosystem-jetton-wallet');
    const appContract = await blockchain.treasury('app-reward-contract');
    const forgedBouncer = await blockchain.treasury('forged-bouncer');

    const ecosystem = await openTactContract(
      blockchain,
      '../build/tact/EcosystemTreasury/EcosystemTreasury_EcosystemTreasury.js',
      'EcosystemTreasury',
      [owner.address, jettonMaster.address, ecosystemJettonWallet.address],
    );

    await ecosystem.send(owner.getSender(), { value: toNano('1') }, null);
    await ecosystem.send(
      ecosystemJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: PRESALE_TOTAL,
        sender: owner.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );
    await ecosystem.send(
      owner.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'ApproveEcosystemContract',
        appContract: appContract.address,
        approved: true,
        metadataHash: 61n,
      },
    );

    const funding = await ecosystem.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'FundEcosystemContract',
        queryId: 601n,
        appContract: appContract.address,
        amount72H: 50_000_000n * ONE_72H,
        purposeHash: 62n,
      },
    );
    const transfer = findJettonTransfer(funding);
    expect(transfer.amount).toBe(50_000_000n * ONE_72H);
    expect(transfer.destination.equals(appContract.address)).toBe(true);
    expect(transfer.destination.equals(owner.address)).toBe(false);
    expect(await (ecosystem.getGetReleased72H as () => Promise<bigint>)()).toBe(50_000_000n * ONE_72H);
    await blockchain.sendMessage(sandboxInternal({
      from: forgedBouncer.address,
      to: ecosystem.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(601n, 50_000_000n * ONE_72H),
    }));
    expect(await (ecosystem.getGetReleased72H as () => Promise<bigint>)()).toBe(50_000_000n * ONE_72H);
    expect(await (ecosystem.getGetFundingAmount as (queryId: bigint) => Promise<bigint>)(601n)).toBe(50_000_000n * ONE_72H);
  });
});
