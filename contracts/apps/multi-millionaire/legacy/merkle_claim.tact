import "@stdlib/ownable";

const REWARD_JETTON_TRANSFER_TON_FEE: Int = 50000000;
const CLAIM_UNCLAIMED: Int = 0;
const CLAIM_CLAIMING: Int = 1;
const CLAIM_CLAIMED: Int = 2;

message(0x524f4f54) SetMerkleRoot {
    batchId: Int as uint64;
    merkleRoot: Int as uint256;
}

message(0x524a574c) SetRewardJettonWallet {
    queryId: Int as uint64;
    rewardJettonWallet: Address;
}

message(0x434c414d) ClaimReward {
    queryId: Int as uint64;
    batchId: Int as uint64;
    ledgerIdHash: Int as uint256;
    recipient: Address;
    amountRaw: Int as coins;
    proof: Cell;
}

message(0x0f8a7ea5) JettonTransfer {
    queryId: Int as uint64;
    amount: Int as coins;
    destination: Address;
    responseDestination: Address;
    customPayload: Cell?;
    forwardTonAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

message(0xd53276db) JettonExcesses {
    queryId: Int as uint64;
}

message(0x50415553) SetPaused {
    paused: Bool;
}

contract MerkleClaim with Ownable {
    owner: Address;
    tokenAddress: Address;
    chainIdHash: Int as uint256;
    rewardJettonWallet: Address?;
    paused: Bool;
    activeBatchId: Int as uint64;
    merkleRoot: Int as uint256;
    totalClaimedRaw: Int as coins;
    claimCount: Int as uint64;
    claimedLedgers: map<Int as uint256, Int as uint8>;
    pendingClaims: map<Int as uint64, Int as uint256>;
    lastClaimer: Address?;
    lastLedgerIdHash: Int as uint256;
    lastAmountRaw: Int as coins;
    lastLeafHash: Int as uint256;

    init(owner: Address, tokenAddress: Address, chainIdHash: Int) {
        self.owner = owner;
        self.tokenAddress = tokenAddress;
        self.chainIdHash = chainIdHash;
        self.rewardJettonWallet = null;
        self.paused = false;
        self.activeBatchId = 0;
        self.merkleRoot = 0;
        self.totalClaimedRaw = 0;
        self.claimCount = 0;
        self.claimedLedgers = emptyMap();
        self.pendingClaims = emptyMap();
        self.lastClaimer = null;
        self.lastLedgerIdHash = 0;
        self.lastAmountRaw = 0;
        self.lastLeafHash = 0;
    }

    receive() {}

    receive(msg: SetPaused) {
        self.requireOwner();
        self.paused = msg.paused;
    }

    receive(msg: SetMerkleRoot) {
        self.requireOwner();
        throwUnless(1101, msg.batchId > 0);
        throwUnless(1102, msg.merkleRoot > 0);

        self.activeBatchId = msg.batchId;
        self.merkleRoot = msg.merkleRoot;
    }

    receive(msg: SetRewardJettonWallet) {
        self.requireOwner();
        throwUnless(1103, self.claimCount == 0);
        self.rewardJettonWallet = msg.rewardJettonWallet;
    }

    receive(msg: ClaimReward) {
        throwIf(1201, self.paused);
        throwUnless(1202, self.activeBatchId == msg.batchId);
        throwUnless(1203, self.merkleRoot != 0);
        throwUnless(1204, msg.amountRaw > 0);
        throwUnless(1205, msg.ledgerIdHash != 0);
        throwUnless(1206, sender() == msg.recipient);
        throwUnless(1207, self.claimStatus(msg.ledgerIdHash) == CLAIM_UNCLAIMED);

        let leafHash: Int = self.leafHash(msg.batchId, msg.ledgerIdHash, msg.recipient, msg.amountRaw);
        let calculatedRoot: Int = self.calculateRoot(leafHash, msg.proof);
        throwUnless(1208, calculatedRoot == self.merkleRoot);

        self.claimedLedgers.set(msg.ledgerIdHash, CLAIM_CLAIMING);
        self.pendingClaims.set(msg.queryId, msg.ledgerIdHash);

        let jettonWallet: Address? = self.rewardJettonWallet;
        throwUnless(1209, jettonWallet != null);

        send(SendParameters {
            to: jettonWallet!!,
            value: REWARD_JETTON_TRANSFER_TON_FEE,
            bounce: true,
            body: JettonTransfer {
                queryId: msg.queryId,
                amount: msg.amountRaw,
                destination: msg.recipient,
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: 1,
                forwardPayload: emptySlice(),
            }.toCell(),
        });

        self.claimedLedgers.set(msg.ledgerIdHash, CLAIM_CLAIMED);
        self.totalClaimedRaw += msg.amountRaw;
        self.claimCount += 1;
        self.lastClaimer = msg.recipient;
        self.lastLedgerIdHash = msg.ledgerIdHash;
        self.lastAmountRaw = msg.amountRaw;
        self.lastLeafHash = leafHash;
    }

    receive(msg: JettonExcesses) {
        throwUnless(1213, self.rewardJettonWallet != null && sender() == self.rewardJettonWallet!!);
        self.pendingClaims.del(msg.queryId);
    }

    bounced(msg: bounced<JettonTransfer>) {
        let pendingLedgerId: Int? = self.pendingClaims.get(msg.queryId);
        if (pendingLedgerId == null) {
            return;
        }

        let status: Int = self.claimStatus(pendingLedgerId!!);
        if (status == CLAIM_CLAIMED) {
            self.totalClaimedRaw -= msg.amount;
            self.claimCount -= 1;
        }

        if (status == CLAIM_CLAIMING || status == CLAIM_CLAIMED) {
            self.claimedLedgers.del(pendingLedgerId!!);
        }
        self.pendingClaims.del(msg.queryId);
    }

    fun claimStatus(ledgerIdHash: Int): Int {
        let status: Int? = self.claimedLedgers.get(ledgerIdHash);
        if (status == null) {
            return CLAIM_UNCLAIMED;
        }
        return status!!;
    }

    fun leafHash(batchId: Int, ledgerIdHash: Int, recipient: Address, amountRaw: Int): Int {
        return beginCell()
            .storeUint(self.chainIdHash, 256)
            .storeRef(beginCell()
                .storeAddress(self.tokenAddress)
                .storeAddress(myAddress())
                .endCell())
            .storeRef(beginCell()
                .storeUint(batchId, 64)
                .storeUint(ledgerIdHash, 256)
                .storeAddress(recipient)
                .storeCoins(amountRaw)
                .endCell())
            .endCell()
            .hash();
    }

    fun pairHash(left: Int, right: Int): Int {
        return beginCell()
            .storeUint(left, 256)
            .storeUint(right, 256)
            .endCell()
            .hash();
    }

    fun calculateRoot(leafHash: Int, proof: Cell): Int {
        let proofSlice: Slice = proof.beginParse();
        if (proofSlice.empty()) {
            return leafHash;
        }

        throwUnless(1210, proofSlice.bits() >= 16);
        let depth: Int = proofSlice.loadUint(16);
        if (depth == 0) {
            throwUnless(1212, proofSlice.empty());
            return leafHash;
        }
        throwUnless(1211, !proofSlice.refsEmpty());
        let node: Slice = proofSlice.loadRef().beginParse();
        let currentHash: Int = leafHash;
        let index: Int = 0;

        while (index < depth) {
            throwUnless(1211, node.bits() >= 257);
            let siblingOnRight: Bool = node.loadBool();
            let siblingHash: Int = node.loadUint(256);
            if (siblingOnRight) {
                currentHash = self.pairHash(currentHash, siblingHash);
            } else {
                currentHash = self.pairHash(siblingHash, currentHash);
            }

            index += 1;
            if (index < depth) {
                throwUnless(1211, !node.refsEmpty());
                node = node.loadRef().beginParse();
            }
        }

        return currentHash;
    }

    get fun claimState(): ClaimState {
        return ClaimState {
            owner: self.owner,
            tokenAddress: self.tokenAddress,
            chainIdHash: self.chainIdHash,
            rewardJettonWallet: self.rewardJettonWallet,
            paused: self.paused,
            activeBatchId: self.activeBatchId,
            merkleRoot: self.merkleRoot,
            totalClaimedRaw: self.totalClaimedRaw,
            claimCount: self.claimCount,
            lastClaimer: self.lastClaimer,
            lastLedgerIdHash: self.lastLedgerIdHash,
            lastAmountRaw: self.lastAmountRaw,
            lastLeafHash: self.lastLeafHash,
        };
    }

    get fun isClaimed(ledgerIdHash: Int): Bool {
        return self.claimStatus(ledgerIdHash) == CLAIM_CLAIMED;
    }

    get fun ledgerClaimStatus(ledgerIdHash: Int): Int {
        return self.claimStatus(ledgerIdHash);
    }

    get fun proofLeafHash(batchId: Int, ledgerIdHash: Int, recipient: Address, amountRaw: Int): Int {
        return self.leafHash(batchId, ledgerIdHash, recipient, amountRaw);
    }
}

struct ClaimState {
    owner: Address;
    tokenAddress: Address;
    chainIdHash: Int as uint256;
    rewardJettonWallet: Address?;
    paused: Bool;
    activeBatchId: Int as uint64;
    merkleRoot: Int as uint256;
    totalClaimedRaw: Int as coins;
    claimCount: Int as uint64;
    lastClaimer: Address?;
    lastLedgerIdHash: Int as uint256;
    lastAmountRaw: Int as coins;
    lastLeafHash: Int as uint256;
}
