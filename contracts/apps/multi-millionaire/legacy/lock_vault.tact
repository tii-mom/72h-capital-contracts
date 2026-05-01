import "@stdlib/ownable";

const DEFAULT_LOCK_SECONDS: Int = 31536000;
const DEFAULT_TARGET_USD_E6: Int = 1000000000000;
const DEFAULT_TOKEN_SCALE: Int = 1000000000;
const JETTON_TRANSFER_TON_FEE: Int = 50000000;
const PRICE_UPDATE_DELAY_SECONDS: Int = 3600;
const PRICE_FRESHNESS_SECONDS: Int = 86400;
const MAX_PRICE_CHANGE_BPS: Int = 2000;
const BPS_SCALE: Int = 10000;
const POSITION_ACTIVE: Int = 0;
const POSITION_WITHDRAWING: Int = 1;
const POSITION_WITHDRAWN: Int = 2;

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

message(0x53505243) StagePrice {
    queryId: Int as uint64;
    priceUsdE6: Int as uint64;
}

message(0x41505243) ApplyPrice {
    queryId: Int as uint64;
}

message(0x4a57544c) SetVaultJettonWallet {
    queryId: Int as uint64;
    vaultJettonWallet: Address;
}

message(0x57495448) WithdrawPosition {
    queryId: Int as uint64;
    positionId: Int as uint256;
}

struct DepositPayload {
    waveId: Int as uint32;
}

struct Position {
    owner: Address;
    amountRaw: Int as coins;
    waveId: Int as uint32;
    createdAt: Int as uint64;
    status: Int as uint8;
}

contract LockVault with Ownable {
    owner: Address;
    tokenAddress: Address;
    vaultJettonWallet: Address?;
    paused: Bool;
    activePriceUsdE6: Int as uint64;
    activePriceUpdatedAt: Int as uint64;
    pendingPriceUsdE6: Int as uint64;
    pendingPriceValidAfter: Int as uint64;
    lockSeconds: Int as uint64;
    tokenScale: Int as uint64;
    defaultTargetUsdE6: Int as uint64;
    totalDepositedRaw: Int as coins;
    totalWithdrawnRaw: Int as coins;
    totalActiveRaw: Int as coins;
    depositCount: Int as uint64;
    withdrawCount: Int as uint64;
    positions: map<Int as uint256, Position>;
    pendingWithdrawals: map<Int as uint64, Int as uint256>;
    activeRawByUser: map<Address, Int>;
    goalReachedByUser: map<Address, Bool>;
    lastDepositor: Address?;
    lastWaveId: Int as uint32;
    lastAmountRaw: Int as coins;
    lastPositionId: Int as uint256;

    init(owner: Address, tokenAddress: Address) {
        self.owner = owner;
        self.tokenAddress = tokenAddress;
        self.vaultJettonWallet = null;
        self.paused = false;
        self.activePriceUsdE6 = 0;
        self.activePriceUpdatedAt = 0;
        self.pendingPriceUsdE6 = 0;
        self.pendingPriceValidAfter = 0;
        self.lockSeconds = DEFAULT_LOCK_SECONDS;
        self.tokenScale = DEFAULT_TOKEN_SCALE;
        self.defaultTargetUsdE6 = DEFAULT_TARGET_USD_E6;
        self.totalDepositedRaw = 0;
        self.totalWithdrawnRaw = 0;
        self.totalActiveRaw = 0;
        self.depositCount = 0;
        self.withdrawCount = 0;
        self.positions = emptyMap();
        self.pendingWithdrawals = emptyMap();
        self.activeRawByUser = emptyMap();
        self.goalReachedByUser = emptyMap();
        self.lastDepositor = null;
        self.lastWaveId = 0;
        self.lastAmountRaw = 0;
        self.lastPositionId = 0;
    }

    receive() {}

    receive(msg: SetPaused) {
        self.requireOwner();
        self.paused = msg.paused;
    }

    receive(msg: StagePrice) {
        self.requireOwner();
        throwUnless(1050, msg.priceUsdE6 > 0);
        self.pendingPriceUsdE6 = msg.priceUsdE6;
        self.pendingPriceValidAfter = now() + PRICE_UPDATE_DELAY_SECONDS;
    }

    receive(msg: ApplyPrice) {
        self.requireOwner();
        throwUnless(1051, self.pendingPriceUsdE6 > 0);
        throwUnless(1052, now() >= self.pendingPriceValidAfter);

        if (self.activePriceUsdE6 > 0) {
            let minPrice: Int = self.activePriceUsdE6 * (BPS_SCALE - MAX_PRICE_CHANGE_BPS) / BPS_SCALE;
            let maxPrice: Int = self.activePriceUsdE6 * (BPS_SCALE + MAX_PRICE_CHANGE_BPS) / BPS_SCALE;
            throwUnless(1053, self.pendingPriceUsdE6 >= minPrice && self.pendingPriceUsdE6 <= maxPrice);
        }

        self.activePriceUsdE6 = self.pendingPriceUsdE6;
        self.activePriceUpdatedAt = now();
        self.pendingPriceUsdE6 = 0;
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
        throwUnless(1008, !self.isGoalLatched(msg.sender));

        let payload: DepositPayload = self.parseDepositPayload(msg.forwardPayload);
        let positionId: Int = self.derivePositionId(msg.sender, msg.queryId);
        throwUnless(1006, !self.positions.exists(positionId));

        let createdAt: Int = now();
        self.positions.set(positionId, Position {
            owner: msg.sender,
            amountRaw: msg.amount,
            waveId: payload.waveId,
            createdAt: createdAt,
            status: POSITION_ACTIVE,
        });

        self.totalDepositedRaw += msg.amount;
        self.totalActiveRaw += msg.amount;
        self.depositCount += 1;

        let previousActive: Int = self.activeRaw(msg.sender);
        let nextActive: Int = previousActive + msg.amount;
        self.activeRawByUser.set(msg.sender, nextActive);
        self.refreshGoalReached(msg.sender, nextActive);

        self.lastDepositor = msg.sender;
        self.lastWaveId = payload.waveId;
        self.lastAmountRaw = msg.amount;
        self.lastPositionId = positionId;
    }

    receive(msg: WithdrawPosition) {
        let existing: Position? = self.positions.get(msg.positionId);
        throwUnless(1020, existing != null);

        let position: Position = existing!!;
        throwUnless(1021, position.owner == sender());
        throwUnless(1022, position.status == POSITION_ACTIVE);

        let activeRaw: Int = self.activeRaw(position.owner);
        let goalReached: Bool = self.hasReachedGoal(position.owner, activeRaw);
        if (goalReached) {
            self.goalReachedByUser.set(position.owner, true);
        }
        throwUnless(1023, goalReached || now() >= position.createdAt + self.lockSeconds);

        self.positions.set(msg.positionId, Position {
            owner: position.owner,
            amountRaw: position.amountRaw,
            waveId: position.waveId,
            createdAt: position.createdAt,
            status: POSITION_WITHDRAWING,
        });

        self.totalActiveRaw -= position.amountRaw;
        let nextActiveRaw: Int = activeRaw - position.amountRaw;
        self.activeRawByUser.set(position.owner, nextActiveRaw);
        if (nextActiveRaw == 0) {
            self.goalReachedByUser.set(position.owner, false);
        }
        self.pendingWithdrawals.set(msg.queryId, msg.positionId);

        let jettonWallet: Address? = self.vaultJettonWallet;
        throwUnless(1024, jettonWallet != null);

        send(SendParameters {
            to: jettonWallet!!,
            value: JETTON_TRANSFER_TON_FEE,
            bounce: true,
            body: JettonTransfer {
                queryId: msg.queryId,
                amount: position.amountRaw,
                destination: position.owner,
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: 1,
                forwardPayload: emptySlice(),
            }.toCell(),
        });

        self.positions.set(msg.positionId, Position {
            owner: position.owner,
            amountRaw: position.amountRaw,
            waveId: position.waveId,
            createdAt: position.createdAt,
            status: POSITION_WITHDRAWN,
        });
        self.totalWithdrawnRaw += position.amountRaw;
        self.withdrawCount += 1;
    }

    receive(msg: JettonExcesses) {
        throwUnless(1025, self.vaultJettonWallet != null && sender() == self.vaultJettonWallet!!);
        self.pendingWithdrawals.del(msg.queryId);
    }

    bounced(msg: bounced<JettonTransfer>) {
        let pendingPositionId: Int? = self.pendingWithdrawals.get(msg.queryId);
        if (pendingPositionId == null) {
            return;
        }

        let existing: Position? = self.positions.get(pendingPositionId!!);
        if (existing == null) {
            self.pendingWithdrawals.del(msg.queryId);
            return;
        }

        let position: Position = existing!!;
        if (position.status != POSITION_WITHDRAWING && position.status != POSITION_WITHDRAWN) {
            self.pendingWithdrawals.del(msg.queryId);
            return;
        }

        if (position.status == POSITION_WITHDRAWN) {
            self.totalWithdrawnRaw -= position.amountRaw;
            self.withdrawCount -= 1;
        }

        self.positions.set(pendingPositionId!!, Position {
            owner: position.owner,
            amountRaw: position.amountRaw,
            waveId: position.waveId,
            createdAt: position.createdAt,
            status: POSITION_ACTIVE,
        });
        self.totalActiveRaw += position.amountRaw;
        let activeRaw: Int = self.activeRaw(position.owner) + position.amountRaw;
        self.activeRawByUser.set(position.owner, activeRaw);
        self.pendingWithdrawals.del(msg.queryId);
    }

    fun parseDepositPayload(forwardPayload: Slice): DepositPayload {
        let payload: Slice = forwardPayload;
        throwUnless(1030, payload.bits() >= 1);

        let payloadInRef: Bool = payload.loadBool();
        if (payloadInRef) {
            throwUnless(1031, !payload.refsEmpty());
            payload = payload.loadRef().beginParse();
        }

        throwUnless(1032, payload.bits() >= 32);
        return DepositPayload {
            waveId: payload.loadUint(32),
        };
    }

    fun derivePositionId(user: Address, queryId: Int): Int {
        return beginCell()
            .storeAddress(user)
            .storeUint(queryId, 64)
            .endCell()
            .hash();
    }

    fun activeRaw(user: Address): Int {
        let active: Int? = self.activeRawByUser.get(user);
        if (active == null) {
            return 0;
        }
        return active!!;
    }

    fun hasFreshPrice(): Bool {
        return self.activePriceUsdE6 > 0 && self.activePriceUpdatedAt > 0 && now() <= self.activePriceUpdatedAt + PRICE_FRESHNESS_SECONDS;
    }

    fun hasReachedGoal(user: Address, activeRaw: Int): Bool {
        if (!self.hasFreshPrice()) {
            return false;
        }
        return activeRaw * self.activePriceUsdE6 >= self.defaultTargetUsdE6 * self.tokenScale;
    }

    fun isGoalLatched(user: Address): Bool {
        let latched: Bool? = self.goalReachedByUser.get(user);
        return latched != null && latched!!;
    }

    fun refreshGoalReached(user: Address, activeRaw: Int) {
        if (self.hasReachedGoal(user, activeRaw)) {
            self.goalReachedByUser.set(user, true);
        }
    }

    get fun vaultState(): VaultState {
        return VaultState {
            owner: self.owner,
            tokenAddress: self.tokenAddress,
            vaultJettonWallet: self.vaultJettonWallet,
            paused: self.paused,
            activePriceUsdE6: self.activePriceUsdE6,
            activePriceUpdatedAt: self.activePriceUpdatedAt,
            pendingPriceUsdE6: self.pendingPriceUsdE6,
            pendingPriceValidAfter: self.pendingPriceValidAfter,
            lockSeconds: self.lockSeconds,
            tokenScale: self.tokenScale,
            defaultTargetUsdE6: self.defaultTargetUsdE6,
            totalDepositedRaw: self.totalDepositedRaw,
            totalWithdrawnRaw: self.totalWithdrawnRaw,
            totalActiveRaw: self.totalActiveRaw,
            depositCount: self.depositCount,
            withdrawCount: self.withdrawCount,
            lastDepositor: self.lastDepositor,
            lastWaveId: self.lastWaveId,
            lastAmountRaw: self.lastAmountRaw,
            lastPositionId: self.lastPositionId,
        };
    }

    get fun position(positionId: Int): Position {
        let existing: Position? = self.positions.get(positionId);
        throwUnless(1040, existing != null);
        return existing!!;
    }

    get fun userState(user: Address): UserState {
        let active: Int = self.activeRaw(user);
        return UserState {
            activeRaw: active,
            targetUsdE6: self.defaultTargetUsdE6,
            goalReached: self.hasReachedGoal(user, active),
        };
    }

    get fun derivedPositionId(user: Address, queryId: Int): Int {
        return self.derivePositionId(user, queryId);
    }
}

struct VaultState {
    owner: Address;
    tokenAddress: Address;
    vaultJettonWallet: Address?;
    paused: Bool;
    activePriceUsdE6: Int as uint64;
    activePriceUpdatedAt: Int as uint64;
    pendingPriceUsdE6: Int as uint64;
    pendingPriceValidAfter: Int as uint64;
    lockSeconds: Int as uint64;
    tokenScale: Int as uint64;
    defaultTargetUsdE6: Int as uint64;
    totalDepositedRaw: Int as coins;
    totalWithdrawnRaw: Int as coins;
    totalActiveRaw: Int as coins;
    depositCount: Int as uint64;
    withdrawCount: Int as uint64;
    lastDepositor: Address?;
    lastWaveId: Int as uint32;
    lastAmountRaw: Int as coins;
    lastPositionId: Int as uint256;
}

struct UserState {
    activeRaw: Int as coins;
    targetUsdE6: Int as uint64;
    goalReached: Bool;
}
