import { Blockchain } from '@ton/sandbox';
import { Address, beginCell, Cell, Slice, toNano } from '@ton/core';
import { describe, expect, it } from 'vitest';

const ONE_72H = 1_000_000_000n;
const TOTAL_AMOUNT = 1_000n * ONE_72H;
const PERSONAL_AMOUNT = (TOTAL_AMOUNT * 5000n) / 10000n;
const TEAM_AMOUNT = (TOTAL_AMOUNT * 2500n) / 10000n;
const REFERRAL_AMOUNT = (TOTAL_AMOUNT * 1500n) / 10000n;
const LEADERBOARD_AMOUNT = (TOTAL_AMOUNT * 1000n) / 10000n;
const BRIDGE_FORWARD_QUERY_OFFSET = 7_207_100_000_000_000n;

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

  return {
    queryId: slice.loadUintBig(64),
    amount: slice.loadCoins(),
    destination: slice.loadAddress(),
  };
}

function findJettonTransfer(result: { transactions: readonly { outMessages: { values(): Iterable<{ body: Cell }> } }[] }) {
  for (const transaction of result.transactions) {
    for (const message of transaction.outMessages.values()) {
      try {
        return parseJettonTransfer(message.body);
      } catch {
        // Other outbound messages are irrelevant for these tests.
      }
    }
  }

  throw new Error('Expected a JettonTransfer outbound message.');
}

function cellHash(cell: Cell): bigint {
  return BigInt(`0x${cell.hash().toString('hex')}`);
}

function seasonLeafHash(jettonMaster: Address, claimContract: Address, seasonId: bigint, account: Address) {
  return cellHash(beginCell()
    .storeUint(1n, 32)
    .storeRef(beginCell().storeAddress(jettonMaster).storeAddress(claimContract).endCell())
    .storeRef(beginCell()
      .storeUint(seasonId, 8)
      .storeAddress(account)
      .storeCoins(PERSONAL_AMOUNT)
      .storeCoins(TEAM_AMOUNT)
      .storeCoins(REFERRAL_AMOUNT)
      .storeCoins(LEADERBOARD_AMOUNT)
      .storeCoins(TOTAL_AMOUNT)
      .endCell())
    .endCell());
}

function claimLegacyMessage(queryId: bigint, personalDepositAmount72H = PERSONAL_AMOUNT) {
  return {
    $$type: 'ClaimLegacySeasonForV2',
    queryId,
    seasonId: 1n,
    personalDepositAmount72H,
    teamDepositAmount72H: TEAM_AMOUNT,
    referralAmount72H: REFERRAL_AMOUNT,
    leaderboardAmount72H: LEADERBOARD_AMOUNT,
    expectedClaimAmount72H: TOTAL_AMOUNT,
    proof: beginCell().endCell(),
  };
}

function registerSeasonClaimMessage(root: bigint, openAt: bigint) {
  return {
    $$type: 'RegisterSeasonClaim',
    seasonId: 1n,
    merkleRoot: root,
    totalAmount72H: TOTAL_AMOUNT,
    personalDepositTotal72H: PERSONAL_AMOUNT,
    teamDepositTotal72H: TEAM_AMOUNT,
    referralTotal72H: REFERRAL_AMOUNT,
    leaderboardTotal72H: LEADERBOARD_AMOUNT,
    openAt,
    evidenceHash: 1n,
  };
}

describe('SeasonClaimV2LegacyBridge', () => {
  it('bridges a single-leaf legacy SeasonClaim payout into SeasonClaimV2 funding', async () => {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_800_000_000;

    const owner = await blockchain.treasury('owner');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const seasonVault = await blockchain.treasury('season-vault');
    const legacyClaimJettonWallet = await blockchain.treasury('legacy-claim-jetton-wallet');
    const bridgeJettonWallet = await blockchain.treasury('bridge-jetton-wallet');
    const v2JettonWallet = await blockchain.treasury('v2-jetton-wallet');
    const forged = await blockchain.treasury('forged');
    const claimant = await blockchain.treasury('claimant');

    const legacyClaim = await openTactContract(
      blockchain,
      '../build/tact/SeasonClaim/SeasonClaim_SeasonClaim.js',
      'SeasonClaim',
      [owner.address, jettonMaster.address, legacyClaimJettonWallet.address, seasonVault.address],
    );
    const bridge = await openTactContract(
      blockchain,
      '../build/tact/SeasonClaimV2LegacyBridge/SeasonClaimV2LegacyBridge_SeasonClaimV2LegacyBridge.js',
      'SeasonClaimV2LegacyBridge',
      [owner.address, jettonMaster.address, legacyClaim.address, Address.parse('0:'.padEnd(66, '0')), bridgeJettonWallet.address],
    );
    const v2 = await openTactContract(
      blockchain,
      '../build/tact/SeasonClaimV2/SeasonClaimV2_SeasonClaimV2.js',
      'SeasonClaimV2',
      [owner.address, jettonMaster.address, v2JettonWallet.address, bridge.address],
    );

    await legacyClaim.send(owner.getSender(), { value: toNano('1') }, null);
    await v2.send(owner.getSender(), { value: toNano('1') }, null);
    await bridge.send(owner.getSender(), { value: toNano('1') }, null);
    await bridge.send(
      owner.getSender(),
      { value: toNano('0.1') },
      {
        $$type: 'SetSeasonClaimV2BridgeTarget',
        seasonClaimV2: v2.address,
      },
    );

    await legacyClaim.send(
      legacyClaimJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: TOTAL_AMOUNT,
        sender: seasonVault.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );

    const oldObservation = BigInt(blockchain.now) - 72n * 60n * 60n - 300n;
    const legacyRoot = seasonLeafHash(jettonMaster.address, legacyClaim.address, 1n, bridge.address);
    await legacyClaim.send(owner.getSender(), { value: toNano('0.2') }, registerSeasonClaimMessage(legacyRoot, oldObservation));
    await legacyClaim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockClaimStage',
        stage: 5n,
        priceUsd9: 100_000_000n,
        observedAt: oldObservation,
        evidenceHash: 2n,
      },
    );

    const bouncedLegacyQueryId = 99n;
    const bouncedLegacyClaim = await bridge.send(owner.getSender(), { value: toNano('0.3') }, claimLegacyMessage(bouncedLegacyQueryId, PERSONAL_AMOUNT + 1n));
    expect(() => findJettonTransfer(bouncedLegacyClaim)).toThrow('Expected a JettonTransfer outbound message.');
    expect(await (bridge.getGetPendingLegacyAmount as (queryId: bigint) => Promise<bigint>)(bouncedLegacyQueryId)).toBe(0n);

    const legacyQueryId = 101n;
    const bridgeClaim = await bridge.send(owner.getSender(), { value: toNano('0.3') }, claimLegacyMessage(legacyQueryId));
    const legacyTransfer = findJettonTransfer(bridgeClaim);
    expect(legacyTransfer.queryId).toBe(legacyQueryId);
    expect(legacyTransfer.amount).toBe(TOTAL_AMOUNT);
    expect(legacyTransfer.destination.equals(bridge.address)).toBe(true);

    const wrongAmountNotification = await bridge.send(
      bridgeJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: legacyQueryId,
        amount: TOTAL_AMOUNT - 1n,
        sender: legacyClaim.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );
    expect(() => findJettonTransfer(wrongAmountNotification)).toThrow('Expected a JettonTransfer outbound message.');
    expect(await (bridge.getGetPendingLegacyAmount as (queryId: bigint) => Promise<bigint>)(legacyQueryId)).toBe(TOTAL_AMOUNT);

    const bridgeFunding = await bridge.send(
      bridgeJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: legacyQueryId,
        amount: TOTAL_AMOUNT,
        sender: legacyClaim.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );
    const v2Forward = findJettonTransfer(bridgeFunding);
    const v2ForwardQueryId = BRIDGE_FORWARD_QUERY_OFFSET + legacyQueryId;
    expect(v2Forward.queryId).toBe(v2ForwardQueryId);
    expect(v2Forward.amount).toBe(TOTAL_AMOUNT);
    expect(v2Forward.destination.equals(v2.address)).toBe(true);
    expect(await (bridge.getGetClaimedFromLegacy72H as () => Promise<bigint>)()).toBe(TOTAL_AMOUNT);
    expect(await (bridge.getGetPendingForwardAmount as (queryId: bigint) => Promise<bigint>)(v2ForwardQueryId)).toBe(TOTAL_AMOUNT);

    await bridge.send(
      forged.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'ConfirmSeasonClaimFunding',
        queryId: v2ForwardQueryId,
        amount72H: TOTAL_AMOUNT,
      },
    );
    expect(await (bridge.getGetPendingForwardAmount as (queryId: bigint) => Promise<bigint>)(v2ForwardQueryId)).toBe(TOTAL_AMOUNT);

    await v2.send(
      v2JettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: v2ForwardQueryId,
        amount: TOTAL_AMOUNT,
        sender: bridge.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );
    expect(await (v2.getGetFunded72H as () => Promise<bigint>)()).toBe(TOTAL_AMOUNT);
    expect(await (bridge.getGetPendingForwardAmount as (queryId: bigint) => Promise<bigint>)(v2ForwardQueryId)).toBe(0n);
    expect(await (bridge.getGetForwardedToV272H as () => Promise<bigint>)()).toBe(TOTAL_AMOUNT);

    const v2Root = seasonLeafHash(jettonMaster.address, v2.address, 1n, claimant.address);
    await v2.send(owner.getSender(), { value: toNano('0.2') }, registerSeasonClaimMessage(v2Root, oldObservation));
    await v2.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'UnlockClaimStage',
        stage: 5n,
        priceUsd9: 100_000_000n,
        observedAt: oldObservation,
        evidenceHash: 3n,
      },
    );
    const userClaim = await v2.send(
      claimant.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'ClaimSeasonReward',
        queryId: 202n,
        seasonId: 1n,
        personalDepositAmount72H: PERSONAL_AMOUNT,
        teamDepositAmount72H: TEAM_AMOUNT,
        referralAmount72H: REFERRAL_AMOUNT,
        leaderboardAmount72H: LEADERBOARD_AMOUNT,
        proof: beginCell().endCell(),
      },
    );
    const userTransfer = findJettonTransfer(userClaim);
    expect(userTransfer.amount).toBe(TOTAL_AMOUNT);
    expect(userTransfer.destination.equals(claimant.address)).toBe(true);
  });
});
