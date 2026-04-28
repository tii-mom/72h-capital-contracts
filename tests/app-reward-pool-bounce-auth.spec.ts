import { Blockchain, internal as sandboxInternal } from '@ton/sandbox';
import { Address, beginCell, Cell, Slice, toNano } from '@ton/core';
import { describe, expect, it } from 'vitest';

const ONE_72H = 1_000_000_000n;
const FUNDED_REWARD_AMOUNT = 1_000n * ONE_72H;

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
        // Non-JettonTransfer outbound messages are irrelevant to this proof.
      }
    }
  }

  throw new Error('Expected AppRewardPool to dispatch a JettonTransfer payout.');
}

function bouncedJettonTransferBody(queryId: bigint, amount: bigint) {
  return beginCell()
    .storeUint(0xffffffff, 32)
    .storeUint(0x0f8a7ea5, 32)
    .storeUint(queryId, 64)
    .storeCoins(amount)
    .endCell();
}

async function getPendingClaimQuery(pool: OpenedContract) {
  return (pool.getGetPendingClaimQuery as (seatType: bigint, seatNumber: bigint) => Promise<bigint>)(1n, 1n);
}

async function getAvailableRewards(pool: OpenedContract) {
  return (pool.getGetAvailableRewards72H as () => Promise<bigint>)();
}

async function getTotalClaimed(pool: OpenedContract) {
  return (pool.getGetTotalClaimed72H as () => Promise<bigint>)();
}

describe('AppRewardPool JettonTransfer bounce authentication', () => {
  it('keeps reward claims pending for forged or mismatched bounces and clears true wallet bounces', async () => {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_800_000_000;

    const owner = await blockchain.treasury('owner');
    const registry = await blockchain.treasury('registry');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const poolJettonWallet = await blockchain.treasury('pool-jetton-wallet');
    const seatOwner = await blockchain.treasury('seat-owner');
    const forgedBouncer = await blockchain.treasury('forged-bouncer');

    const pool = await openTactContract(
      blockchain,
      '../build/tact/AppRewardPool/AppRewardPool_AppRewardPool.js',
      'AppRewardPool',
      [owner.address, registry.address, jettonMaster.address, poolJettonWallet.address, 1n],
    );

    await pool.send(owner.getSender(), { value: toNano('1') }, null);
    await pool.send(
      registry.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'RegisterRewardSeat',
        seatType: 1n,
        seatNumber: 1n,
        owner: seatOwner.address,
      },
    );
    await pool.send(
      poolJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: FUNDED_REWARD_AMOUNT,
        sender: owner.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );

    const claim = await pool.send(
      seatOwner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'ClaimReward',
        seatType: 1n,
        seatNumber: 1n,
      },
    );
    const transfer = findJettonTransfer(claim);
    expect(transfer.amount).toBe(FUNDED_REWARD_AMOUNT);
    expect(transfer.destination.equals(seatOwner.address)).toBe(true);
    expect(await getPendingClaimQuery(pool)).toBe(transfer.queryId);

    await blockchain.sendMessage(sandboxInternal({
      from: forgedBouncer.address,
      to: pool.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(transfer.queryId, transfer.amount),
    }));
    expect(await getPendingClaimQuery(pool)).toBe(transfer.queryId);

    await blockchain.sendMessage(sandboxInternal({
      from: poolJettonWallet.address,
      to: pool.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(transfer.queryId, transfer.amount - ONE_72H),
    }));
    expect(await getPendingClaimQuery(pool)).toBe(transfer.queryId);

    await blockchain.sendMessage(sandboxInternal({
      from: poolJettonWallet.address,
      to: pool.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(transfer.queryId, transfer.amount),
    }));
    expect(await getPendingClaimQuery(pool)).toBe(0n);
  });

  it('keeps reward claims pending for forged success finalization and accepts the pool wallet success message', async () => {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_800_000_000;

    const owner = await blockchain.treasury('owner');
    const registry = await blockchain.treasury('registry');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const poolJettonWallet = await blockchain.treasury('pool-jetton-wallet');
    const seatOwner = await blockchain.treasury('seat-owner');
    const forgedFinalizer = await blockchain.treasury('forged-finalizer');

    const pool = await openTactContract(
      blockchain,
      '../build/tact/AppRewardPool/AppRewardPool_AppRewardPool.js',
      'AppRewardPool',
      [owner.address, registry.address, jettonMaster.address, poolJettonWallet.address, 1n],
    );

    await pool.send(owner.getSender(), { value: toNano('1') }, null);
    await pool.send(
      registry.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'RegisterRewardSeat',
        seatType: 1n,
        seatNumber: 1n,
        owner: seatOwner.address,
      },
    );
    await pool.send(
      poolJettonWallet.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'JettonTransferNotification',
        queryId: 1n,
        amount: FUNDED_REWARD_AMOUNT,
        sender: owner.address,
        forwardPayload: beginCell().endCell().beginParse() as Slice,
      },
    );

    const claim = await pool.send(
      seatOwner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'ClaimReward',
        seatType: 1n,
        seatNumber: 1n,
      },
    );
    const transfer = findJettonTransfer(claim);
    expect(transfer.amount).toBe(FUNDED_REWARD_AMOUNT);
    expect(await getPendingClaimQuery(pool)).toBe(transfer.queryId);
    expect(await getAvailableRewards(pool)).toBe(FUNDED_REWARD_AMOUNT);
    expect(await getTotalClaimed(pool)).toBe(0n);

    await pool.send(
      forgedFinalizer.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'JettonExcesses',
        queryId: transfer.queryId,
      },
    );
    expect(await getPendingClaimQuery(pool)).toBe(transfer.queryId);
    expect(await getAvailableRewards(pool)).toBe(FUNDED_REWARD_AMOUNT);
    expect(await getTotalClaimed(pool)).toBe(0n);

    await pool.send(
      forgedFinalizer.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'FinalizeRewardClaim',
        queryId: transfer.queryId,
      },
    );
    expect(await getPendingClaimQuery(pool)).toBe(transfer.queryId);
    expect(await getAvailableRewards(pool)).toBe(FUNDED_REWARD_AMOUNT);
    expect(await getTotalClaimed(pool)).toBe(0n);

    await pool.send(
      poolJettonWallet.getSender(),
      { value: toNano('0.05') },
      {
        $$type: 'JettonExcesses',
        queryId: transfer.queryId,
      },
    );
    expect(await getPendingClaimQuery(pool)).toBe(0n);
    expect(await getAvailableRewards(pool)).toBe(0n);
    expect(await getTotalClaimed(pool)).toBe(FUNDED_REWARD_AMOUNT);
  });
});
