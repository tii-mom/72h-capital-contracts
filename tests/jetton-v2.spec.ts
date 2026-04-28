import { Blockchain, type SandboxContract, type TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  compileJettonV2,
  H72H_V2_TOTAL_SUPPLY,
  JETTON_V2_ERRORS,
  JettonMinterV2,
  JettonWalletV2,
} from '../src/jetton-v2/index.js';

describe('72H V2 Jetton', () => {
  let minterCode: Cell;
  let walletCode: Cell;
  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let alice: SandboxContract<TreasuryContract>;
  let bob: SandboxContract<TreasuryContract>;
  let jettonMinter: SandboxContract<JettonMinterV2>;

  beforeAll(async () => {
    const compiled = await compileJettonV2();
    minterCode = compiled.minter.code;
    walletCode = compiled.wallet.code;
  });

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    alice = await blockchain.treasury('alice');
    bob = await blockchain.treasury('bob');

    jettonMinter = blockchain.openContract(
      JettonMinterV2.createFromConfig(
        {
          admin: deployer.address,
          walletCode,
          metadataUri: 'ipfs://72h-v2-test-metadata',
        },
        minterCode,
      ),
    );

    await jettonMinter.sendDeploy(deployer.getSender(), toNano('0.05'));
  });

  async function openWalletFor(owner: SandboxContract<TreasuryContract>) {
    const address = await jettonMinter.getWalletAddress(owner.address);
    return blockchain.openContract(JettonWalletV2.createFromAddress(address));
  }

  async function mintToDeployer(amount: bigint) {
    await jettonMinter.sendMint(deployer.getSender(), {
      to: deployer.address,
      jettonAmount: amount,
      from: deployer.address,
      responseAddress: deployer.address,
      totalTonAmount: toNano('0.3'),
    });
  }

  it('exposes standard master getter data and deterministic wallet addresses', async () => {
    const data = await jettonMinter.getJettonData();
    expect(data.totalSupply).toBe(0n);
    expect(data.mintable).toBe(true);
    expect(data.adminAddress?.equals(deployer.address)).toBe(true);
    expect(data.walletCode.hash().toString('hex')).toBe(walletCode.hash().toString('hex'));

    const derivedWallet = await jettonMinter.getWalletAddress(alice.address);
    const localWallet = JettonWalletV2.createFromConfig(
      {
        ownerAddress: alice.address,
        jettonMasterAddress: jettonMinter.address,
      },
      walletCode,
    );
    expect(derivedWallet.equals(localWallet.address)).toBe(true);
  });

  it('mints once, drops admin, and reports mintable=false after admin is disabled', async () => {
    await mintToDeployer(H72H_V2_TOTAL_SUPPLY);

    const deployerWallet = await openWalletFor(deployer);
    expect(await deployerWallet.getJettonBalance()).toBe(H72H_V2_TOTAL_SUPPLY);
    expect((await jettonMinter.getJettonData()).totalSupply).toBe(H72H_V2_TOTAL_SUPPLY);

    await jettonMinter.sendMint(deployer.getSender(), {
      to: deployer.address,
      jettonAmount: 1n,
      from: deployer.address,
      responseAddress: deployer.address,
      totalTonAmount: toNano('0.3'),
    });
    expect((await jettonMinter.getJettonData()).totalSupply).toBe(H72H_V2_TOTAL_SUPPLY);
    expect(await deployerWallet.getJettonBalance()).toBe(H72H_V2_TOTAL_SUPPLY);

    await jettonMinter.sendDropAdmin(deployer.getSender());
    const finalData = await jettonMinter.getJettonData();
    expect(finalData.totalSupply).toBe(H72H_V2_TOTAL_SUPPLY);
    expect(finalData.mintable).toBe(false);
    expect(finalData.adminAddress).toBeNull();

    await jettonMinter.sendMint(deployer.getSender(), {
      to: deployer.address,
      jettonAmount: 1n,
      from: deployer.address,
      responseAddress: deployer.address,
      totalTonAmount: toNano('0.3'),
    });
    expect((await jettonMinter.getJettonData()).totalSupply).toBe(H72H_V2_TOTAL_SUPPLY);
  });

  it('rejects mint attempts from non-admin wallets', async () => {
    await jettonMinter.sendMint(alice.getSender(), {
      to: alice.address,
      jettonAmount: 1_000_000_000n,
      from: alice.address,
      responseAddress: alice.address,
      totalTonAmount: toNano('0.3'),
    });

    const data = await jettonMinter.getJettonData();
    expect(data.totalSupply).toBe(0n);
    expect(await (await openWalletFor(alice)).getJettonBalance()).toBe(0n);
  });

  it('transfers between normal wallets without owner restrictions', async () => {
    const amount = 1_000_000_000n;
    await mintToDeployer(amount);

    const deployerWallet = await openWalletFor(deployer);
    await deployerWallet.sendTransfer(deployer.getSender(), {
      value: toNano('1'),
      jettonAmount: 300_000_000n,
      to: alice.address,
      responseAddress: deployer.address,
      forwardTonAmount: 0n,
    });

    const aliceWallet = await openWalletFor(alice);
    expect(await deployerWallet.getJettonBalance()).toBe(700_000_000n);
    expect(await aliceWallet.getJettonBalance()).toBe(300_000_000n);
  });

  it('prevents non-owners from moving another holder wallet balance', async () => {
    const amount = 1_000_000_000n;
    await mintToDeployer(amount);

    const deployerWallet = await openWalletFor(deployer);
    await deployerWallet.sendTransfer(alice.getSender(), {
      value: toNano('1'),
      jettonAmount: 100_000_000n,
      to: bob.address,
      responseAddress: alice.address,
      forwardTonAmount: 0n,
    });

    expect(await deployerWallet.getJettonBalance()).toBe(amount);
    expect(await (await openWalletFor(bob)).getJettonBalance()).toBe(0n);
  });

  it('burns from a holder wallet and reduces total supply', async () => {
    const amount = 1_000_000_000n;
    await mintToDeployer(amount);

    const deployerWallet = await openWalletFor(deployer);
    await deployerWallet.sendBurn(deployer.getSender(), {
      value: toNano('1'),
      jettonAmount: 250_000_000n,
      responseAddress: deployer.address,
    });

    expect(await deployerWallet.getJettonBalance()).toBe(750_000_000n);
    expect((await jettonMinter.getJettonData()).totalSupply).toBe(750_000_000n);
  });

  it('keeps the forbidden governance opcodes out of V2 wrapper surface', () => {
    expect(Object.values(JETTON_V2_ERRORS)).toContain(73);
    expect('upgrade' in JettonMinterV2).toBe(false);
    expect('changeAdminMessage' in JettonMinterV2).toBe(false);
    expect('changeContentMessage' in JettonMinterV2).toBe(false);
  });
});
