import { Blockchain, internal as sandboxInternal } from '@ton/sandbox';
import { Address, beginCell, Cell, contractAddress, Slice, toNano } from '@ton/core';
import { describe, expect, it } from 'vitest';

const ALLOCATED_AT = 1_710_000_000;
const LOCK_SECONDS = 72 * 24 * 60 * 60;
const ONE_72H = 1_000_000_000n;
const LOT_AMOUNT = 1_000n * ONE_72H;
const REDEEM_AMOUNT = 250n * ONE_72H;

interface ReserveVaultSandbox {
  readonly address: Address;
  send(
    via: { address?: Address },
    args: { value: bigint; bounce?: boolean | null },
    message:
      | null
      | { $$type: 'JettonTransferNotification'; queryId: bigint; amount: bigint; sender: Address; forwardPayload: Slice }
      | { $$type: 'RecordPrincipalRedeem'; lotId: bigint; amount72H: bigint }
      | { $$type: 'JettonExcesses'; queryId: bigint }
      | { $$type: 'FinalizePrincipalRedeem'; queryId: bigint }
      | { $$type: 'SetVaultJettonWallet'; wallet: Address },
  ): Promise<{ transactions: { outMessages: { values(): Iterable<{ body: Cell }> } }[] }>;
  getGetPendingRedeemQueryByLot(lotId: bigint): Promise<bigint>;
  getGetPendingRedeemAmount(queryId: bigint): Promise<bigint>;
  getGetRedeemedByLot(lotId: bigint): Promise<bigint>;
  getGetPrincipalBySeat(seatNumber: bigint): Promise<bigint>;
  getGetTotalPrincipal72H(): Promise<bigint>;
}

interface JettonTransferPayout {
  readonly queryId: bigint;
  readonly amount: bigint;
  readonly destination: Address;
  readonly responseDestination: Address;
}

async function reserveVaultFromInit(
  owner: Address,
  registry: Address,
  jettonMaster: Address,
  vaultJettonWallet: Address,
) {
  const wrapperPath = '../build/tact/ReserveVault/ReserveVault_ReserveVault.js';
  const wrapper = (await import(wrapperPath)) as {
    ReserveVault: {
      fromInit(
        owner: Address,
        registry: Address,
        jettonMaster: Address,
        vaultJettonWallet: Address,
        appId: bigint,
      ): Promise<unknown>;
    };
  };
  return wrapper.ReserveVault.fromInit(owner, registry, jettonMaster, vaultJettonWallet, 1n);
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
        // Non-JettonTransfer outbound messages are irrelevant to this proof.
      }
    }
  }

  throw new Error('Expected ReserveVault to dispatch a JettonTransfer payout.');
}

function undeliveredAddress(seed: number) {
  return contractAddress(0, {
    code: beginCell().storeUint(seed, 32).endCell(),
    data: beginCell().storeUint(seed + 1, 32).endCell(),
  });
}

function bouncedJettonTransferBody(queryId: bigint, amount: bigint) {
  return beginCell()
    .storeUint(0xffffffff, 32)
    .storeUint(0x0f8a7ea5, 32)
    .storeUint(queryId, 64)
    .storeCoins(amount)
    .endCell();
}

async function deployFundedReserveVault(blockchain: Blockchain) {
  blockchain.now = ALLOCATED_AT;

  const owner = await blockchain.treasury('reserve-owner');
  const registry = await blockchain.treasury('registry');
  const jettonMaster = await blockchain.treasury('jetton-master');
  const vaultJettonWallet = await blockchain.treasury('vault-jetton-wallet');
  const reserveHolder = await blockchain.treasury('reserve-holder');

  const reserveVault = blockchain.openContract(
    (await reserveVaultFromInit(
      owner.address,
      registry.address,
      jettonMaster.address,
      vaultJettonWallet.address,
    )) as Parameters<typeof blockchain.openContract>[0],
  ) as unknown as ReserveVaultSandbox;

  await reserveVault.send(owner.getSender(), { value: toNano('1') }, null);
  await reserveVault.send(
    vaultJettonWallet.getSender(),
    { value: toNano('0.2') },
    {
      $$type: 'JettonTransferNotification',
      queryId: 1n,
      amount: LOT_AMOUNT,
      sender: reserveHolder.address,
      forwardPayload: beginCell().endCell().beginParse(),
    },
  );

  return { owner, reserveHolder, reserveVault, vaultJettonWallet };
}

describe('ReserveVault principal redemption payout proof', () => {
  it('records pending payout, dispatches JettonTransfer, then finalizes by decrementing lot, seat principal, and total principal', async () => {
    const blockchain = await Blockchain.create();
    const { reserveHolder, reserveVault, vaultJettonWallet } = await deployFundedReserveVault(blockchain);
    const forgedFinalizer = await blockchain.treasury('forged-finalizer');

    blockchain.now = ALLOCATED_AT + LOCK_SECONDS;
    const redeem = await reserveVault.send(
      reserveHolder.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RecordPrincipalRedeem',
        lotId: 1n,
        amount72H: REDEEM_AMOUNT,
      },
    );

    const expectedQueryId = 1_000_000_001n;
    const payout = findJettonTransfer(redeem);
    expect(await reserveVault.getGetPendingRedeemQueryByLot(1n)).toBe(expectedQueryId);
    expect(await reserveVault.getGetPendingRedeemAmount(expectedQueryId)).toBe(REDEEM_AMOUNT);
    expect(payout.queryId).toBe(expectedQueryId);
    expect(payout.amount).toBe(REDEEM_AMOUNT);
    expect(payout.destination.equals(reserveHolder.address)).toBe(true);
    expect(payout.responseDestination.equals(reserveVault.address)).toBe(true);

    await reserveVault.send(
      forgedFinalizer.getSender(),
      { value: toNano('0.1') },
      {
        $$type: 'JettonExcesses',
        queryId: expectedQueryId,
      },
    );
    expect(await reserveVault.getGetPendingRedeemQueryByLot(1n)).toBe(expectedQueryId);
    expect(await reserveVault.getGetPendingRedeemAmount(expectedQueryId)).toBe(REDEEM_AMOUNT);
    expect(await reserveVault.getGetRedeemedByLot(1n)).toBe(0n);
    expect(await reserveVault.getGetPrincipalBySeat(1n)).toBe(LOT_AMOUNT);
    expect(await reserveVault.getGetTotalPrincipal72H()).toBe(LOT_AMOUNT);

    await reserveVault.send(
      forgedFinalizer.getSender(),
      { value: toNano('0.1') },
      {
        $$type: 'FinalizePrincipalRedeem',
        queryId: expectedQueryId,
      },
    );
    expect(await reserveVault.getGetPendingRedeemQueryByLot(1n)).toBe(expectedQueryId);
    expect(await reserveVault.getGetPendingRedeemAmount(expectedQueryId)).toBe(REDEEM_AMOUNT);
    expect(await reserveVault.getGetRedeemedByLot(1n)).toBe(0n);
    expect(await reserveVault.getGetPrincipalBySeat(1n)).toBe(LOT_AMOUNT);
    expect(await reserveVault.getGetTotalPrincipal72H()).toBe(LOT_AMOUNT);

    await reserveVault.send(
      vaultJettonWallet.getSender(),
      { value: toNano('0.1') },
      {
        $$type: 'FinalizePrincipalRedeem',
        queryId: expectedQueryId,
      },
    );

    expect(await reserveVault.getGetPendingRedeemQueryByLot(1n)).toBe(0n);
    expect(await reserveVault.getGetPendingRedeemAmount(expectedQueryId)).toBe(0n);
    expect(await reserveVault.getGetRedeemedByLot(1n)).toBe(REDEEM_AMOUNT);
    expect(await reserveVault.getGetPrincipalBySeat(1n)).toBe(LOT_AMOUNT - REDEEM_AMOUNT);
    expect(await reserveVault.getGetTotalPrincipal72H()).toBe(LOT_AMOUNT - REDEEM_AMOUNT);
  });

  it('clears bounced pending payout so the same matured lot can be retried', async () => {
    const blockchain = await Blockchain.create();
    const { owner, reserveHolder, reserveVault } = await deployFundedReserveVault(blockchain);
    const bouncedWallet = undeliveredAddress(72);

    await reserveVault.send(
      owner.getSender(),
      { value: toNano('0.1') },
      {
        $$type: 'SetVaultJettonWallet',
        wallet: bouncedWallet,
      },
    );

    blockchain.now = ALLOCATED_AT + LOCK_SECONDS;
    const firstAttempt = await reserveVault.send(
      reserveHolder.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RecordPrincipalRedeem',
        lotId: 1n,
        amount72H: REDEEM_AMOUNT,
      },
    );

    const firstPayout = findJettonTransfer(firstAttempt);
    expect(firstPayout.destination.equals(reserveHolder.address)).toBe(true);
    expect(await reserveVault.getGetPendingRedeemQueryByLot(1n)).toBe(0n);
    expect(await reserveVault.getGetPendingRedeemAmount(firstPayout.queryId)).toBe(0n);
    expect(await reserveVault.getGetRedeemedByLot(1n)).toBe(0n);
    expect(await reserveVault.getGetPrincipalBySeat(1n)).toBe(LOT_AMOUNT);
    expect(await reserveVault.getGetTotalPrincipal72H()).toBe(LOT_AMOUNT);

    const retry = await reserveVault.send(
      reserveHolder.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RecordPrincipalRedeem',
        lotId: 1n,
        amount72H: REDEEM_AMOUNT,
      },
    );
    const retryPayout = findJettonTransfer(retry);
    expect(retryPayout.queryId).toBe(firstPayout.queryId);
  });

  it('ignores forged or mismatched ReserveVault payout bounces', async () => {
    const blockchain = await Blockchain.create();
    const { reserveHolder, reserveVault, vaultJettonWallet } = await deployFundedReserveVault(blockchain);
    const forgedBouncer = await blockchain.treasury('forged-bouncer');

    blockchain.now = ALLOCATED_AT + LOCK_SECONDS;
    const redeem = await reserveVault.send(
      reserveHolder.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RecordPrincipalRedeem',
        lotId: 1n,
        amount72H: REDEEM_AMOUNT,
      },
    );
    const payout = findJettonTransfer(redeem);

    await blockchain.sendMessage(sandboxInternal({
      from: forgedBouncer.address,
      to: reserveVault.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(payout.queryId, REDEEM_AMOUNT),
    }));
    expect(await reserveVault.getGetPendingRedeemQueryByLot(1n)).toBe(payout.queryId);
    expect(await reserveVault.getGetPendingRedeemAmount(payout.queryId)).toBe(REDEEM_AMOUNT);

    await blockchain.sendMessage(sandboxInternal({
      from: vaultJettonWallet.address,
      to: reserveVault.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(payout.queryId, REDEEM_AMOUNT - ONE_72H),
    }));
    expect(await reserveVault.getGetPendingRedeemQueryByLot(1n)).toBe(payout.queryId);
    expect(await reserveVault.getGetPendingRedeemAmount(payout.queryId)).toBe(REDEEM_AMOUNT);

    await blockchain.sendMessage(sandboxInternal({
      from: vaultJettonWallet.address,
      to: reserveVault.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(payout.queryId, REDEEM_AMOUNT),
    }));
    expect(await reserveVault.getGetPendingRedeemQueryByLot(1n)).toBe(0n);
    expect(await reserveVault.getGetPendingRedeemAmount(payout.queryId)).toBe(0n);
  });
});
