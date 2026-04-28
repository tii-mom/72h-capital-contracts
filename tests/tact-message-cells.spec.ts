import { Address, Cell } from '@ton/core';
import { describe, expect, it } from 'vitest';

import {
  CAPITAL_APP_IDS,
  H72H_JETTON_SCALE,
  TACT_MESSAGE_OPCODES,
  createBindReserveVaultMessageCell,
  createBurnTest72HMessageCell,
  createFinalizeRewardClaimMessageCell,
  createMintTest72HMessageCell,
  createRegisterAppMessageCell,
  createRegisterRewardSeatMessageCell,
  createRewardClaimMessageCell,
  createReserveJettonTransferMessageCell,
  createReserveRedeemRequestMessageCell,
  createSetPoolJettonWalletMessageCell,
  createSetVaultJettonWalletMessageCell,
  to72HJettonUnits,
} from '../src/encoding/tactMessageCells.js';

const testAddress = Address.parse('0QCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQU_g');

function parsePayload(payloadBase64: string) {
  return Cell.fromBase64(payloadBase64).beginParse();
}

describe('Tact message cell encoders', () => {
  it('maps capital app slugs to compact on-chain app ids', () => {
    expect(CAPITAL_APP_IDS['72hours']).toBe(1);
    expect(CAPITAL_APP_IDS.wan).toBe(2);
    expect(CAPITAL_APP_IDS['multi-millionaire']).toBe(3);
  });

  it('normalizes whole 72H amounts to 9-decimal Jetton atomic units', () => {
    expect(H72H_JETTON_SCALE).toBe(1_000_000_000n);
    expect(to72HJettonUnits(720n)).toBe(720_000_000_000n);
    expect(() => to72HJettonUnits(0n)).toThrow(/positive/i);
  });

  it('encodes CapitalRegistry RegisterApp and BindReserveVault messages', () => {
    const register = createRegisterAppMessageCell('72hours');
    const registerSlice = parsePayload(register.payloadBase64);
    expect(register.productionReady).toBe(true);
    expect(register.payloadEncoding).toBe('base64(tact-cell-boc)');
    expect(registerSlice.loadUint(32)).toBe(TACT_MESSAGE_OPCODES.CapitalRegistry.RegisterApp);
    expect(registerSlice.loadUint(8)).toBe(1);

    const bind = createBindReserveVaultMessageCell({ app: 'wan', vault: testAddress });
    const bindSlice = parsePayload(bind.payloadBase64);
    expect(bindSlice.loadUint(32)).toBe(TACT_MESSAGE_OPCODES.CapitalRegistry.BindReserveVault);
    expect(bindSlice.loadUint(8)).toBe(2);
    expect(bindSlice.loadAddress().equals(testAddress)).toBe(true);
  });

  it('encodes standard Jetton transfer and Reserve principal redeem messages', () => {
    const transfer = createReserveJettonTransferMessageCell({
      app: 'multi-millionaire',
      userJettonWallet: testAddress,
      reserveVault: testAddress,
      responseDestination: testAddress,
      amount72H: 720n,
      queryId: 72n,
      forwardTonAmountNanoTon: 10_000_000n,
    });
    const transferSlice = parsePayload(transfer.payloadBase64);
    expect(transfer.contract).toBe('JettonWallet');
    expect(transfer.message).toBe('JettonTransfer');
    expect(transferSlice.loadUint(32)).toBe(TACT_MESSAGE_OPCODES.JettonWallet.Transfer);
    expect(transferSlice.loadUintBig(64)).toBe(72n);
    expect(transferSlice.loadCoins()).toBe(720_000_000_000n);
    expect(transferSlice.loadAddress().equals(testAddress)).toBe(true);
    expect(transferSlice.loadAddress().equals(testAddress)).toBe(true);
    expect(transferSlice.loadMaybeRef()).toBeNull();
    expect(transferSlice.loadCoins()).toBe(10_000_000n);
    expect(transferSlice.loadBit()).toBe(false);
    expect(transferSlice.loadUint(32)).toBe(TACT_MESSAGE_OPCODES.ReserveVault.ForwardAllocate);
    expect(transferSlice.loadUint(8)).toBe(3);

    const redeem = createReserveRedeemRequestMessageCell({ lotId: 9, amount72H: 10n });
    const redeemSlice = parsePayload(redeem.payloadBase64);
    expect(redeem.message).toBe('RecordPrincipalRedeem');
    expect(redeemSlice.loadUint(32)).toBe(TACT_MESSAGE_OPCODES.ReserveVault.RecordPrincipalRedeem);
    expect(redeemSlice.loadUint(32)).toBe(9);
    expect(redeemSlice.loadCoins()).toBe(10_000_000_000n);

    const rewardClaim = createRewardClaimMessageCell({ seatType: 'alpha', seatNumber: 2 });
    const rewardSlice = parsePayload(rewardClaim.payloadBase64);
    expect(rewardClaim.contract).toBe('AppRewardPool');
    expect(rewardSlice.loadUint(32)).toBe(TACT_MESSAGE_OPCODES.AppRewardPool.ClaimReward);
    expect(rewardSlice.loadUint(8)).toBe(2);
    expect(rewardSlice.loadUint(16)).toBe(2);
    expect(rewardSlice.remainingBits).toBe(0);
  });

  it('encodes Vault/Pool wallet setup and RewardPool seat registration messages', () => {
    const setVaultWallet = createSetVaultJettonWalletMessageCell({ wallet: testAddress });
    const setVaultWalletSlice = parsePayload(setVaultWallet.payloadBase64);
    expect(setVaultWalletSlice.loadUint(32)).toBe(TACT_MESSAGE_OPCODES.ReserveVault.SetVaultJettonWallet);
    expect(setVaultWalletSlice.loadAddress().equals(testAddress)).toBe(true);

    const setPoolWallet = createSetPoolJettonWalletMessageCell({ wallet: testAddress });
    const setPoolWalletSlice = parsePayload(setPoolWallet.payloadBase64);
    expect(setPoolWalletSlice.loadUint(32)).toBe(TACT_MESSAGE_OPCODES.AppRewardPool.SetPoolJettonWallet);
    expect(setPoolWalletSlice.loadAddress().equals(testAddress)).toBe(true);

    const registerRewardSeat = createRegisterRewardSeatMessageCell({
      seatType: 'reserve',
      seatNumber: 7,
      owner: testAddress,
    });
    const registerRewardSeatSlice = parsePayload(registerRewardSeat.payloadBase64);
    expect(registerRewardSeatSlice.loadUint(32)).toBe(TACT_MESSAGE_OPCODES.AppRewardPool.RegisterRewardSeat);
    expect(registerRewardSeatSlice.loadUint(8)).toBe(1);
    expect(registerRewardSeatSlice.loadUint(16)).toBe(7);
    expect(registerRewardSeatSlice.loadAddress().equals(testAddress)).toBe(true);

    const finalizeRewardClaim = createFinalizeRewardClaimMessageCell({ queryId: 1_000_001n });
    const finalizeRewardClaimSlice = parsePayload(finalizeRewardClaim.payloadBase64);
    expect(finalizeRewardClaimSlice.loadUint(32)).toBe(TACT_MESSAGE_OPCODES.AppRewardPool.FinalizeRewardClaim);
    expect(finalizeRewardClaimSlice.loadUintBig(64)).toBe(1_000_001n);
  });

  it('encodes testnet-only 72H Jetton mint and standard wallet burn messages', () => {
    const mint = createMintTest72HMessageCell({ to: testAddress, amount72H: 1_000n });
    const mintSlice = parsePayload(mint.payloadBase64);
    expect(mintSlice.loadUint(32)).toBe(TACT_MESSAGE_OPCODES.TestJetton72H.MintTest72H);
    expect(mintSlice.loadAddress().equals(testAddress)).toBe(true);
    expect(mintSlice.loadCoins()).toBe(1_000_000_000_000n);

    const burn = createBurnTest72HMessageCell({ amount72H: 3n, responseDestination: testAddress, queryId: 7n });
    const burnSlice = parsePayload(burn.payloadBase64);
    expect(burnSlice.loadUint(32)).toBe(TACT_MESSAGE_OPCODES.JettonWallet.Burn);
    expect(burnSlice.loadUintBig(64)).toBe(7n);
    expect(burnSlice.loadCoins()).toBe(3_000_000_000n);
    expect(burnSlice.loadAddress().equals(testAddress)).toBe(true);
    expect(burnSlice.loadMaybeRef()).toBeNull();
  });
});
