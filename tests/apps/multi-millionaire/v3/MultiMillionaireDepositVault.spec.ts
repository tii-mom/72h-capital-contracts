import { Blockchain, internal as sandboxInternal } from '@ton/sandbox';
import { Address, beginCell, Cell, Slice, toNano } from '@ton/core';
import { describe, expect, it } from 'vitest';
import '@ton/test-utils';

const TOKEN_SCALE_9 = 1_000_000_000n;
const PRICE_DELAY_SECONDS = 3_600;
const PRICE_FRESHNESS_SECONDS = 86_400;
const TARGET_10K_USD9 = 10_000n * TOKEN_SCALE_9;
const TARGET_100K_USD9 = 100_000n * TOKEN_SCALE_9;
const ONE_USD9 = TOKEN_SCALE_9;
const TEN_THOUSAND_72H_RAW = 10_000n * TOKEN_SCALE_9;

interface OpenedContract {
  readonly address: Address;
  send(via: { address?: Address }, args: { value: bigint; bounce?: boolean | null }, message: unknown): Promise<{
    transactions: { outMessages: { values(): Iterable<{ body: Cell }> } }[];
  }>;
  getVaultState(): Promise<{
    owner: Address;
    jettonMaster: Address;
    vaultJettonWallet: Address | null;
    paused: boolean;
    activePriceUsd9: bigint;
    pendingPriceUsd9: bigint;
    totalDepositedRaw: bigint;
    totalActiveRaw: bigint;
    totalWithdrawnRaw: bigint;
    depositCount: bigint;
    withdrawCount: bigint;
    userCount: bigint;
    lastDepositor: Address | null;
    lastSeasonId: bigint;
    lastWaveId: bigint;
    lastAmountRaw: bigint;
    lastTargetUsd9: bigint;
  }>;
  getUserState(user: Address): Promise<{
    activeRaw: bigint;
    targetUsd9: bigint;
    seasonId: bigint;
    waveId: bigint;
    goalReached: boolean;
    pendingWithdrawal: boolean;
  }>;
  getPendingWithdrawal(queryId: bigint): Promise<{
    owner: Address | null;
    amountRaw: bigint;
  }>;
  getSupportedTarget(targetUsd9: bigint): Promise<boolean>;
  getDerivedDepositKey(user: Address, queryId: bigint): Promise<bigint>;
}

interface JettonTransferPayout {
  readonly queryId: bigint;
  readonly amount: bigint;
  readonly destination: Address;
  readonly responseDestination: Address;
}

async function openDepositVault(blockchain: Blockchain, owner: Address, jettonMaster: Address) {
  const wrapperPath = new URL(
    '../../../../build/tact/MultiMillionaireDepositVault/MultiMillionaireDepositVault_MultiMillionaireDepositVault.js',
    import.meta.url,
  ).href;
  const wrapper = (await import(wrapperPath)) as {
    MultiMillionaireDepositVault: {
      fromInit(owner: Address, jettonMaster: Address): Promise<unknown>;
    };
  };
  return blockchain.openContract(
    (await wrapper.MultiMillionaireDepositVault.fromInit(owner, jettonMaster)) as Parameters<typeof blockchain.openContract>[0],
  ) as unknown as OpenedContract;
}

function depositPayload(seasonId: bigint, waveId: bigint, targetUsd9: bigint): Slice {
  return beginCell()
    .storeBit(false)
    .storeUint(seasonId, 8)
    .storeUint(waveId, 32)
    .storeUint(targetUsd9, 128)
    .asSlice();
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
    responseDestination: slice.loadAddress(),
  };
}

function findJettonTransfer(result: { transactions: readonly { outMessages: { values(): Iterable<{ body: Cell }> } }[] }) {
  for (const transaction of result.transactions) {
    for (const message of transaction.outMessages.values()) {
      try {
        return parseJettonTransfer(message.body);
      } catch {
        // Other outbound messages are irrelevant to these assertions.
      }
    }
  }

  throw new Error('Expected MultiMillionaireDepositVault to dispatch a JettonTransfer payout.');
}

function bouncedJettonTransferBody(queryId: bigint, amount: bigint) {
  return beginCell()
    .storeUint(0xffffffff, 32)
    .storeUint(0x0f8a7ea5, 32)
    .storeUint(queryId, 64)
    .storeCoins(amount)
    .endCell();
}

async function deployVaultFixture() {
  const blockchain = await Blockchain.create();
  blockchain.now = 1_800_000_000;
  const owner = await blockchain.treasury('owner');
  const user = await blockchain.treasury('user');
  const other = await blockchain.treasury('other');
  const jettonMaster = await blockchain.treasury('jetton-master');
  const vaultJettonWallet = await blockchain.treasury('vault-jetton-wallet');
  const forgedWallet = await blockchain.treasury('forged-wallet');
  const vault = await openDepositVault(blockchain, owner.address, jettonMaster.address);

  const deploy = await vault.send(owner.getSender(), { value: toNano('0.05') }, null);
  expect(deploy.transactions).transaction({
    from: owner.address,
    to: vault.address,
    deploy: true,
    success: true,
  });

  await vault.send(
    owner.getSender(),
    { value: toNano('0.05') },
    { $$type: 'SetVaultJettonWallet', queryId: 1n, vaultJettonWallet: vaultJettonWallet.address },
  );

  return { blockchain, owner, user, other, jettonMaster, vaultJettonWallet, forgedWallet, vault };
}

async function unpause(vault: OpenedContract, owner: { getSender(): { address?: Address } }) {
  await vault.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'SetPaused', paused: false });
}

async function deposit(
  vault: OpenedContract,
  vaultJettonWallet: { address: Address; getSender(): { address?: Address } },
  user: Address,
  queryId: bigint,
  amount: bigint,
  targetUsd9 = TARGET_10K_USD9,
) {
  return vault.send(
    vaultJettonWallet.getSender(),
    { value: toNano('0.05') },
    {
      $$type: 'JettonTransferNotification',
      queryId,
      amount,
      sender: user,
      forwardPayload: depositPayload(2n, 77n, targetUsd9),
    },
  );
}

async function stageAndApplyPrice(
  blockchain: Blockchain,
  vault: OpenedContract,
  owner: { getSender(): { address?: Address } },
  priceUsd9: bigint,
  queryId = 100n,
) {
  const stagedAt = blockchain.now || 1_800_000_000;
  await vault.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'StagePrice', queryId, priceUsd9 });
  blockchain.now = stagedAt + PRICE_DELAY_SECONDS + 1;
  await vault.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'ApplyPrice', queryId: queryId + 1n });
}

describe('MultiMillionaireDepositVault', () => {
  it('starts paused, binds the V3 jetton master, and records only supported target deposits from the vault wallet', async () => {
    const { vault, owner, user, other, jettonMaster, vaultJettonWallet, forgedWallet } = await deployVaultFixture();

    let state = await vault.getVaultState();
    expect(state.owner.equals(owner.address)).toBe(true);
    expect(state.jettonMaster.equals(jettonMaster.address)).toBe(true);
    expect(state.vaultJettonWallet?.equals(vaultJettonWallet.address)).toBe(true);
    expect(state.paused).toBe(true);
    expect(await vault.getSupportedTarget(TARGET_10K_USD9)).toBe(true);
    expect(await vault.getSupportedTarget(42n)).toBe(false);

    const pausedDeposit = await deposit(vault, vaultJettonWallet, user.address, 10n, 1n);
    expect(pausedDeposit.transactions).transaction({
      from: vaultJettonWallet.address,
      to: vault.address,
      success: false,
      exitCode: 1001,
    });

    await unpause(vault, owner);

    const forgedDeposit = await vault.send(
      forgedWallet.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 11n,
        amount: 100n,
        sender: user.address,
        forwardPayload: depositPayload(2n, 77n, TARGET_10K_USD9),
      },
    );
    expect(forgedDeposit.transactions).transaction({
      from: forgedWallet.address,
      to: vault.address,
      success: false,
      exitCode: 1003,
    });

    const invalidTarget = await deposit(vault, vaultJettonWallet, user.address, 12n, 100n, 42n);
    expect(invalidTarget.transactions).transaction({
      from: vaultJettonWallet.address,
      to: vault.address,
      success: false,
      exitCode: 1006,
    });

    const first = await deposit(vault, vaultJettonWallet, user.address, 13n, 100n);
    expect(first.transactions).transaction({
      from: vaultJettonWallet.address,
      to: vault.address,
      success: true,
    });

    const mismatchedTarget = await deposit(vault, vaultJettonWallet, user.address, 14n, 100n, TARGET_100K_USD9);
    expect(mismatchedTarget.transactions).transaction({
      from: vaultJettonWallet.address,
      to: vault.address,
      success: false,
      exitCode: 1009,
    });

    const duplicateQuery = await deposit(vault, vaultJettonWallet, user.address, 13n, 100n);
    expect(duplicateQuery.transactions).transaction({
      from: vaultJettonWallet.address,
      to: vault.address,
      success: false,
      exitCode: 1008,
    });

    const second = await deposit(vault, vaultJettonWallet, user.address, 15n, 250n);
    expect(second.transactions).transaction({
      from: vaultJettonWallet.address,
      to: vault.address,
      success: true,
    });

    await deposit(vault, vaultJettonWallet, other.address, 13n, 500n);

    const userState = await vault.getUserState(user.address);
    expect(userState.activeRaw).toBe(350n);
    expect(userState.targetUsd9).toBe(TARGET_10K_USD9);
    expect(userState.seasonId).toBe(2n);
    expect(userState.waveId).toBe(77n);
    expect(userState.goalReached).toBe(false);

    state = await vault.getVaultState();
    expect(state.totalDepositedRaw).toBe(850n);
    expect(state.totalActiveRaw).toBe(850n);
    expect(state.depositCount).toBe(3n);
    expect(state.userCount).toBe(2n);
    expect(state.lastDepositor?.equals(other.address)).toBe(true);
    expect(state.lastTargetUsd9).toBe(TARGET_10K_USD9);
  });

  it('requires owner delayed price updates and blocks withdrawals without a fresh reached target', async () => {
    const { blockchain, vault, owner, user, other, vaultJettonWallet } = await deployVaultFixture();
    await unpause(vault, owner);
    await deposit(vault, vaultJettonWallet, user.address, 20n, TEN_THOUSAND_72H_RAW - 1n);

    const nonOwnerStage = await vault.send(other.getSender(), { value: toNano('0.05') }, { $$type: 'StagePrice', queryId: 200n, priceUsd9: ONE_USD9 });
    expect(nonOwnerStage.transactions).transaction({
      from: other.address,
      to: vault.address,
      success: false,
      exitCode: 132,
    });

    await vault.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'StagePrice', queryId: 201n, priceUsd9: ONE_USD9 });
    const tooEarly = await vault.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'ApplyPrice', queryId: 202n });
    expect(tooEarly.transactions).transaction({
      from: owner.address,
      to: vault.address,
      success: false,
      exitCode: 1052,
    });

    blockchain.now = 1_800_000_000 + PRICE_DELAY_SECONDS + 1;
    await vault.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'ApplyPrice', queryId: 203n });

    const notReached = await vault.send(user.getSender(), { value: toNano('0.15') }, { $$type: 'WithdrawAll', queryId: 204n });
    expect(notReached.transactions).transaction({
      from: user.address,
      to: vault.address,
      success: false,
      exitCode: 1026,
    });

    await vault.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'StagePrice', queryId: 205n, priceUsd9: (ONE_USD9 * 13n) / 10n });
    blockchain.now = 1_800_000_000 + PRICE_DELAY_SECONDS * 2 + 2;
    const tooLarge = await vault.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'ApplyPrice', queryId: 206n });
    expect(tooLarge.transactions).transaction({
      from: owner.address,
      to: vault.address,
      success: false,
      exitCode: 1053,
    });

    blockchain.now += PRICE_FRESHNESS_SECONDS + 1;
    await deposit(vault, vaultJettonWallet, user.address, 21n, 1n);
    const stale = await vault.send(user.getSender(), { value: toNano('0.15') }, { $$type: 'WithdrawAll', queryId: 207n });
    expect(stale.transactions).transaction({
      from: user.address,
      to: vault.address,
      success: false,
      exitCode: 1025,
    });
  });

  it('withdraws the full active balance after target, finalizes on JettonExcesses, and allows a new cycle', async () => {
    const { blockchain, vault, owner, user, vaultJettonWallet } = await deployVaultFixture();
    await unpause(vault, owner);
    await stageAndApplyPrice(blockchain, vault, owner, ONE_USD9);
    await deposit(vault, vaultJettonWallet, user.address, 30n, TEN_THOUSAND_72H_RAW);

    const withdraw = await vault.send(user.getSender(), { value: toNano('0.15') }, { $$type: 'WithdrawAll', queryId: 300n });
    const payout = findJettonTransfer(withdraw);
    expect(payout.queryId).toBe(300n);
    expect(payout.amount).toBe(TEN_THOUSAND_72H_RAW);
    expect(payout.destination.equals(user.address)).toBe(true);
    expect(payout.responseDestination.equals(vault.address)).toBe(true);

    let userState = await vault.getUserState(user.address);
    expect(userState.activeRaw).toBe(0n);
    expect(userState.pendingWithdrawal).toBe(true);
    let pending = await vault.getPendingWithdrawal(300n);
    expect(pending.owner?.equals(user.address)).toBe(true);
    expect(pending.amountRaw).toBe(TEN_THOUSAND_72H_RAW);

    const repeatedWithdraw = await vault.send(user.getSender(), { value: toNano('0.15') }, { $$type: 'WithdrawAll', queryId: 301n });
    expect(repeatedWithdraw.transactions).transaction({
      from: user.address,
      to: vault.address,
      success: false,
      exitCode: 1022,
    });

    await vault.send(vaultJettonWallet.getSender(), { value: toNano('0.05') }, { $$type: 'JettonExcesses', queryId: 300n });
    userState = await vault.getUserState(user.address);
    expect(userState.activeRaw).toBe(0n);
    expect(userState.targetUsd9).toBe(0n);
    expect(userState.pendingWithdrawal).toBe(false);
    pending = await vault.getPendingWithdrawal(300n);
    expect(pending.amountRaw).toBe(0n);

    const nextCycle = await deposit(vault, vaultJettonWallet, user.address, 31n, 1_000n, TARGET_100K_USD9);
    expect(nextCycle.transactions).transaction({
      from: vaultJettonWallet.address,
      to: vault.address,
      success: true,
    });
    expect((await vault.getUserState(user.address)).targetUsd9).toBe(TARGET_100K_USD9);

    const state = await vault.getVaultState();
    expect(state.totalWithdrawnRaw).toBe(TEN_THOUSAND_72H_RAW);
    expect(state.withdrawCount).toBe(1n);
    expect(state.totalActiveRaw).toBe(1_000n);
  });

  it('restores active state only for authenticated matching bounced withdrawals', async () => {
    const { blockchain, vault, owner, user, forgedWallet, vaultJettonWallet } = await deployVaultFixture();
    await unpause(vault, owner);
    await stageAndApplyPrice(blockchain, vault, owner, ONE_USD9);
    await deposit(vault, vaultJettonWallet, user.address, 40n, TEN_THOUSAND_72H_RAW);

    const withdraw = await vault.send(user.getSender(), { value: toNano('0.15') }, { $$type: 'WithdrawAll', queryId: 400n });
    const payout = findJettonTransfer(withdraw);

    await blockchain.sendMessage(sandboxInternal({
      from: forgedWallet.address,
      to: vault.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(payout.queryId, payout.amount),
    }));
    expect((await vault.getUserState(user.address)).pendingWithdrawal).toBe(true);
    expect((await vault.getUserState(user.address)).activeRaw).toBe(0n);

    await blockchain.sendMessage(sandboxInternal({
      from: vaultJettonWallet.address,
      to: vault.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(payout.queryId, payout.amount - 1n),
    }));
    expect((await vault.getUserState(user.address)).pendingWithdrawal).toBe(true);
    expect((await vault.getUserState(user.address)).activeRaw).toBe(0n);

    await blockchain.sendMessage(sandboxInternal({
      from: vaultJettonWallet.address,
      to: vault.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(payout.queryId, payout.amount),
    }));

    const userState = await vault.getUserState(user.address);
    expect(userState.pendingWithdrawal).toBe(false);
    expect(userState.activeRaw).toBe(TEN_THOUSAND_72H_RAW);
    const state = await vault.getVaultState();
    expect(state.totalActiveRaw).toBe(TEN_THOUSAND_72H_RAW);
    expect(state.totalWithdrawnRaw).toBe(0n);
    expect(state.withdrawCount).toBe(0n);
  });

  it('blocks deposits and withdrawals while paused and locks the vault wallet after first deposit', async () => {
    const { blockchain, vault, owner, user, other, vaultJettonWallet } = await deployVaultFixture();
    await unpause(vault, owner);
    await stageAndApplyPrice(blockchain, vault, owner, ONE_USD9);
    await deposit(vault, vaultJettonWallet, user.address, 50n, TEN_THOUSAND_72H_RAW);

    const walletChange = await vault.send(
      owner.getSender(),
      { value: toNano('0.05') },
      { $$type: 'SetVaultJettonWallet', queryId: 51n, vaultJettonWallet: other.address },
    );
    expect(walletChange.transactions).transaction({
      from: owner.address,
      to: vault.address,
      success: false,
      exitCode: 1007,
    });

    await vault.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'SetPaused', paused: true });

    const pausedDeposit = await deposit(vault, vaultJettonWallet, user.address, 52n, 1n);
    expect(pausedDeposit.transactions).transaction({
      from: vaultJettonWallet.address,
      to: vault.address,
      success: false,
      exitCode: 1001,
    });

    const pausedWithdraw = await vault.send(user.getSender(), { value: toNano('0.15') }, { $$type: 'WithdrawAll', queryId: 53n });
    expect(pausedWithdraw.transactions).transaction({
      from: user.address,
      to: vault.address,
      success: false,
      exitCode: 1020,
    });
  });
});
