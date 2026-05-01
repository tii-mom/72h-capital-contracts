import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, toNano } from '@ton/core';
import { LockVault } from '../build/LockVault/LockVault_LockVault';
import '@ton/test-utils';

const TOKEN_SCALE = 1_000_000_000n;
const ONE_YEAR_SECONDS = 31_536_000;
const PRICE_DELAY_SECONDS = 3_600;
const PRICE_FRESHNESS_SECONDS = 86_400;
const POSITION_ACTIVE = 0n;
const POSITION_WITHDRAWN = 2n;

function depositPayload(waveId: bigint) {
    return beginCell()
        .storeBit(false)
        .storeUint(waveId, 32)
        .asSlice();
}

function derivedPositionId(owner: Address, queryId: bigint) {
    return BigInt(`0x${beginCell().storeAddress(owner).storeUint(queryId, 64).endCell().hash().toString('hex')}`);
}

describe('LockVault', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let other: SandboxContract<TreasuryContract>;
    let vaultJettonWallet: SandboxContract<TreasuryContract>;
    let lockVault: SandboxContract<LockVault>;
    let tokenAddress: Address;

    async function stageAndApplyPrice(priceUsdE6: bigint, queryId = 900n) {
        const stagedAt = blockchain.now || 1_700_000_000;
        const stage = await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'StagePrice', queryId, priceUsdE6 },
        );
        expect(stage.transactions).toHaveTransaction({
            from: deployer.address,
            to: lockVault.address,
            success: true,
        });
        blockchain.now = stagedAt + PRICE_DELAY_SECONDS + 1;
        const apply = await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'ApplyPrice', queryId: queryId + 1n },
        );
        expect(apply.transactions).toHaveTransaction({
            from: deployer.address,
            to: lockVault.address,
            success: true,
        });
    }

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = 1_700_000_000;
        deployer = await blockchain.treasury('deployer');
        user = await blockchain.treasury('user');
        other = await blockchain.treasury('other');
        vaultJettonWallet = await blockchain.treasury('vaultJettonWallet');
        tokenAddress = (await blockchain.treasury('token')).address;

        lockVault = blockchain.openContract(await LockVault.fromInit(deployer.address, tokenAddress));

        const deployResult = await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            null,
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: lockVault.address,
            deploy: true,
            success: true,
        });

        await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetVaultJettonWallet', queryId: 1n, vaultJettonWallet: vaultJettonWallet.address },
        );
    });

    it('records deposits only from the configured vault Jetton wallet and derives position id from owner/query', async () => {
        const queryId = 1n;
        const expectedPositionId = derivedPositionId(user.address, queryId);
        const contractPositionId = await lockVault.getDerivedPositionId(user.address, queryId);
        expect(contractPositionId).toBe(expectedPositionId);

        const result = await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId,
                amount: 1000n,
                sender: user.address,
                forwardPayload: depositPayload(7n),
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: vaultJettonWallet.address,
            to: lockVault.address,
            success: true,
        });

        const state = await lockVault.getVaultState();
        expect(state.owner.equals(deployer.address)).toBe(true);
        expect(state.tokenAddress.equals(tokenAddress)).toBe(true);
        expect(state.vaultJettonWallet?.equals(vaultJettonWallet.address)).toBe(true);
        expect(state.totalDepositedRaw).toBe(1000n);
        expect(state.totalActiveRaw).toBe(1000n);
        expect(state.depositCount).toBe(1n);
        expect(state.lastDepositor?.equals(user.address)).toBe(true);
        expect(state.lastWaveId).toBe(7n);
        expect(state.lastAmountRaw).toBe(1000n);
        expect(state.lastPositionId).toBe(expectedPositionId);

        const position = await lockVault.getPosition(expectedPositionId);
        expect(position.owner.equals(user.address)).toBe(true);
        expect(position.amountRaw).toBe(1000n);
        expect(position.waveId).toBe(7n);
        expect(position.status).toBe(POSITION_ACTIVE);

        const userState = await lockVault.getUserState(user.address);
        expect(userState.activeRaw).toBe(1000n);
        expect(userState.targetUsdE6).toBe(1_000_000_000_000n);
        expect(userState.goalReached).toBe(false);
    });

    it('rejects forged deposit notifications', async () => {
        const result = await lockVault.send(
            other.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: 1n,
                amount: 1000n,
                sender: user.address,
                forwardPayload: depositPayload(7n),
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: other.address,
            to: lockVault.address,
            success: false,
            exitCode: 1003,
        });
    });

    it('lets only the position owner withdraw after the fixed price target is reached', async () => {
        await stageAndApplyPrice(1000n);

        const queryId = 2n;
        const positionId = derivedPositionId(user.address, queryId);
        const oneBillionTokensRaw = 1_000_000_000n * TOKEN_SCALE;
        await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId,
                amount: oneBillionTokensRaw,
                sender: user.address,
                forwardPayload: depositPayload(1n),
            },
        );

        const rejected = await lockVault.send(
            other.getSender(),
            { value: toNano('0.1') },
            { $$type: 'WithdrawPosition', queryId: 3n, positionId },
        );

        expect(rejected.transactions).toHaveTransaction({
            from: other.address,
            to: lockVault.address,
            success: false,
            exitCode: 1021,
        });

        const result = await lockVault.send(
            user.getSender(),
            { value: toNano('0.15') },
            { $$type: 'WithdrawPosition', queryId: 4n, positionId },
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: lockVault.address,
            success: true,
        });
        expect(result.transactions).toHaveTransaction({
            from: lockVault.address,
            to: vaultJettonWallet.address,
            success: true,
        });

        const position = await lockVault.getPosition(positionId);
        expect(position.status).toBe(POSITION_WITHDRAWN);
        const state = await lockVault.getVaultState();
        expect(state.totalWithdrawnRaw).toBe(oneBillionTokensRaw);
        expect(state.totalActiveRaw).toBe(0n);
    });

    it('blocks new deposits after a user reaches the target until the active cycle is withdrawn', async () => {
        await stageAndApplyPrice(1000n);

        const firstQueryId = 2n;
        const firstPositionId = derivedPositionId(user.address, firstQueryId);
        const oneBillionTokensRaw = 1_000_000_000n * TOKEN_SCALE;
        await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: firstQueryId,
                amount: oneBillionTokensRaw,
                sender: user.address,
                forwardPayload: depositPayload(1n),
            },
        );

        const blockedTopUp = await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: 3n,
                amount: 1n,
                sender: user.address,
                forwardPayload: depositPayload(1n),
            },
        );

        expect(blockedTopUp.transactions).toHaveTransaction({
            from: vaultJettonWallet.address,
            to: lockVault.address,
            success: false,
            exitCode: 1008,
        });

        await lockVault.send(
            user.getSender(),
            { value: toNano('0.15') },
            { $$type: 'WithdrawPosition', queryId: 4n, positionId: firstPositionId },
        );

        const nextCycleDeposit = await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: 5n,
                amount: 1n,
                sender: user.address,
                forwardPayload: depositPayload(1n),
            },
        );

        expect(nextCycleDeposit.transactions).toHaveTransaction({
            from: vaultJettonWallet.address,
            to: lockVault.address,
            success: true,
        });
    });

    it('keeps funds locked until either fixed target or one-year time lock is satisfied', async () => {
        const queryId = 1n;
        const positionId = derivedPositionId(user.address, queryId);
        await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId,
                amount: 1000n,
                sender: user.address,
                forwardPayload: depositPayload(1n),
            },
        );

        const early = await lockVault.send(
            user.getSender(),
            { value: toNano('0.15') },
            { $$type: 'WithdrawPosition', queryId: 2n, positionId },
        );
        expect(early.transactions).toHaveTransaction({
            from: user.address,
            to: lockVault.address,
            success: false,
            exitCode: 1023,
        });

        blockchain.now = 1_700_000_000 + ONE_YEAR_SECONDS + 1;
        const mature = await lockVault.send(
            user.getSender(),
            { value: toNano('0.15') },
            { $$type: 'WithdrawPosition', queryId: 3n, positionId },
        );
        expect(mature.transactions).toHaveTransaction({
            from: user.address,
            to: lockVault.address,
            success: true,
        });
    });

    it('does not expose a user-controlled low target path', async () => {
        await stageAndApplyPrice(1n);
        const queryId = 300n;
        const positionId = derivedPositionId(user.address, queryId);
        await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId,
                amount: 1n,
                sender: user.address,
                forwardPayload: depositPayload(1n),
            },
        );

        const userState = await lockVault.getUserState(user.address);
        expect(userState.targetUsdE6).toBe(1_000_000_000_000n);
        expect(userState.goalReached).toBe(false);

        const early = await lockVault.send(
            user.getSender(),
            { value: toNano('0.15') },
            { $$type: 'WithdrawPosition', queryId: 301n, positionId },
        );
        expect(early.transactions).toHaveTransaction({
            from: user.address,
            to: lockVault.address,
            success: false,
            exitCode: 1023,
        });
    });

    it('applies staged prices only after delay and rejects more than 20 percent movement', async () => {
        await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'StagePrice', queryId: 1n, priceUsdE6: 1000n },
        );

        const tooEarly = await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'ApplyPrice', queryId: 2n },
        );
        expect(tooEarly.transactions).toHaveTransaction({
            from: deployer.address,
            to: lockVault.address,
            success: false,
            exitCode: 1052,
        });

        blockchain.now = 1_700_000_000 + PRICE_DELAY_SECONDS + 1;
        await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'ApplyPrice', queryId: 3n },
        );

        await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'StagePrice', queryId: 4n, priceUsdE6: 1300n },
        );
        blockchain.now = 1_700_000_000 + PRICE_DELAY_SECONDS * 2 + 2;
        const tooLarge = await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'ApplyPrice', queryId: 5n },
        );
        expect(tooLarge.transactions).toHaveTransaction({
            from: deployer.address,
            to: lockVault.address,
            success: false,
            exitCode: 1053,
        });
    });

    it('does not use stale price for price unlock', async () => {
        await stageAndApplyPrice(1000n);

        const queryId = 20n;
        const positionId = derivedPositionId(user.address, queryId);
        const oneBillionTokensRaw = 1_000_000_000n * TOKEN_SCALE;
        await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId,
                amount: oneBillionTokensRaw,
                sender: user.address,
                forwardPayload: depositPayload(1n),
            },
        );

        blockchain.now = (blockchain.now || 1_700_003_601) + PRICE_FRESHNESS_SECONDS + 1;
        const stale = await lockVault.send(
            user.getSender(),
            { value: toNano('0.15') },
            { $$type: 'WithdrawPosition', queryId: 21n, positionId },
        );
        expect(stale.transactions).toHaveTransaction({
            from: user.address,
            to: lockVault.address,
            success: false,
            exitCode: 1023,
        });
    });

    it('uses sender/query derived position ids so another user cannot preempt a position id', async () => {
        const sharedQueryId = 77n;
        const userPositionId = derivedPositionId(user.address, sharedQueryId);
        const otherPositionId = derivedPositionId(other.address, sharedQueryId);
        expect(userPositionId).not.toBe(otherPositionId);

        await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: sharedQueryId,
                amount: 1000n,
                sender: other.address,
                forwardPayload: depositPayload(1n),
            },
        );

        const userDeposit = await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: sharedQueryId,
                amount: 2000n,
                sender: user.address,
                forwardPayload: depositPayload(1n),
            },
        );
        expect(userDeposit.transactions).toHaveTransaction({
            from: vaultJettonWallet.address,
            to: lockVault.address,
            success: true,
        });

        const duplicateSameOwner = await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: sharedQueryId,
                amount: 1n,
                sender: user.address,
                forwardPayload: depositPayload(1n),
            },
        );
        expect(duplicateSameOwner.transactions).toHaveTransaction({
            from: vaultJettonWallet.address,
            to: lockVault.address,
            success: false,
            exitCode: 1006,
        });
    });

    it('pauses new deposits without blocking valid withdrawals', async () => {
        const queryId = 1n;
        const positionId = derivedPositionId(user.address, queryId);
        await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId,
                amount: 1000n,
                sender: user.address,
                forwardPayload: depositPayload(1n),
            },
        );

        await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetPaused', paused: true },
        );

        const blockedDeposit = await lockVault.send(
            vaultJettonWallet.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'JettonTransferNotification',
                queryId: 2n,
                amount: 1000n,
                sender: user.address,
                forwardPayload: depositPayload(1n),
            },
        );
        expect(blockedDeposit.transactions).toHaveTransaction({
            from: vaultJettonWallet.address,
            to: lockVault.address,
            success: false,
            exitCode: 1001,
        });

        blockchain.now = 1_700_000_000 + ONE_YEAR_SECONDS + 1;
        const withdrawal = await lockVault.send(
            user.getSender(),
            { value: toNano('0.15') },
            { $$type: 'WithdrawPosition', queryId: 3n, positionId },
        );
        expect(withdrawal.transactions).toHaveTransaction({
            from: user.address,
            to: lockVault.address,
            success: true,
        });
    });
});
