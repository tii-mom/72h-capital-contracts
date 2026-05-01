import "@stdlib/ownable";

const TOKEN_SCALE_9: Int = 1000000000;
const JETTON_TRANSFER_TON_FEE: Int = 80000000;
const PRICE_UPDATE_DELAY_SECONDS: Int = 3600;
const PRICE_FRESHNESS_SECONDS: Int = 86400;
const MAX_PRICE_CHANGE_BPS: Int = 2000;
const BPS_SCALE: Int = 10000;

const TARGET_USD9_10K: Int = 10000000000000;
const TARGET_USD9_100K: Int = 100000000000000;
const TARGET_USD9_500K: Int = 500000000000000;
const TARGET_USD9_1M: Int = 1000000000000000;
const TARGET_USD9_5M: Int = 5000000000000000;
const TARGET_USD9_10M: Int = 10000000000000000;

message(0x7362d09c) JettonTransferNotification {
    queryId: Int as uint64;
    amount: Int as coins;
    sender: Address;
    forwardPayload: Slice as remaining;
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

message(0x53503939) StagePrice {
    queryId: Int as uint64;
    priceUsd9: Int as uint128;
}

message(0x41503939) ApplyPrice {
    queryId: Int as uint64;
}

message(0x4a57544c) SetVaultJettonWallet {
    queryId: Int as uint64;
    vaultJettonWallet: Address;
}

message(0x57414c4c) WithdrawAll {
    queryId: Int as uint64;
}

struct DepositGoalPayload {
    seasonId: Int as uint8;
    waveId: Int as uint32;
    targetUsd9: Int as uint128;
}

struct VaultState {
    owner: Address;
    jettonMaster: Address;
    vaultJettonWallet: Address?;
    paused: Bool;
    activePriceUsd9: Int as uint128;
    activePriceUpdatedAt: Int as uint64;
    pendingPriceUsd9: Int as uint128;
    pendingPriceValidAfter: Int as uint64;
    totalDepositedRaw: Int as coins;
    totalActiveRaw: Int as coins;
    totalWithdrawnRaw: Int as coins;
    depositCount: Int as uint64;
    withdrawCount: Int as uint64;
    userCount: Int as uint64;
    lastDepositor: Address?;
    lastSeasonId: Int as uint8;
    lastWaveId: Int as uint32;
    lastAmountRaw: Int as coins;
    lastTargetUsd9: Int as uint128;
}

struct UserState {
    activeRaw: Int as coins;
    targetUsd9: Int as uint128;
    seasonId: Int as uint8;
    waveId: Int as uint32;
    goalReached: Bool;
    pendingWithdrawal: Bool;
}

struct PendingWithdrawalState {
    owner: Address?;
    amountRaw: Int as coins;
}

contract MultiMillionaireDepositVault with Ownable {
    owner: Address;
    jettonMaster: Address;
    vaultJettonWallet: Address?;
    paused: Bool;
    activePriceUsd9: Int as uint128;
    activePriceUpdatedAt: Int as uint64;
    pendingPriceUsd9: Int as uint128;
    pendingPriceValidAfter: Int as uint64;
    totalDepositedRaw: Int as coins;
    totalActiveRaw: Int as coins;
    totalWithdrawnRaw: Int as coins;
    depositCount: Int as uint64;
    withdrawCount: Int as uint64;
    userCount: Int as uint64;
    activeRawByUser: map<Address, Int>;
    targetUsd9ByUser: map<Address, Int>;
    seasonIdByUser: map<Address, Int>;
    waveIdByUser: map<Address, Int>;
    seenUser: map<Address, Bool>;
    depositQuerySeen: map<Int as uint256, Bool>;
    pendingOwnerByQuery: map<Int as uint64, Address>;
    pendingAmountByQuery: map<Int as uint64, Int>;
    pendingQueryByUser: map<Address, Int>;
    lastDepositor: Address?;
    lastSeasonId: Int as uint8;
    lastWaveId: Int as uint32;
    lastAmountRaw: Int as coins;
    lastTargetUsd9: Int as uint128;

    init(owner: Address, jettonMaster: Address) {
        self.owner = owner;
        self.jettonMaster = jettonMaster;
        self.vaultJettonWallet = null;
        self.paused = true;
        self.activePriceUsd9 = 0;
        self.activePriceUpdatedAt = 0;
        self.pendingPriceUsd9 = 0;
        self.pendingPriceValidAfter = 0;
        self.totalDepositedRaw = 0;
        self.totalActiveRaw = 0;
        self.totalWithdrawnRaw = 0;
        self.depositCount = 0;
        self.withdrawCount = 0;
        self.userCount = 0;
        self.activeRawByUser = emptyMap();
        self.targetUsd9ByUser = emptyMap();
        self.seasonIdByUser = emptyMap();
        self.waveIdByUser = emptyMap();
        self.seenUser = emptyMap();
        self.depositQuerySeen = emptyMap();
        self.pendingOwnerByQuery = emptyMap();
        self.pendingAmountByQuery = emptyMap();
        self.pendingQueryByUser = emptyMap();
        self.lastDepositor = null;
        self.lastSeasonId = 0;
        self.lastWaveId = 0;
        self.lastAmountRaw = 0;
        self.lastTargetUsd9 = 0;
    }

    receive() {}

    receive(msg: SetPaused) {
        self.requireOwner();
        self.paused = msg.paused;
    }

    receive(msg: StagePrice) {
        self.requireOwner();
        throwUnless(1050, msg.priceUsd9 > 0);
        self.pendingPriceUsd9 = msg.priceUsd9;
        self.pendingPriceValidAfter = now() + PRICE_UPDATE_DELAY_SECONDS;
    }

    receive(msg: ApplyPrice) {
        self.requireOwner();
        throwUnless(1051, self.pendingPriceUsd9 > 0);
        throwUnless(1052, now() >= self.pendingPriceValidAfter);

        if (self.activePriceUsd9 > 0) {
            let minPrice: Int = self.activePriceUsd9 * (BPS_SCALE - MAX_PRICE_CHANGE_BPS) / BPS_SCALE;
            let maxPrice: Int = self.activePriceUsd9 * (BPS_SCALE + MAX_PRICE_CHANGE_BPS) / BPS_SCALE;
            throwUnless(1053, self.pendingPriceUsd9 >= minPrice && self.pendingPriceUsd9 <= maxPrice);
        }

        self.activePriceUsd9 = self.pendingPriceUsd9;
        self.activePriceUpdatedAt = now();
        self.pendingPriceUsd9 = 0;
        self.pendingPriceValidAfter = 0;
    }

    receive(msg: SetVaultJettonWallet) {
        self.requireOwner();
        throwUnless(1007, self.depositCount == 0);
        self.vaultJettonWallet = msg.vaultJettonWallet;
    }

    receive(msg: JettonTransferNotification) {
        throwIf(1001, self.paused);
        throwUnless(1002, msg.amount > 0);
        throwUnless(1003, self.vaultJettonWallet != null && sender() == self.vaultJettonWallet!!);
        throwUnless(1004, !msg.forwardPayload.empty());
        throwUnless(1005, !self.hasPendingWithdrawal(msg.sender));

        let payload: DepositGoalPayload = self.parseDepositGoalPayload(msg.forwardPayload);
        throwUnless(1006, self.isSupportedTarget(payload.targetUsd9));

        let depositKey: Int = self.deriveDepositKey(msg.sender, msg.queryId);
        throwUnless(1008, !self.depositQuerySeen.exists(depositKey));
        self.depositQuerySeen.set(depositKey, true);

        let currentTarget: Int? = self.targetUsd9ByUser.get(msg.sender);
        if (currentTarget == null) {
            self.targetUsd9ByUser.set(msg.sender, payload.targetUsd9);
            self.seasonIdByUser.set(msg.sender, payload.seasonId);
            self.waveIdByUser.set(msg.sender, payload.waveId);
        } else {
            throwUnless(1009, currentTarget!! == payload.targetUsd9);
        }

        let seen: Bool? = self.seenUser.get(msg.sender);
        if (seen == null || !seen!!) {
            self.seenUser.set(msg.sender, true);
            self.userCount += 1;
        }

        let nextActive: Int = self.activeRaw(msg.sender) + msg.amount;
        self.activeRawByUser.set(msg.sender, nextActive);
        self.totalDepositedRaw += msg.amount;
        self.totalActiveRaw += msg.amount;
        self.depositCount += 1;
        self.lastDepositor = msg.sender;
        self.lastSeasonId = payload.seasonId;
        self.lastWaveId = payload.waveId;
        self.lastAmountRaw = msg.amount;
        self.lastTargetUsd9 = payload.targetUsd9;
    }

    receive(msg: WithdrawAll) {
        throwIf(1020, self.paused);
        throwUnless(1021, !self.pendingOwnerByQuery.exists(msg.queryId));
        throwUnless(1022, !self.hasPendingWithdrawal(sender()));

        let activeRaw: Int = self.activeRaw(sender());
        throwUnless(1023, activeRaw > 0);
        let targetUsd9: Int = self.targetUsd9(sender());
        throwUnless(1024, targetUsd9 > 0);
        throwUnless(1025, self.hasFreshPrice());
        throwUnless(1026, self.hasReachedGoal(activeRaw, targetUsd9));

        let jettonWallet: Address? = self.vaultJettonWallet;
        throwUnless(1027, jettonWallet != null);

        self.activeRawByUser.set(sender(), 0);
        self.totalActiveRaw -= activeRaw;
        self.totalWithdrawnRaw += activeRaw;
        self.withdrawCount += 1;
        self.pendingOwnerByQuery.set(msg.queryId, sender());
        self.pendingAmountByQuery.set(msg.queryId, activeRaw);
        self.pendingQueryByUser.set(sender(), msg.queryId);

        send(SendParameters {
            to: jettonWallet!!,
            value: JETTON_TRANSFER_TON_FEE,
            bounce: true,
            body: JettonTransfer {
                queryId: msg.queryId,
                amount: activeRaw,
                destination: sender(),
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: 1,
                forwardPayload: self.emptyJettonForwardPayload(),
            }.toCell(),
        });
    }

    receive(msg: JettonExcesses) {
        throwUnless(1030, self.vaultJettonWallet != null && sender() == self.vaultJettonWallet!!);
        self.finalizeWithdrawal(msg.queryId);
    }

    bounced(msg: bounced<JettonTransfer>) {
        throwUnless(1031, self.vaultJettonWallet != null && sender() == self.vaultJettonWallet!!);
        let owner: Address? = self.pendingOwnerByQuery.get(msg.queryId);
        let amount: Int? = self.pendingAmountByQuery.get(msg.queryId);
        if (owner == null || amount == null) {
            return;
        }
        if (amount!! != msg.amount) {
            return;
        }

        self.activeRawByUser.set(owner!!, self.activeRaw(owner!!) + amount!!);
        self.totalActiveRaw += amount!!;
        self.totalWithdrawnRaw -= amount!!;
        self.withdrawCount -= 1;
        self.clearPendingWithdrawal(msg.queryId, owner!!);
    }

    fun parseDepositGoalPayload(forwardPayload: Slice): DepositGoalPayload {
        let payload: Slice = forwardPayload;
        throwUnless(1040, payload.bits() >= 1);

        let payloadInRef: Bool = payload.loadBool();
        if (payloadInRef) {
            throwUnless(1041, !payload.refsEmpty());
            payload = payload.loadRef().beginParse();
        }

        throwUnless(1042, payload.bits() >= 168);
        return DepositGoalPayload {
            seasonId: payload.loadUint(8),
            waveId: payload.loadUint(32),
            targetUsd9: payload.loadUint(128),
        };
    }

    fun isSupportedTarget(targetUsd9: Int): Bool {
        return targetUsd9 == TARGET_USD9_10K ||
            targetUsd9 == TARGET_USD9_100K ||
            targetUsd9 == TARGET_USD9_500K ||
            targetUsd9 == TARGET_USD9_1M ||
            targetUsd9 == TARGET_USD9_5M ||
            targetUsd9 == TARGET_USD9_10M;
    }

    fun deriveDepositKey(user: Address, queryId: Int): Int {
        return beginCell()
            .storeAddress(user)
            .storeUint(queryId, 64)
            .endCell()
            .hash();
    }

    fun activeRaw(user: Address): Int {
        let value: Int? = self.activeRawByUser.get(user);
        return value == null ? 0 : value!!;
    }

    fun targetUsd9(user: Address): Int {
        let value: Int? = self.targetUsd9ByUser.get(user);
        return value == null ? 0 : value!!;
    }

    fun seasonId(user: Address): Int {
        let value: Int? = self.seasonIdByUser.get(user);
        return value == null ? 0 : value!!;
    }

    fun waveId(user: Address): Int {
        let value: Int? = self.waveIdByUser.get(user);
        return value == null ? 0 : value!!;
    }

    fun hasPendingWithdrawal(user: Address): Bool {
        return self.pendingQueryByUser.exists(user);
    }

    fun hasFreshPrice(): Bool {
        return self.activePriceUsd9 > 0 && self.activePriceUpdatedAt > 0 && now() <= self.activePriceUpdatedAt + PRICE_FRESHNESS_SECONDS;
    }

    fun hasReachedGoal(activeRaw: Int, targetUsd9: Int): Bool {
        return activeRaw * self.activePriceUsd9 >= targetUsd9 * TOKEN_SCALE_9;
    }

    fun finalizeWithdrawal(queryId: Int) {
        let owner: Address? = self.pendingOwnerByQuery.get(queryId);
        if (owner == null) {
            return;
        }
        self.targetUsd9ByUser.del(owner!!);
        self.seasonIdByUser.del(owner!!);
        self.waveIdByUser.del(owner!!);
        self.clearPendingWithdrawal(queryId, owner!!);
    }

    fun clearPendingWithdrawal(queryId: Int, owner: Address) {
        self.pendingOwnerByQuery.del(queryId);
        self.pendingAmountByQuery.del(queryId);
        self.pendingQueryByUser.del(owner);
    }

    fun emptyJettonForwardPayload(): Slice {
        return beginCell().storeBit(false).endCell().asSlice();
    }

    get fun vaultState(): VaultState {
        return VaultState {
            owner: self.owner,
            jettonMaster: self.jettonMaster,
            vaultJettonWallet: self.vaultJettonWallet,
            paused: self.paused,
            activePriceUsd9: self.activePriceUsd9,
            activePriceUpdatedAt: self.activePriceUpdatedAt,
            pendingPriceUsd9: self.pendingPriceUsd9,
            pendingPriceValidAfter: self.pendingPriceValidAfter,
            totalDepositedRaw: self.totalDepositedRaw,
            totalActiveRaw: self.totalActiveRaw,
            totalWithdrawnRaw: self.totalWithdrawnRaw,
            depositCount: self.depositCount,
            withdrawCount: self.withdrawCount,
            userCount: self.userCount,
            lastDepositor: self.lastDepositor,
            lastSeasonId: self.lastSeasonId,
            lastWaveId: self.lastWaveId,
            lastAmountRaw: self.lastAmountRaw,
            lastTargetUsd9: self.lastTargetUsd9,
        };
    }

    get fun userState(user: Address): UserState {
        let active: Int = self.activeRaw(user);
        let target: Int = self.targetUsd9(user);
        return UserState {
            activeRaw: active,
            targetUsd9: target,
            seasonId: self.seasonId(user),
            waveId: self.waveId(user),
            goalReached: self.hasFreshPrice() && target > 0 && self.hasReachedGoal(active, target),
            pendingWithdrawal: self.hasPendingWithdrawal(user),
        };
    }

    get fun pendingWithdrawal(queryId: Int): PendingWithdrawalState {
        let owner: Address? = self.pendingOwnerByQuery.get(queryId);
        let amount: Int? = self.pendingAmountByQuery.get(queryId);
        return PendingWithdrawalState {
            owner: owner,
            amountRaw: amount == null ? 0 : amount!!,
        };
    }

    get fun supportedTarget(targetUsd9: Int): Bool {
        return self.isSupportedTarget(targetUsd9);
    }

    get fun derivedDepositKey(user: Address, queryId: Int): Int {
        return self.deriveDepositKey(user, queryId);
    }
}
