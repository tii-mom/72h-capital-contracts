import { Blockchain, internal as sandboxInternal } from '@ton/sandbox';
import { Address, beginCell, Cell, Slice, toNano, Transaction } from '@ton/core';
import { findTransaction } from '@ton/test-utils';
import { describe, expect, it } from 'vitest';

const ONE_72H = 1_000_000_000n;
const TOTAL_AMOUNT = 1_000n * ONE_72H;
const PERSONAL_AMOUNT = (TOTAL_AMOUNT * 5000n) / 10000n;
const TEAM_AMOUNT = (TOTAL_AMOUNT * 2500n) / 10000n;
const REFERRAL_AMOUNT = (TOTAL_AMOUNT * 1500n) / 10000n;
const LEADERBOARD_AMOUNT = (TOTAL_AMOUNT * 1000n) / 10000n;
const BRIDGE_MANUAL_FORWARD_QUERY_OFFSET = 14_414_200_000_000_000n;
const LEGACY_BOUNCE_GRACE_SECONDS = 72 * 60 * 60;
const JETTON_TRANSFER = 0x0f8a7ea5;
const JETTON_TRANSFER_NOTIFICATION = 0x7362d09c;
const CONFIRM_SEASON_CLAIM_FUNDING = 0x7207000b;

interface OpenedContract {
  readonly address: Address;
  send(via: { address?: Address }, args: { value: bigint; bounce?: boolean | null }, message: unknown): Promise<{
    transactions: Transaction[];
  }>;
  [key: string]: unknown;
}

interface JettonTransferPayout {
  readonly queryId: bigint;
  readonly amount: bigint;
  readonly destination: Address;
  readonly responseDestination: Address;
  readonly forwardTonAmount: bigint;
}

interface RewardAmounts {
  readonly personal: bigint;
  readonly team: bigint;
  readonly referral: bigint;
  readonly leaderboard: bigint;
}

interface BridgeHarness {
  readonly blockchain: Blockchain;
  readonly owner: Awaited<ReturnType<Blockchain['treasury']>>;
  readonly seasonVault: Awaited<ReturnType<Blockchain['treasury']>>;
  readonly forged: Awaited<ReturnType<Blockchain['treasury']>>;
  readonly jetton: OpenedContract;
  readonly legacyClaim: OpenedContract;
  readonly bridge: OpenedContract;
  readonly v2?: OpenedContract;
  readonly target: Awaited<ReturnType<Blockchain['treasury']>>;
  readonly bridgeWallet: OpenedContract;
  readonly v2Wallet?: OpenedContract;
  readonly oldObservation: bigint;
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

async function openTactAddress<T extends { fromAddress: (address: Address) => unknown }>(
  blockchain: Blockchain,
  wrapperPath: string,
  exportName: string,
  address: Address,
) {
  const wrapper = (await import(wrapperPath)) as Record<string, T>;
  const contractFactory = wrapper[exportName];
  if (!contractFactory) {
    throw new Error(`Missing generated wrapper export ${exportName}`);
  }
  return blockchain.openContract(contractFactory.fromAddress(address) as Parameters<typeof blockchain.openContract>[0]) as unknown as OpenedContract;
}

function zeroAddress() {
  return Address.parse(`0:${'0'.repeat(64)}`);
}

function emptyForwardPayload() {
  return beginCell().storeBit(false).endCell().beginParse() as Slice;
}

function parseJettonTransfer(body: Cell): JettonTransferPayout {
  const slice = body.beginParse();
  if (slice.loadUint(32) !== JETTON_TRANSFER) {
    throw new Error('not a JettonTransfer');
  }

  const queryId = slice.loadUintBig(64);
  const amount = slice.loadCoins();
  const destination = slice.loadAddress();
  const responseDestination = slice.loadAddress();
  if (slice.loadBit()) {
    slice.loadRef();
  }
  const forwardTonAmount = slice.loadCoins();

  return {
    queryId,
    amount,
    destination,
    responseDestination,
    forwardTonAmount,
  };
}

function findJettonTransfer(
  result: { transactions: readonly { outMessages: { values(): Iterable<{ body: Cell }> } }[] },
  destination?: Address,
) {
  for (const transaction of result.transactions) {
    for (const message of transaction.outMessages.values()) {
      try {
        const transfer = parseJettonTransfer(message.body);
        if (!destination || transfer.destination.equals(destination)) {
          return transfer;
        }
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

function totalRewardAmount(amounts: RewardAmounts) {
  return amounts.personal + amounts.team + amounts.referral + amounts.leaderboard;
}

function seasonLeafHash(
  jettonMaster: Address,
  claimContract: Address,
  seasonId: bigint,
  account: Address,
  amounts: RewardAmounts = {
    personal: PERSONAL_AMOUNT,
    team: TEAM_AMOUNT,
    referral: REFERRAL_AMOUNT,
    leaderboard: LEADERBOARD_AMOUNT,
  },
) {
  return cellHash(beginCell()
    .storeUint(1n, 32)
    .storeRef(beginCell().storeAddress(jettonMaster).storeAddress(claimContract).endCell())
    .storeRef(beginCell()
      .storeUint(seasonId, 8)
      .storeAddress(account)
      .storeCoins(amounts.personal)
      .storeCoins(amounts.team)
      .storeCoins(amounts.referral)
      .storeCoins(amounts.leaderboard)
      .storeCoins(totalRewardAmount(amounts))
      .endCell())
    .endCell());
}

function claimLegacyMessage(queryId: bigint, expectedClaimAmount72H = TOTAL_AMOUNT) {
  return {
    $$type: 'ClaimLegacySeasonForV2',
    queryId,
    seasonId: 1n,
    personalDepositAmount72H: PERSONAL_AMOUNT,
    teamDepositAmount72H: TEAM_AMOUNT,
    referralAmount72H: REFERRAL_AMOUNT,
    leaderboardAmount72H: LEADERBOARD_AMOUNT,
    expectedClaimAmount72H,
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

function unlockStageMessage(stage: 1n | 5n, observedAt: bigint) {
  return {
    $$type: 'UnlockClaimStage',
    stage,
    priceUsd9: stage === 1n ? 10_000_000n : 100_000_000n,
    observedAt,
    evidenceHash: 2n,
  };
}

function forwardBridgeWalletMessage(queryId: bigint, amount72H: bigint) {
  return {
    $$type: 'ForwardBridgeWalletToV2',
    queryId,
    amount72H,
  };
}

function bouncedJettonTransferBody(queryId: bigint, amount: bigint) {
  return beginCell()
    .storeUint(0xffffffff, 32)
    .storeUint(JETTON_TRANSFER, 32)
    .storeUint(queryId, 64)
    .storeCoins(amount)
    .endCell();
}

async function deployBridgeHarness(options: { unlockStage?: 1n | 5n; realV2?: boolean } = {}): Promise<BridgeHarness> {
  const unlockStage = options.unlockStage ?? 5n;
  const realV2 = options.realV2 ?? true;
  const blockchain = await Blockchain.create();
  blockchain.now = 1_800_000_000;

  const owner = await blockchain.treasury('owner');
  const seasonVault = await blockchain.treasury('season-vault');
  const forged = await blockchain.treasury('forged');
  const target = await blockchain.treasury('season-claim-v2-target');

  const jetton = await openTactContract(
    blockchain,
    '../build/tact/TestJetton72H/TestJetton72H_TestJetton72H.js',
    'TestJetton72H',
    [owner.address],
  );
  const legacyClaim = await openTactContract(
    blockchain,
    '../build/tact/SeasonClaim/SeasonClaim_SeasonClaim.js',
    'SeasonClaim',
    [owner.address, jetton.address, zeroAddress(), seasonVault.address],
  );
  const bridge = await openTactContract(
    blockchain,
    '../build/tact/SeasonClaimV2LegacyBridge/SeasonClaimV2LegacyBridge_SeasonClaimV2LegacyBridge.js',
    'SeasonClaimV2LegacyBridge',
    [owner.address, jetton.address, legacyClaim.address, zeroAddress(), zeroAddress()],
  );
  const v2 = realV2
    ? await openTactContract(
      blockchain,
      '../build/tact/SeasonClaimV2/SeasonClaimV2_SeasonClaimV2.js',
      'SeasonClaimV2',
      [owner.address, jetton.address, zeroAddress(), bridge.address],
    )
    : undefined;

  await jetton.send(owner.getSender(), { value: toNano('1') }, null);
  await legacyClaim.send(owner.getSender(), { value: toNano('1') }, null);
  await bridge.send(owner.getSender(), { value: toNano('1') }, null);
  if (v2) {
    await v2.send(owner.getSender(), { value: toNano('1') }, null);
  }

  const getWalletAddress = jetton.getGetWalletAddress as (ownerAddress: Address) => Promise<Address>;
  const legacyClaimWalletAddress = await getWalletAddress(legacyClaim.address);
  const bridgeWalletAddress = await getWalletAddress(bridge.address);
  const seasonVaultWalletAddress = await getWalletAddress(seasonVault.address);
  const v2TargetAddress = v2 ? v2.address : target.address;
  const v2WalletAddress = await getWalletAddress(v2TargetAddress);

  await legacyClaim.send(
    owner.getSender(),
    { value: toNano('0.1') },
    {
      $$type: 'SetSeasonClaimJettonWallet',
      wallet: legacyClaimWalletAddress,
    },
  );
  if (v2) {
    await v2.send(
      owner.getSender(),
      { value: toNano('0.1') },
      {
        $$type: 'SetSeasonClaimJettonWallet',
        wallet: v2WalletAddress,
      },
    );
  }
  await bridge.send(
    owner.getSender(),
    { value: toNano('0.1') },
    {
      $$type: 'SetSeasonClaimV2BridgeJettonWallet',
      wallet: bridgeWalletAddress,
    },
  );
  await bridge.send(
    owner.getSender(),
    { value: toNano('0.1') },
    {
      $$type: 'SetSeasonClaimV2BridgeTarget',
      seasonClaimV2: v2TargetAddress,
    },
  );

  const seasonVaultWallet = await openTactAddress(
    blockchain,
    '../build/tact/TestJetton72H/TestJetton72H_TestJetton72HWallet.js',
    'TestJetton72HWallet',
    seasonVaultWalletAddress,
  );
  const bridgeWallet = await openTactAddress(
    blockchain,
    '../build/tact/TestJetton72H/TestJetton72H_TestJetton72HWallet.js',
    'TestJetton72HWallet',
    bridgeWalletAddress,
  );
  const v2Wallet = await openTactAddress(
    blockchain,
    '../build/tact/TestJetton72H/TestJetton72H_TestJetton72HWallet.js',
    'TestJetton72HWallet',
    v2WalletAddress,
  );

  await jetton.send(
    owner.getSender(),
    { value: toNano('0.3') },
    {
      $$type: 'MintTest72H',
      to: seasonVault.address,
      amount72H: TOTAL_AMOUNT,
    },
  );
  await seasonVaultWallet.send(
    seasonVault.getSender(),
    { value: toNano('0.3') },
    {
      $$type: 'JettonTransfer',
      queryId: 11n,
      amount: TOTAL_AMOUNT,
      destination: legacyClaim.address,
      responseDestination: seasonVault.address,
      customPayload: null,
      forwardTonAmount: toNano('0.03'),
      forwardPayload: emptyForwardPayload(),
    },
  );
  expect(await (legacyClaim.getGetFunded72H as () => Promise<bigint>)()).toBe(TOTAL_AMOUNT);

  const oldObservation = BigInt(blockchain.now) - 72n * 60n * 60n - 300n;
  const legacyRoot = seasonLeafHash(jetton.address, legacyClaim.address, 1n, bridge.address);
  await legacyClaim.send(owner.getSender(), { value: toNano('0.2') }, registerSeasonClaimMessage(legacyRoot, oldObservation));
  await legacyClaim.send(owner.getSender(), { value: toNano('0.2') }, unlockStageMessage(unlockStage, oldObservation));

  const result: BridgeHarness = {
    blockchain,
    owner,
    seasonVault,
    forged,
    jetton,
    legacyClaim,
    bridge,
    target,
    bridgeWallet,
    oldObservation,
  };
  if (v2) {
    return { ...result, v2, v2Wallet };
  }
  return result;
}

describe('SeasonClaimV2LegacyBridge', () => {
  it('uses the real legacy zero-forward notification path, then manually forwards bridge wallet inventory to V2', async () => {
    const {
      blockchain,
      owner,
      legacyClaim,
      bridge,
      bridgeWallet,
      v2,
      v2Wallet,
    } = await deployBridgeHarness({ realV2: true, unlockStage: 5n });
    if (!v2 || !v2Wallet) {
      throw new Error('V2 harness was not deployed');
    }

    const legacyQueryId = 101n;
    const bridgeClaim = await bridge.send(owner.getSender(), { value: toNano('0.3') }, claimLegacyMessage(legacyQueryId));
    const legacyTransfer = findJettonTransfer(bridgeClaim, bridge.address);
    expect(legacyTransfer.queryId).toBe(legacyQueryId);
    expect(legacyTransfer.amount).toBe(TOTAL_AMOUNT);
    expect(legacyTransfer.forwardTonAmount).toBe(0n);
    expect(legacyTransfer.destination.equals(bridge.address)).toBe(true);
    expect(findTransaction(bridgeClaim.transactions, {
      from: bridgeWallet.address,
      to: bridge.address,
      op: JETTON_TRANSFER_NOTIFICATION,
    })).toBeUndefined();
    expect(await (bridgeWallet.getGetBalance as () => Promise<bigint>)()).toBe(TOTAL_AMOUNT);
    expect(await (bridge.getGetPendingForward72H as () => Promise<bigint>)()).toBe(0n);
    expect(await (bridge.getGetForwardedToV272H as () => Promise<bigint>)()).toBe(0n);
    expect(await (bridge.getGetLegacyClaimRequested72H as () => Promise<bigint>)()).toBe(TOTAL_AMOUNT);
    expect(await (bridge.getGetExpectedAvailableToForward72H as () => Promise<bigint>)()).toBe(TOTAL_AMOUNT);
    expect(await (legacyClaim.getGetPendingClaimAmount as (queryId: bigint) => Promise<bigint>)(legacyQueryId)).toBe(TOTAL_AMOUNT);

    const forwardQueryId = BRIDGE_MANUAL_FORWARD_QUERY_OFFSET + 1n;
    const manualForward = await bridge.send(
      owner.getSender(),
      { value: toNano('0.3') },
      forwardBridgeWalletMessage(forwardQueryId, TOTAL_AMOUNT),
    );
    const v2Forward = findJettonTransfer(manualForward, v2.address);
    expect(v2Forward.queryId).toBe(forwardQueryId);
    expect(v2Forward.amount).toBe(TOTAL_AMOUNT);
    expect(v2Forward.destination.equals(v2.address)).toBe(true);
    expect(v2Forward.forwardTonAmount).toBe(toNano('0.03'));
    expect(findTransaction(manualForward.transactions, {
      from: v2Wallet.address,
      to: v2.address,
      op: JETTON_TRANSFER_NOTIFICATION,
      success: true,
    })).toBeDefined();
    expect(findTransaction(manualForward.transactions, {
      from: v2.address,
      to: bridge.address,
      op: CONFIRM_SEASON_CLAIM_FUNDING,
      success: true,
    })).toBeDefined();
    expect(await (v2.getGetFunded72H as () => Promise<bigint>)()).toBe(TOTAL_AMOUNT);
    expect(await (bridgeWallet.getGetBalance as () => Promise<bigint>)()).toBe(0n);
    expect(await (v2Wallet.getGetBalance as () => Promise<bigint>)()).toBe(TOTAL_AMOUNT);
    expect(await (bridge.getGetPendingForwardAmount as (queryId: bigint) => Promise<bigint>)(forwardQueryId)).toBe(0n);
    expect(await (bridge.getGetCompletedForwardAmount as (queryId: bigint) => Promise<bigint>)(forwardQueryId)).toBe(TOTAL_AMOUNT);
    expect(await (bridge.getGetForwardedToV272H as () => Promise<bigint>)()).toBe(TOTAL_AMOUNT);
    expect(await (bridge.getGetExpectedAvailableToForward72H as () => Promise<bigint>)()).toBe(0n);

    blockchain.now = (blockchain.now ?? 0) + LEGACY_BOUNCE_GRACE_SECONDS + 1;
    await legacyClaim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'SettleSeasonClaimPending',
        queryId: legacyQueryId,
      },
    );
    expect(await (legacyClaim.getGetPendingClaimAmount as (queryId: bigint) => Promise<bigint>)(legacyQueryId)).toBe(0n);
  });

  it('rolls back a pending manual forward when the bridge wallet balance is insufficient', async () => {
    const {
      owner,
      bridge,
      bridgeWallet,
      v2,
    } = await deployBridgeHarness({ realV2: true, unlockStage: 1n });
    if (!v2) {
      throw new Error('V2 harness was not deployed');
    }

    const legacyQueryId = 201n;
    const bridgeClaim = await bridge.send(owner.getSender(), { value: toNano('0.3') }, claimLegacyMessage(legacyQueryId));
    const actualUnlockedAmount = TOTAL_AMOUNT / 5n;
    const legacyTransfer = findJettonTransfer(bridgeClaim, bridge.address);
    expect(legacyTransfer.amount).toBe(actualUnlockedAmount);
    expect(await (bridgeWallet.getGetBalance as () => Promise<bigint>)()).toBe(actualUnlockedAmount);
    expect(await (bridge.getGetExpectedAvailableToForward72H as () => Promise<bigint>)()).toBe(TOTAL_AMOUNT);

    const insufficientQueryId = BRIDGE_MANUAL_FORWARD_QUERY_OFFSET + 20n;
    const insufficientForward = await bridge.send(
      owner.getSender(),
      { value: toNano('0.3') },
      forwardBridgeWalletMessage(insufficientQueryId, TOTAL_AMOUNT),
    );
    expect(findTransaction(insufficientForward.transactions, {
      from: bridgeWallet.address,
      to: bridge.address,
      inMessageBounced: true,
      success: true,
    })).toBeDefined();
    expect(await (bridge.getGetPendingForwardAmount as (queryId: bigint) => Promise<bigint>)(insufficientQueryId)).toBe(0n);
    expect(await (bridge.getGetPendingForward72H as () => Promise<bigint>)()).toBe(0n);
    expect(await (bridge.getGetForwardedToV272H as () => Promise<bigint>)()).toBe(0n);
    expect(await (bridgeWallet.getGetBalance as () => Promise<bigint>)()).toBe(actualUnlockedAmount);

    const retryQueryId = BRIDGE_MANUAL_FORWARD_QUERY_OFFSET + 21n;
    await bridge.send(
      owner.getSender(),
      { value: toNano('0.3') },
      forwardBridgeWalletMessage(retryQueryId, actualUnlockedAmount),
    );
    expect(await (v2.getGetFunded72H as () => Promise<bigint>)()).toBe(actualUnlockedAmount);
    expect(await (bridge.getGetCompletedForwardAmount as (queryId: bigint) => Promise<bigint>)(retryQueryId)).toBe(actualUnlockedAmount);
    expect(await (bridge.getGetForwardedToV272H as () => Promise<bigint>)()).toBe(actualUnlockedAmount);
  });

  it('rejects wrong amounts, forged confirms, and duplicate manual forward query ids', async () => {
    const {
      blockchain,
      owner,
      forged,
      target,
      bridge,
      bridgeWallet,
    } = await deployBridgeHarness({ realV2: false, unlockStage: 5n });

    const legacyQueryId = 301n;
    await bridge.send(owner.getSender(), { value: toNano('0.3') }, claimLegacyMessage(legacyQueryId));
    expect(await (bridgeWallet.getGetBalance as () => Promise<bigint>)()).toBe(TOTAL_AMOUNT);

    const overExpectedQueryId = BRIDGE_MANUAL_FORWARD_QUERY_OFFSET + 30n;
    const overExpected = await bridge.send(
      owner.getSender(),
      { value: toNano('0.3') },
      forwardBridgeWalletMessage(overExpectedQueryId, TOTAL_AMOUNT + 1n),
    );
    expect(() => findJettonTransfer(overExpected)).toThrow('Expected a JettonTransfer outbound message.');
    expect(await (bridge.getGetPendingForwardAmount as (queryId: bigint) => Promise<bigint>)(overExpectedQueryId)).toBe(0n);

    const forwardQueryId = BRIDGE_MANUAL_FORWARD_QUERY_OFFSET + 31n;
    const manualForward = await bridge.send(
      owner.getSender(),
      { value: toNano('0.3') },
      forwardBridgeWalletMessage(forwardQueryId, TOTAL_AMOUNT),
    );
    expect(findJettonTransfer(manualForward, target.address).amount).toBe(TOTAL_AMOUNT);
    expect(await (bridge.getGetPendingForwardAmount as (queryId: bigint) => Promise<bigint>)(forwardQueryId)).toBe(TOTAL_AMOUNT);
    expect(await (bridge.getGetPendingForward72H as () => Promise<bigint>)()).toBe(TOTAL_AMOUNT);

    await bridge.send(
      forged.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'ConfirmSeasonClaimFunding',
        queryId: forwardQueryId,
        amount72H: TOTAL_AMOUNT,
      },
    );
    expect(await (bridge.getGetPendingForwardAmount as (queryId: bigint) => Promise<bigint>)(forwardQueryId)).toBe(TOTAL_AMOUNT);

    await bridge.send(
      target.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'ConfirmSeasonClaimFunding',
        queryId: forwardQueryId,
        amount72H: TOTAL_AMOUNT - 1n,
      },
    );
    expect(await (bridge.getGetPendingForwardAmount as (queryId: bigint) => Promise<bigint>)(forwardQueryId)).toBe(TOTAL_AMOUNT);

    const duplicatePending = await bridge.send(
      owner.getSender(),
      { value: toNano('0.3') },
      forwardBridgeWalletMessage(forwardQueryId, TOTAL_AMOUNT),
    );
    expect(() => findJettonTransfer(duplicatePending)).toThrow('Expected a JettonTransfer outbound message.');
    expect(await (bridge.getGetPendingForwardAmount as (queryId: bigint) => Promise<bigint>)(forwardQueryId)).toBe(TOTAL_AMOUNT);

    await bridge.send(
      target.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'ConfirmSeasonClaimFunding',
        queryId: forwardQueryId,
        amount72H: TOTAL_AMOUNT,
      },
    );
    expect(await (bridge.getGetPendingForwardAmount as (queryId: bigint) => Promise<bigint>)(forwardQueryId)).toBe(0n);
    expect(await (bridge.getGetCompletedForwardAmount as (queryId: bigint) => Promise<bigint>)(forwardQueryId)).toBe(TOTAL_AMOUNT);

    await blockchain.sendMessage(sandboxInternal({
      from: bridgeWallet.address,
      to: bridge.address,
      value: toNano('0.2'),
      bounced: true,
      body: bouncedJettonTransferBody(forwardQueryId, TOTAL_AMOUNT),
    }));
    expect(await (bridge.getGetCompletedForwardAmount as (queryId: bigint) => Promise<bigint>)(forwardQueryId)).toBe(TOTAL_AMOUNT);

    const duplicateCompleted = await bridge.send(
      owner.getSender(),
      { value: toNano('0.3') },
      forwardBridgeWalletMessage(forwardQueryId, TOTAL_AMOUNT),
    );
    expect(() => findJettonTransfer(duplicateCompleted)).toThrow('Expected a JettonTransfer outbound message.');
  });
});
