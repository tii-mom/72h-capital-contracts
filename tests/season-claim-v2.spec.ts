import { Blockchain, internal as sandboxInternal } from '@ton/sandbox';
import { Address, beginCell, Cell, Slice, toNano } from '@ton/core';
import { describe, expect, it } from 'vitest';

const ONE_72H = 1_000_000_000n;
const ROUND_AMOUNT = 500_000_000n * ONE_72H;
const ROUND_PERSONAL_DEPOSIT_AMOUNT = 250_000_000n * ONE_72H;
const ROUND_TEAM_DEPOSIT_AMOUNT = 125_000_000n * ONE_72H;
const ROUND_REFERRAL_AMOUNT = 75_000_000n * ONE_72H;
const ROUND_LEADERBOARD_AMOUNT = 50_000_000n * ONE_72H;
const PRICE_STAGE_ONE_USD9 = 10_000_000n;

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

interface SeasonRewardAmounts {
  readonly personal: bigint;
  readonly team: bigint;
  readonly referral: bigint;
  readonly leaderboard: bigint;
}

interface ProofItem {
  readonly siblingOnLeft: boolean;
  readonly hash: bigint;
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

function totalSeasonRewardAmount(amounts: SeasonRewardAmounts) {
  return amounts.personal + amounts.team + amounts.referral + amounts.leaderboard;
}

function cellHash(cell: Cell): bigint {
  return BigInt(`0x${cell.hash().toString('hex')}`);
}

function seasonLeafHash(jettonMaster: Address, claimContract: Address, seasonId: bigint, account: Address, amounts: SeasonRewardAmounts) {
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
      .storeCoins(totalSeasonRewardAmount(amounts))
      .endCell())
    .endCell());
}

function hashPair(left: bigint, right: bigint): bigint {
  return cellHash(beginCell().storeUint(left, 256).storeUint(right, 256).endCell());
}

function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function buildMerkleTree(leaves: bigint[]) {
  const proofs = new Map<number, ProofItem[]>();
  let level = leaves.map((hash, index) => ({ hash, indexes: [index] }));
  for (const leaf of level) {
    proofs.set(must(leaf.indexes[0], 'leaf index'), []);
  }

  while (level.length > 1) {
    const next: Array<{ hash: bigint; indexes: number[] }> = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = must(level[i], 'left Merkle node');
      const right = level[i + 1] || left;
      for (const index of left.indexes) {
        proofs.get(index)?.push({ siblingOnLeft: false, hash: right.hash });
      }
      for (const index of right.indexes) {
        if (right !== left) {
          proofs.get(index)?.push({ siblingOnLeft: true, hash: left.hash });
        }
      }
      next.push({ hash: hashPair(left.hash, right.hash), indexes: [...left.indexes, ...right.indexes] });
    }
    level = next;
  }

  return {
    root: must(level[0], 'Merkle root').hash,
    proofs,
  };
}

function encodeProofSingleCell(proof: ProofItem[]) {
  const builder = beginCell();
  for (const item of proof) {
    builder.storeBit(item.siblingOnLeft).storeUint(item.hash, 256);
  }
  return builder.endCell();
}

function encodeProofRefChain(proof: ProofItem[]) {
  let next: Cell | null = null;
  for (let i = proof.length - 1; i >= 0; i -= 1) {
    const item = must(proof[i], 'proof item');
    const builder = beginCell().storeBit(item.siblingOnLeft).storeUint(item.hash, 256);
    if (next) {
      builder.storeRef(next);
    }
    next = builder.endCell();
  }
  return next || beginCell().endCell();
}

function encodeProofWithTailBit(proof: ProofItem[]) {
  const builder = beginCell();
  for (const item of proof) {
    builder.storeBit(item.siblingOnLeft).storeUint(item.hash, 256);
  }
  return builder.storeBit(false).endCell();
}

function encodeProofWithTwoRefs(item: ProofItem) {
  return beginCell()
    .storeBit(item.siblingOnLeft)
    .storeUint(item.hash, 256)
    .storeRef(beginCell().endCell())
    .storeRef(beginCell().endCell())
    .endCell();
}

function encodeProofWithEmptyContinuation(proof: ProofItem[]) {
  const valid = encodeProofRefChain(proof);
  return beginCell().storeRef(valid).endCell();
}

function claimSeasonRewardMessage(queryId: bigint, seasonId: bigint, amounts: SeasonRewardAmounts, proof: Cell) {
  return {
    $$type: 'ClaimSeasonReward',
    queryId,
    seasonId,
    personalDepositAmount72H: amounts.personal,
    teamDepositAmount72H: amounts.team,
    referralAmount72H: amounts.referral,
    leaderboardAmount72H: amounts.leaderboard,
    proof,
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

describe('SeasonClaimV2', () => {
  it('accepts ref-chain proofs deeper than the original single-cell proof capacity', async () => {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_800_000_000;

    const owner = await blockchain.treasury('owner');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const claimJettonWallet = await blockchain.treasury('claim-jetton-wallet');
    const seasonVault = await blockchain.treasury('season-vault');
    const claimant = await blockchain.treasury('deep-proof-claimant');

    const claim = await openTactContract(
      blockchain,
      '../build/tact/SeasonClaimV2/SeasonClaimV2_SeasonClaimV2.js',
      'SeasonClaimV2',
      [owner.address, jettonMaster.address, claimJettonWallet.address, seasonVault.address],
    );

    await claim.send(owner.getSender(), { value: toNano('1') }, null);
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

    const targetIndex = 85;
    const accounts = Array.from({ length: 128 }, (_, index) => (
      index === targetIndex
        ? claimant.address
        : Address.parse(`0:${(index + 1).toString(16).padStart(64, '0')}`)
    ));
    const amounts = accounts.map((_, index): SeasonRewardAmounts => ({
      personal: BigInt(index + 1) * ONE_72H,
      team: BigInt(index + 2) * ONE_72H,
      referral: BigInt(index + 3) * ONE_72H,
      leaderboard: BigInt(index + 4) * ONE_72H,
    }));
    const leaves = accounts.map((account, index) => seasonLeafHash(jettonMaster.address, claim.address, 1n, account, must(amounts[index], 'deep proof amount')));
    const tree = buildMerkleTree(leaves);
    const targetProof = tree.proofs.get(targetIndex) || [];
    expect(targetProof.length).toBe(7);

    await claim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RegisterSeasonClaim',
        seasonId: 1n,
        merkleRoot: tree.root,
        totalAmount72H: ROUND_AMOUNT,
        personalDepositTotal72H: ROUND_PERSONAL_DEPOSIT_AMOUNT,
        teamDepositTotal72H: ROUND_TEAM_DEPOSIT_AMOUNT,
        referralTotal72H: ROUND_REFERRAL_AMOUNT,
        leaderboardTotal72H: ROUND_LEADERBOARD_AMOUNT,
        openAt: 1_800_000_000n,
        evidenceHash: 31n,
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
        evidenceHash: 32n,
      },
    );

    const targetAmounts = must(amounts[targetIndex], 'target amounts');
    const targetLeaf = must(leaves[targetIndex], 'target leaf');
    const firstClaim = await claim.send(
      claimant.getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(701n, 1n, targetAmounts, encodeProofRefChain(targetProof)),
    );
    const firstTransfer = findJettonTransfer(firstClaim);
    const stageOneClaimAmount = (totalSeasonRewardAmount(targetAmounts) * 2000n) / 10000n;
    expect(firstTransfer.amount).toBe(stageOneClaimAmount);
    expect(firstTransfer.destination.equals(claimant.address)).toBe(true);
    expect(await (claim.getGetClaimedByLeaf as (leaf: bigint) => Promise<bigint>)(targetLeaf)).toBe(stageOneClaimAmount);

    const duplicate = await claim.send(
      claimant.getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(702n, 1n, targetAmounts, encodeProofRefChain(targetProof)),
    );
    expect(() => findJettonTransfer(duplicate)).toThrow('Expected a JettonTransfer outbound message.');
  });

  it('rejects wrong deep proofs and still accepts legacy single-cell proofs', async () => {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_800_000_000;

    const owner = await blockchain.treasury('owner');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const claimJettonWallet = await blockchain.treasury('claim-jetton-wallet');
    const seasonVault = await blockchain.treasury('season-vault');
    const claimants = [];
    for (let i = 0; i < 4; i += 1) {
      claimants.push(await blockchain.treasury(`single-cell-claimant-${i}`));
    }

    const claim = await openTactContract(
      blockchain,
      '../build/tact/SeasonClaimV2/SeasonClaimV2_SeasonClaimV2.js',
      'SeasonClaimV2',
      [owner.address, jettonMaster.address, claimJettonWallet.address, seasonVault.address],
    );

    await claim.send(owner.getSender(), { value: toNano('1') }, null);
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

    const amounts = claimants.map((_, index): SeasonRewardAmounts => ({
      personal: BigInt(index + 10) * ONE_72H,
      team: BigInt(index + 20) * ONE_72H,
      referral: BigInt(index + 30) * ONE_72H,
      leaderboard: BigInt(index + 40) * ONE_72H,
    }));
    const leaves = claimants.map((claimant, index) => seasonLeafHash(jettonMaster.address, claim.address, 1n, claimant.address, must(amounts[index], 'legacy amount')));
    const tree = buildMerkleTree(leaves);

    await claim.send(
      owner.getSender(),
      { value: toNano('0.2') },
      {
        $$type: 'RegisterSeasonClaim',
        seasonId: 1n,
        merkleRoot: tree.root,
        totalAmount72H: ROUND_AMOUNT,
        personalDepositTotal72H: ROUND_PERSONAL_DEPOSIT_AMOUNT,
        teamDepositTotal72H: ROUND_TEAM_DEPOSIT_AMOUNT,
        referralTotal72H: ROUND_REFERRAL_AMOUNT,
        leaderboardTotal72H: ROUND_LEADERBOARD_AMOUNT,
        openAt: 1_800_000_000n,
        evidenceHash: 41n,
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
        evidenceHash: 42n,
      },
    );

    const wrongProofClaim = await claim.send(
      must(claimants[0], 'wrong proof claimant').getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(801n, 1n, must(amounts[0], 'wrong proof amount'), encodeProofRefChain(tree.proofs.get(1) || [])),
    );
    expect(() => findJettonTransfer(wrongProofClaim)).toThrow('Expected a JettonTransfer outbound message.');
    expect(await (claim.getGetClaimedByLeaf as (leaf: bigint) => Promise<bigint>)(must(leaves[0], 'wrong proof leaf'))).toBe(0n);

    const validProof = tree.proofs.get(0) || [];
    const tailBitClaim = await claim.send(
      must(claimants[0], 'tail bit claimant').getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(802n, 1n, must(amounts[0], 'tail bit amount'), encodeProofWithTailBit(validProof)),
    );
    expect(() => findJettonTransfer(tailBitClaim)).toThrow('Expected a JettonTransfer outbound message.');
    expect(await (claim.getGetClaimedByLeaf as (leaf: bigint) => Promise<bigint>)(must(leaves[0], 'tail bit leaf'))).toBe(0n);

    const twoRefsClaim = await claim.send(
      must(claimants[0], 'two refs claimant').getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(803n, 1n, must(amounts[0], 'two refs amount'), encodeProofWithTwoRefs(must(validProof[0], 'two refs proof item'))),
    );
    expect(() => findJettonTransfer(twoRefsClaim)).toThrow('Expected a JettonTransfer outbound message.');
    expect(await (claim.getGetClaimedByLeaf as (leaf: bigint) => Promise<bigint>)(must(leaves[0], 'two refs leaf'))).toBe(0n);

    const emptyContinuationClaim = await claim.send(
      must(claimants[0], 'empty continuation claimant').getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(804n, 1n, must(amounts[0], 'empty continuation amount'), encodeProofWithEmptyContinuation(validProof)),
    );
    expect(() => findJettonTransfer(emptyContinuationClaim)).toThrow('Expected a JettonTransfer outbound message.');
    expect(await (claim.getGetClaimedByLeaf as (leaf: bigint) => Promise<bigint>)(must(leaves[0], 'empty continuation leaf'))).toBe(0n);

    const legacyProofClaim = await claim.send(
      must(claimants[0], 'legacy proof claimant').getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(805n, 1n, must(amounts[0], 'legacy proof amount'), encodeProofSingleCell(validProof)),
    );
    const legacyTransfer = findJettonTransfer(legacyProofClaim);
    expect(legacyTransfer.amount).toBe((totalSeasonRewardAmount(must(amounts[0], 'legacy transfer amount')) * 2000n) / 10000n);
  });

  it('preserves claim bounce sender and amount authentication', async () => {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_800_000_000;

    const owner = await blockchain.treasury('owner');
    const jettonMaster = await blockchain.treasury('jetton-master');
    const claimJettonWallet = await blockchain.treasury('claim-jetton-wallet');
    const claimantJettonWallet = await blockchain.treasury('claimant-jetton-wallet');
    const seasonVault = await blockchain.treasury('season-vault');
    const claimant = await blockchain.treasury('bounce-claimant');

    const claim = await openTactContract(
      blockchain,
      '../build/tact/SeasonClaimV2/SeasonClaimV2_SeasonClaimV2.js',
      'SeasonClaimV2',
      [owner.address, jettonMaster.address, claimJettonWallet.address, seasonVault.address],
    );

    await claim.send(owner.getSender(), { value: toNano('1') }, null);
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

    const amounts: SeasonRewardAmounts = {
      personal: 4_000n * ONE_72H,
      team: 3_000n * ONE_72H,
      referral: 2_000n * ONE_72H,
      leaderboard: 1_000n * ONE_72H,
    };
    const leaf = seasonLeafHash(jettonMaster.address, claim.address, 1n, claimant.address, amounts);
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
        evidenceHash: 51n,
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
        evidenceHash: 52n,
      },
    );

    await claim.send(
      claimant.getSender(),
      { value: toNano('0.2') },
      claimSeasonRewardMessage(901n, 1n, amounts, beginCell().endCell()),
    );
    const stageOneClaimAmount = (totalSeasonRewardAmount(amounts) * 2000n) / 10000n;
    expect(await (claim.getGetClaimedByLeaf as (claimLeaf: bigint) => Promise<bigint>)(leaf)).toBe(stageOneClaimAmount);

    await blockchain.sendMessage(sandboxInternal({
      from: claimantJettonWallet.address,
      to: claim.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(901n, stageOneClaimAmount),
    }));
    expect(await (claim.getGetClaimedByLeaf as (claimLeaf: bigint) => Promise<bigint>)(leaf)).toBe(stageOneClaimAmount);

    await blockchain.sendMessage(sandboxInternal({
      from: claimJettonWallet.address,
      to: claim.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(901n, stageOneClaimAmount - 1n),
    }));
    expect(await (claim.getGetClaimedByLeaf as (claimLeaf: bigint) => Promise<bigint>)(leaf)).toBe(stageOneClaimAmount);
    expect(await (claim.getGetPendingClaimAmount as (queryId: bigint) => Promise<bigint>)(901n)).toBe(stageOneClaimAmount);

    await blockchain.sendMessage(sandboxInternal({
      from: claimJettonWallet.address,
      to: claim.address,
      value: toNano('0.05'),
      bounced: true,
      body: bouncedJettonTransferBody(901n, stageOneClaimAmount),
    }));
    expect(await (claim.getGetClaimedByLeaf as (claimLeaf: bigint) => Promise<bigint>)(leaf)).toBe(0n);
    expect(await (claim.getGetPendingClaimAmount as (queryId: bigint) => Promise<bigint>)(901n)).toBe(0n);
  });
});
