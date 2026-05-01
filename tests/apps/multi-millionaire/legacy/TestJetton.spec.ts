import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, toNano } from '@ton/core';
import { LockVault } from '../build/LockVault/LockVault_LockVault';
import { TestJettonMaster } from '../build/TestJetton/TestJetton_TestJettonMaster';
import { TestJettonWallet } from '../build/TestJetton/TestJetton_TestJettonWallet';
import '@ton/test-utils';

function depositPayload(waveId: bigint) {
    return beginCell()
        .storeBit(false)
        .storeUint(waveId, 32)
        .asSlice();
}

function derivedPositionId(owner: Address, queryId: bigint) {
    return BigInt(`0x${beginCell().storeAddress(owner).storeUint(queryId, 64).endCell().hash().toString('hex')}`);
}

describe('TestJetton canary path', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let jettonMaster: SandboxContract<TestJettonMaster>;
    let lockVault: SandboxContract<LockVault>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        user = await blockchain.treasury('user');

        jettonMaster = blockchain.openContract(await TestJettonMaster.fromInit(deployer.address));
        await jettonMaster.send(deployer.getSender(), { value: toNano('0.1') }, null);

        lockVault = blockchain.openContract(await LockVault.fromInit(deployer.address, jettonMaster.address));
        await lockVault.send(deployer.getSender(), { value: toNano('0.1') }, null);

        const vaultJettonWallet = await jettonMaster.getGetWalletAddress(lockVault.address);
        await lockVault.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'SetVaultJettonWallet', queryId: 1n, vaultJettonWallet },
        );
    });

    it('mints a test Jetton and deposits through the real transfer notification path', async () => {
        const userJettonWalletAddress = await jettonMaster.getGetWalletAddress(user.address);
        const userJettonWallet = blockchain.openContract(TestJettonWallet.fromAddress(userJettonWalletAddress));

        await jettonMaster.send(
            deployer.getSender(),
            { value: toNano('0.2') },
            {
                $$type: 'Mint',
                queryId: 2n,
                recipient: user.address,
                amount: 1000n,
                responseDestination: deployer.address,
            },
        );

        expect((await userJettonWallet.getGetWalletData()).balance).toBe(1000n);

        const result = await userJettonWallet.send(
            user.getSender(),
            { value: toNano('0.25') },
            {
                $$type: 'JettonTransfer',
                queryId: 3n,
                amount: 400n,
                destination: lockVault.address,
                responseDestination: user.address,
                customPayload: null,
                forwardTonAmount: toNano('0.03'),
                forwardPayload: depositPayload(1n),
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: userJettonWalletAddress,
            success: true,
        });
        expect(result.transactions).toHaveTransaction({
            from: await jettonMaster.getGetWalletAddress(lockVault.address),
            to: lockVault.address,
            success: true,
        });

        const position = await lockVault.getPosition(derivedPositionId(user.address, 3n));
        expect(position.owner.equals(user.address)).toBe(true);
        expect(position.amountRaw).toBe(400n);
        expect(position.waveId).toBe(1n);
        expect((await userJettonWallet.getGetWalletData()).balance).toBe(600n);
        expect((await lockVault.getVaultState()).totalActiveRaw).toBe(400n);
    });
});
