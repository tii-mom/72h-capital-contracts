import { Blockchain } from '@ton/sandbox';
import { Address, beginCell, Slice, toNano } from '@ton/core';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const ONE_72H = 1_000_000_000n;
const TARGET_100K_USD9 = 100_000n * 1_000_000_000n;
const TARGET_500K_USD9 = 500_000n * 1_000_000_000n;
const UNSUPPORTED_TARGET_USD9 = 123_456n * 1_000_000_000n;

interface DepositVaultSandbox {
  readonly address: Address;
  send(
    via: { address?: Address },
    args: { value: bigint; bounce?: boolean | null },
    message:
      | null
      | { $$type: 'SetDepositVaultJettonWallet'; wallet: Address }
      | { $$type: 'JettonTransferNotification'; queryId: bigint; amount: bigint; sender: Address; forwardPayload: Slice },
  ): Promise<unknown>;
  getVaultState(): Promise<{
    owner: Address;
    jettonMaster: Address;
    vaultJettonWallet: Address;
    paused: boolean;
    totalDepositedRaw: bigint;
    depositCount: bigint;
    lastDepositor: Address;
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
  getSupportedTarget(targetUsd9: bigint): Promise<boolean>;
  getDerivedDepositKey(user: Address, queryId: bigint): Promise<bigint>;
}

async function depositVaultFromInit(owner: Address, jettonMaster: Address, vaultJettonWallet: Address) {
  const wrapperPath = pathToFileURL(
    resolve(process.cwd(), 'build/tact/MultiMillionaireDepositVault/MultiMillionaireDepositVault_MultiMillionaireDepositVault.js'),
  ).href;
  const wrapper = (await import(wrapperPath)) as {
    MultiMillionaireDepositVault: {
      fromInit(owner: Address, jettonMaster: Address, vaultJettonWallet: Address): Promise<unknown>;
    };
  };
  return wrapper.MultiMillionaireDepositVault.fromInit(owner, jettonMaster, vaultJettonWallet);
}

function targetDepositPayload(seasonId: number, waveId: number, targetUsd9: bigint) {
  return beginCell()
    .storeBit(false)
    .storeUint(seasonId, 8)
    .storeUint(waveId, 32)
    .storeUint(targetUsd9, 128)
    .endCell()
    .beginParse();
}

function localDepositKey(user: Address, queryId: bigint) {
  return BigInt(`0x${beginCell().storeAddress(user).storeUint(queryId, 64).endCell().hash().toString('hex')}`);
}

async function deployDepositVault(blockchain: Blockchain) {
  const owner = await blockchain.treasury('mm-owner');
  const jettonMaster = await blockchain.treasury('72h-jetton-master');
  const vaultJettonWallet = await blockchain.treasury('deposit-vault-jetton-wallet');
  const user = await blockchain.treasury('deposit-user');
  const forgedWallet = await blockchain.treasury('forged-jetton-wallet');

  const vault = blockchain.openContract(
    (await depositVaultFromInit(owner.address, jettonMaster.address, vaultJettonWallet.address)) as Parameters<
      typeof blockchain.openContract
    >[0],
  ) as unknown as DepositVaultSandbox;

  await vault.send(owner.getSender(), { value: toNano('1') }, null);

  return { forgedWallet, jettonMaster, owner, user, vault, vaultJettonWallet };
}

describe('MultiMillionaireDepositVault', () => {
  it('records target-deposit state and exposes verifier getters', async () => {
    const blockchain = await Blockchain.create();
    const { jettonMaster, owner, user, vault, vaultJettonWallet } = await deployDepositVault(blockchain);

    await vault.send(
      vaultJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: 50_000n * ONE_72H,
        sender: user.address,
        forwardPayload: targetDepositPayload(2, 7, TARGET_100K_USD9),
      },
    );

    const vaultState = await vault.getVaultState();
    expect(vaultState.owner.equals(owner.address)).toBe(true);
    expect(vaultState.jettonMaster.equals(jettonMaster.address)).toBe(true);
    expect(vaultState.vaultJettonWallet.equals(vaultJettonWallet.address)).toBe(true);
    expect(vaultState.paused).toBe(false);
    expect(vaultState.totalDepositedRaw).toBe(50_000n * ONE_72H);
    expect(vaultState.depositCount).toBe(1n);
    expect(vaultState.lastDepositor.equals(user.address)).toBe(true);
    expect(vaultState.lastSeasonId).toBe(2n);
    expect(vaultState.lastWaveId).toBe(7n);
    expect(vaultState.lastAmountRaw).toBe(50_000n * ONE_72H);
    expect(vaultState.lastTargetUsd9).toBe(TARGET_100K_USD9);

    const userState = await vault.getUserState(user.address);
    expect(userState.activeRaw).toBe(50_000n * ONE_72H);
    expect(userState.targetUsd9).toBe(TARGET_100K_USD9);
    expect(userState.seasonId).toBe(2n);
    expect(userState.waveId).toBe(7n);
    expect(userState.goalReached).toBe(false);
    expect(userState.pendingWithdrawal).toBe(false);
    expect(await vault.getSupportedTarget(TARGET_100K_USD9)).toBe(true);
    expect(await vault.getDerivedDepositKey(user.address, 1n)).toBe(localDepositKey(user.address, 1n));
  });

  it('rejects unsupported targets without mutating user state', async () => {
    const blockchain = await Blockchain.create();
    const { user, vault, vaultJettonWallet } = await deployDepositVault(blockchain);

    await vault.send(
      vaultJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: 1_000n * ONE_72H,
        sender: user.address,
        forwardPayload: targetDepositPayload(2, 7, UNSUPPORTED_TARGET_USD9),
      },
    );

    const userState = await vault.getUserState(user.address);
    expect(await vault.getSupportedTarget(UNSUPPORTED_TARGET_USD9)).toBe(false);
    expect(userState.activeRaw).toBe(0n);
    expect(userState.targetUsd9).toBe(0n);
  });

  it('rejects replayed user query ids', async () => {
    const blockchain = await Blockchain.create();
    const { user, vault, vaultJettonWallet } = await deployDepositVault(blockchain);

    const deposit = {
      $$type: 'JettonTransferNotification' as const,
      queryId: 1n,
      amount: 1_000n * ONE_72H,
      sender: user.address,
      forwardPayload: targetDepositPayload(2, 7, TARGET_100K_USD9),
    };
    await vault.send(vaultJettonWallet.getSender(), { value: toNano('0.2') }, deposit);
    await vault.send(vaultJettonWallet.getSender(), { value: toNano('0.2') }, deposit);

    const userState = await vault.getUserState(user.address);
    const vaultState = await vault.getVaultState();
    expect(userState.activeRaw).toBe(1_000n * ONE_72H);
    expect(vaultState.depositCount).toBe(1n);
  });

  it('rejects target changes after the first deposit', async () => {
    const blockchain = await Blockchain.create();
    const { user, vault, vaultJettonWallet } = await deployDepositVault(blockchain);

    await vault.send(
      vaultJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: 1_000n * ONE_72H,
        sender: user.address,
        forwardPayload: targetDepositPayload(2, 7, TARGET_100K_USD9),
      },
    );
    await vault.send(
      vaultJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 2n,
        amount: 1_000n * ONE_72H,
        sender: user.address,
        forwardPayload: targetDepositPayload(2, 7, TARGET_500K_USD9),
      },
    );

    const userState = await vault.getUserState(user.address);
    const vaultState = await vault.getVaultState();
    expect(userState.activeRaw).toBe(1_000n * ONE_72H);
    expect(userState.targetUsd9).toBe(TARGET_100K_USD9);
    expect(vaultState.depositCount).toBe(1n);
  });

  it('rejects notifications from any wallet except the configured vault Jetton wallet', async () => {
    const blockchain = await Blockchain.create();
    const { forgedWallet, user, vault } = await deployDepositVault(blockchain);

    await vault.send(
      forgedWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: 1_000n * ONE_72H,
        sender: user.address,
        forwardPayload: targetDepositPayload(2, 7, TARGET_100K_USD9),
      },
    );

    const userState = await vault.getUserState(user.address);
    const vaultState = await vault.getVaultState();
    expect(userState.activeRaw).toBe(0n);
    expect(vaultState.depositCount).toBe(0n);
  });
});
