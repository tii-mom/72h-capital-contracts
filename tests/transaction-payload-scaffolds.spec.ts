import { describe, expect, it } from 'vitest';

import {
  TRANSACTION_PAYLOAD_SCAFFOLD_VERSION,
  createAlphaAllocatePayloadScaffold,
  createReserveAllocatePayloadScaffold,
  createReserveRedeemPayloadScaffold,
  createRewardClaimPayloadScaffold,
} from '../src/encoding/transactionPayloadScaffolds.js';

describe('transaction payload scaffolds', () => {
  it('builds a reserve allocation scaffold aligned with ReserveVault.allocateReserve', () => {
    const scaffold = createReserveAllocatePayloadScaffold({
      app: '72hours',
      owner: 'wallet-a',
      amount72H: 720n,
    });

    expect(scaffold.scaffold.productionReady).toBe(false);
    expect(scaffold.scaffold.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('not a finalized TON cell or BOC'),
        expect.stringContaining('Action semantics still come from the TypeScript state machines'),
      ]),
    );
    expect(scaffold.target.contract).toBe('ReserveVault');
    expect(scaffold.target.entrypoint).toBe('allocateReserve');
    expect(scaffold.parameters.amount.amount72H).toBe(720n);
    expect(scaffold.transactionRequestScaffold.protocol).toEqual({
      name: 'ton-connect',
      version: 'v2',
    });
    expect(scaffold.transactionRequestScaffold.method).toEqual({
      kind: 'message-boundary-scaffold',
      action: 'reserve.allocate',
      contract: 'ReserveVault',
      entrypoint: 'allocateReserve',
    });
    expect(scaffold.transactionRequestScaffold.to.address).toBeNull();
    expect(scaffold.transactionRequestScaffold.nativeValueNanoTon).toBeNull();
    expect(scaffold.transactionRequestScaffold.payloadJson).toEqual({
      schema: TRANSACTION_PAYLOAD_SCAFFOLD_VERSION,
      productionReady: false,
      action: 'reserve.allocate',
      contract: 'ReserveVault',
      entrypoint: 'allocateReserve',
      app: '72hours',
      owner: 'wallet-a',
      amount72H: '720',
    });
  });

  it('encodes reserve redemption scaffolds as base64 json placeholders', () => {
    const scaffold = createReserveRedeemPayloadScaffold({
      app: 'wan',
      owner: 'wallet-b',
      requestedAmount72H: 450n,
    });
    const repeatScaffold = createReserveRedeemPayloadScaffold({
      app: 'wan',
      owner: 'wallet-b',
      requestedAmount72H: 450n,
    });

    const decodedJson = Buffer.from(scaffold.transactionRequestScaffold.payloadBase64, 'base64').toString('utf8');

    expect(scaffold.action).toBe('reserve.redeem');
    expect(scaffold.transactionRequestScaffold.payloadUtf8).toBe(decodedJson);
    expect(JSON.parse(decodedJson)).toEqual(scaffold.transactionRequestScaffold.payloadJson);
    expect(scaffold.transactionRequestScaffold.payloadUtf8).toBe(repeatScaffold.transactionRequestScaffold.payloadUtf8);
    expect(scaffold.transactionRequestScaffold.payloadBase64).toBe(repeatScaffold.transactionRequestScaffold.payloadBase64);
  });

  it('applies current app-specific alpha thresholds before producing a scaffold', () => {
    expect(() =>
      createAlphaAllocatePayloadScaffold({
        app: 'multi-millionaire',
        owner: 'wallet-c',
        amount72H: 100_000n,
      }),
    ).toThrow(/720000 72H/i);

    const scaffold = createAlphaAllocatePayloadScaffold({
      app: 'multi-millionaire',
      owner: 'wallet-c',
      amount72H: 720_000n,
    });

    expect(scaffold.target.contract).toBe('AlphaVault');
    expect(scaffold.target.entrypoint).toBe('allocateAlpha');
    expect(scaffold.parameters.amount.amount72HString).toBe('720000');
    expect(scaffold.transactionRequestScaffold.method).toEqual({
      kind: 'message-boundary-scaffold',
      action: 'alpha.allocate',
      contract: 'AlphaVault',
      entrypoint: 'allocateAlpha',
    });
  });

  it('routes reward-claim scaffolds to the app reward pool by seat type', () => {
    const reserveClaim = createRewardClaimPayloadScaffold({
      app: '72hours',
      owner: 'wallet-reserve',
      seatType: 'reserve',
    });
    const alphaClaim = createRewardClaimPayloadScaffold({
      app: '72hours',
      owner: 'wallet-alpha',
      seatType: 'alpha',
    });

    expect(reserveClaim.target.contract).toBe('AppRewardPool');
    expect(reserveClaim.target.entrypoint).toBe('claimReward');
    expect(alphaClaim.target.contract).toBe('AppRewardPool');
    expect(alphaClaim.target.entrypoint).toBe('claimReward');
    expect(reserveClaim.transactionRequestScaffold.protocol.name).toBe('ton-connect');
    expect(alphaClaim.transactionRequestScaffold.protocol.version).toBe('v2');
    expect(reserveClaim.transactionRequestScaffold.method.kind).toBe('message-boundary-scaffold');
    expect(alphaClaim.transactionRequestScaffold.payloadJson.seatType).toBe('alpha');
  });
});
