import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { MerkleClaim } from '../build/MerkleClaim/MerkleClaim_MerkleClaim';
import '@ton/test-utils';

const CHAIN_ID_HASH = 123456789n;

type ProofItem = { side: 'left' | 'right'; hash: bigint };

function leafHash(
    chainIdHash: bigint,
    tokenAddress: Address,
    claimAddress: Address,
    batchId: bigint,
    ledgerIdHash: bigint,
    recipient: Address,
    amountRaw: bigint,
) {
    return cellHashInt(beginCell()
        .storeUint(chainIdHash, 256)
        .storeRef(beginCell()
            .storeAddress(tokenAddress)
            .storeAddress(claimAddress)
            .endCell())
        .storeRef(beginCell()
            .storeUint(batchId, 64)
            .storeUint(ledgerIdHash, 256)
            .storeAddress(recipient)
            .storeCoins(amountRaw)
            .endCell())
        .endCell());
}

function pairHash(left: bigint, right: bigint) {
    return cellHashInt(beginCell()
        .storeUint(left, 256)
        .storeUint(right, 256)
        .endCell());
}

function cellHashInt(cell: Cell) {
    return BigInt(`0x${cell.hash().toString('hex')}`);
}

function emptyProof(): Cell {
    return beginCell().endCell();
}

function proofNode(items: ProofItem[], index = 0): Cell {
    let builder = beginCell()
        .storeBit(items[index].side === 'right')
        .storeUint(items[index].hash, 256);
    if (index + 1 < items.length) {
        builder = builder.storeRef(proofNode(items, index + 1));
    }
    return builder.endCell();
}

function proofCell(items: ProofItem[]): Cell {
    if (items.length === 0) {
        return emptyProof();
    }
    return beginCell()
        .storeUint(items.length, 16)
        .storeRef(proofNode(items))
        .endCell();
}

function merkleRootAndProof(leaves: bigint[], targetIndex: number) {
    let level = leaves;
    let index = targetIndex;
    const proof: ProofItem[] = [];

    while (level.length > 1) {
        const next: bigint[] = [];
        for (let i = 0; i < level.length; i += 2) {
            const left = level[i];
            const right = level[i + 1] ?? left;
            next.push(pairHash(left, right));
            if (i === index || i + 1 === index) {
                if (index === i) {
                    proof.push({ side: 'right', hash: right });
                } else {
                    proof.push({ side: 'left', hash: left });
                }
                index = Math.floor(i / 2);
            }
        }
        level = next;
    }

    return { root: level[0], proof };
}

describe('MerkleClaim', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let other: SandboxContract<TreasuryContract>;
    let rewardJettonWallet: SandboxContract<TreasuryContract>;
    let merkleClaim: SandboxContract<MerkleClaim>;
    let tokenAddress: Address;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        user = await blockchain.treasury('user');
        other = await blockchain.treasury('other');
        rewardJettonWallet = await blockchain.treasury('rewardJettonWallet');
        tokenAddress = (await blockchain.treasury('token')).address;

        merkleClaim = blockchain.openContract(await MerkleClaim.fromInit(deployer.address, tokenAddress, CHAIN_ID_HASH));

        const deployResult = await merkleClaim.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            null,
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: merkleClaim.address,
            deploy: true,
            success: true,
        });

        await merkleClaim.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetRewardJettonWallet', queryId: 1n, rewardJettonWallet: rewardJettonWallet.address },
        );
    });

    it('verifies a domain-separated Merkle proof and sends reward Jettons to the claimant', async () => {
        const batchId = 1n;
        const ledgerIdHash = 22n;
        const amountRaw = 500n;
        const root = leafHash(CHAIN_ID_HASH, tokenAddress, merkleClaim.address, batchId, ledgerIdHash, user.address, amountRaw);

        await merkleClaim.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetMerkleRoot', batchId, merkleRoot: root },
        );

        const contractLeafHash = await merkleClaim.getProofLeafHash(batchId, ledgerIdHash, user.address, amountRaw);
        expect(contractLeafHash).toBe(root);

        const result = await merkleClaim.send(
            user.getSender(),
            { value: toNano('0.15') },
            {
                $$type: 'ClaimReward',
                queryId: 1n,
                batchId,
                ledgerIdHash,
                recipient: user.address,
                amountRaw,
                proof: emptyProof(),
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: merkleClaim.address,
            success: true,
        });
        expect(result.transactions).toHaveTransaction({
            from: merkleClaim.address,
            to: rewardJettonWallet.address,
            success: true,
        });

        const state = await merkleClaim.getClaimState();
        expect(state.owner.equals(deployer.address)).toBe(true);
        expect(state.tokenAddress.equals(tokenAddress)).toBe(true);
        expect(state.chainIdHash).toBe(CHAIN_ID_HASH);
        expect(state.rewardJettonWallet?.equals(rewardJettonWallet.address)).toBe(true);
        expect(state.activeBatchId).toBe(batchId);
        expect(state.merkleRoot).toBe(root);
        expect(state.totalClaimedRaw).toBe(amountRaw);
        expect(state.claimCount).toBe(1n);
        expect(state.lastClaimer?.equals(user.address)).toBe(true);
        expect(state.lastLedgerIdHash).toBe(ledgerIdHash);
        expect(state.lastAmountRaw).toBe(amountRaw);
        expect(state.lastLeafHash).toBe(root);
        expect(await merkleClaim.getIsClaimed(ledgerIdHash)).toBe(true);
    });

    it('supports ref-chain proofs beyond the old single-cell limit', async () => {
        const batchId = 1n;
        const amountRaw = 700n;
        const targetIndex = 513;
        const leaves = Array.from({ length: 1024 }, (_, index) => leafHash(
            CHAIN_ID_HASH,
            tokenAddress,
            merkleClaim.address,
            batchId,
            BigInt(10_000 + index),
            index === targetIndex ? user.address : other.address,
            amountRaw + BigInt(index),
        ));
        const { root, proof } = merkleRootAndProof(leaves, targetIndex);

        await merkleClaim.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetMerkleRoot', batchId, merkleRoot: root },
        );

        const result = await merkleClaim.send(
            user.getSender(),
            { value: toNano('0.2') },
            {
                $$type: 'ClaimReward',
                queryId: 1n,
                batchId,
                ledgerIdHash: BigInt(10_000 + targetIndex),
                recipient: user.address,
                amountRaw: amountRaw + BigInt(targetIndex),
                proof: proofCell(proof),
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: merkleClaim.address,
            success: true,
        });
    });

    it('rejects claims before a root is active', async () => {
        const result = await merkleClaim.send(
            user.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'ClaimReward',
                queryId: 1n,
                batchId: 1n,
                ledgerIdHash: 22n,
                recipient: user.address,
                amountRaw: 500n,
                proof: emptyProof(),
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: merkleClaim.address,
            success: false,
            exitCode: 1202,
        });
    });

    it('rejects wrong recipient, wrong proof, duplicate claims, and cross-contract replay', async () => {
        const batchId = 1n;
        const ledgerIdHash = 22n;
        const amountRaw = 500n;
        const root = leafHash(CHAIN_ID_HASH, tokenAddress, merkleClaim.address, batchId, ledgerIdHash, user.address, amountRaw);

        await merkleClaim.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetMerkleRoot', batchId, merkleRoot: root },
        );

        const wrongRecipient = await merkleClaim.send(
            other.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'ClaimReward',
                queryId: 1n,
                batchId,
                ledgerIdHash,
                recipient: user.address,
                amountRaw,
                proof: emptyProof(),
            },
        );
        expect(wrongRecipient.transactions).toHaveTransaction({
            from: other.address,
            to: merkleClaim.address,
            success: false,
            exitCode: 1206,
        });

        const wrongProof = await merkleClaim.send(
            user.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'ClaimReward',
                queryId: 2n,
                batchId,
                ledgerIdHash,
                recipient: user.address,
                amountRaw: amountRaw + 1n,
                proof: emptyProof(),
            },
        );
        expect(wrongProof.transactions).toHaveTransaction({
            from: user.address,
            to: merkleClaim.address,
            success: false,
            exitCode: 1208,
        });

        const fakeClaimAddress = other.address;
        const replayRoot = leafHash(CHAIN_ID_HASH, tokenAddress, fakeClaimAddress, batchId, 33n, user.address, amountRaw);
        await merkleClaim.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetMerkleRoot', batchId: 2n, merkleRoot: replayRoot },
        );
        const replay = await merkleClaim.send(
            user.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'ClaimReward',
                queryId: 3n,
                batchId: 2n,
                ledgerIdHash: 33n,
                recipient: user.address,
                amountRaw,
                proof: emptyProof(),
            },
        );
        expect(replay.transactions).toHaveTransaction({
            from: user.address,
            to: merkleClaim.address,
            success: false,
            exitCode: 1208,
        });

        await merkleClaim.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetMerkleRoot', batchId, merkleRoot: root },
        );
        await merkleClaim.send(
            user.getSender(),
            { value: toNano('0.15') },
            {
                $$type: 'ClaimReward',
                queryId: 4n,
                batchId,
                ledgerIdHash,
                recipient: user.address,
                amountRaw,
                proof: emptyProof(),
            },
        );

        const duplicate = await merkleClaim.send(
            user.getSender(),
            { value: toNano('0.15') },
            {
                $$type: 'ClaimReward',
                queryId: 5n,
                batchId,
                ledgerIdHash,
                recipient: user.address,
                amountRaw,
                proof: emptyProof(),
            },
        );
        expect(duplicate.transactions).toHaveTransaction({
            from: user.address,
            to: merkleClaim.address,
            success: false,
            exitCode: 1207,
        });
    });
});
