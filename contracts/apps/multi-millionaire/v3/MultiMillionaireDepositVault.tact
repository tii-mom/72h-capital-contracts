import "../../../supporting/TestJetton.tact";

// Multi-millionaire target deposit vault.
//
// Scope:
// - accepts 72H Jetton transfer notifications from this vault's Jetton wallet
// - records per-user target deposit state for backend receipt verification
// - exposes getters used by multi-millionaire receipt verifier:
//   supportedTarget(targetUsd9), derivedDepositKey(user, queryId), userState(user)
//
// Not in scope:
// - reward distribution
// - user withdrawals
// - production activation without separate testnet evidence, owner approval, and audit review

message(0x720d0001) SetDepositVaultJettonWallet {
    wallet: Address;
}

struct VaultState {
    owner: Address;
    jettonMaster: Address;
    vaultJettonWallet: Address;
    paused: Bool;
    totalDepositedRaw: Int as coins;
    depositCount: Int as uint64;
    lastDepositor: Address;
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

contract MultiMillionaireDepositVault {
    owner: Address;
    jettonMaster: Address;
    vaultJettonWallet: Address;
    paused: Bool;
    totalDepositedRaw: Int as coins;
    depositCount: Int as uint64;
    lastDepositor: Address;
    lastSeasonId: Int as uint8;
    lastWaveId: Int as uint32;
    lastAmountRaw: Int as coins;
    lastTargetUsd9: Int as uint128;
    activeRawByUser: map<Address, Int as coins>;
    targetUsd9ByUser: map<Address, Int as uint128>;
    seasonIdByUser: map<Address, Int as uint8>;
    waveIdByUser: map<Address, Int as uint32>;
    goalReachedByUser: map<Address, Bool>;
    depositQuerySeen: map<Int as uint256, Bool>;

    init(owner: Address, jettonMaster: Address, vaultJettonWallet: Address) {
        self.owner = owner;
        self.jettonMaster = jettonMaster;
        self.vaultJettonWallet = vaultJettonWallet;
        self.paused = false;
        self.totalDepositedRaw = 0;
        self.depositCount = 0;
        self.lastDepositor = owner;
        self.lastSeasonId = 0;
        self.lastWaveId = 0;
        self.lastAmountRaw = 0;
        self.lastTargetUsd9 = 0;
    }

    receive() {}

    receive(msg: SetDepositVaultJettonWallet) {
        self.requireOwner();
        self.vaultJettonWallet = msg.wallet;
    }

    receive(msg: JettonTransferNotification) {
        require(!self.paused, "vault paused");
        require(sender() == self.vaultJettonWallet, "invalid jetton wallet");
        require(msg.amount > 0, "deposit must be positive");

        let payload = msg.forwardPayload;
        let forwardPayloadInRef = payload.loadBit();
        require(!forwardPayloadInRef, "ref payload unsupported");
        let seasonId = payload.loadUint(8);
        let waveId = payload.loadUint(32);
        let targetUsd9 = payload.loadUint(128);
        require(self.supportedTargetInternal(targetUsd9), "unsupported target");

        let depositKey = self.derivedDepositKeyInternal(msg.sender, msg.queryId);
        require(!self.depositQuerySeen.exists(depositKey), "deposit replay");
        self.depositQuerySeen.set(depositKey, true);

        let currentRaw = self.activeRawByUser.get(msg.sender);
        let nextRaw = currentRaw == null ? msg.amount : currentRaw!! + msg.amount;
        self.activeRawByUser.set(msg.sender, nextRaw);

        let currentTarget = self.targetUsd9ByUser.get(msg.sender);
        if (currentTarget == null || currentTarget!! == 0) {
            self.targetUsd9ByUser.set(msg.sender, targetUsd9);
        } else {
            require(currentTarget!! == targetUsd9, "target mismatch");
        }
        self.seasonIdByUser.set(msg.sender, seasonId);
        self.waveIdByUser.set(msg.sender, waveId);
        self.goalReachedByUser.set(msg.sender, false);

        self.totalDepositedRaw += msg.amount;
        self.depositCount += 1;
        self.lastDepositor = msg.sender;
        self.lastSeasonId = seasonId;
        self.lastWaveId = waveId;
        self.lastAmountRaw = msg.amount;
        self.lastTargetUsd9 = targetUsd9;
    }

    fun requireOwner() {
        require(sender() == self.owner, "owner only");
    }

    fun supportedTargetInternal(targetUsd9: Int): Bool {
        return targetUsd9 == 10000 * 1000000000 ||
            targetUsd9 == 100000 * 1000000000 ||
            targetUsd9 == 500000 * 1000000000 ||
            targetUsd9 == 1000000 * 1000000000 ||
            targetUsd9 == 5000000 * 1000000000 ||
            targetUsd9 == 10000000 * 1000000000;
    }

    fun derivedDepositKeyInternal(user: Address, queryId: Int): Int {
        return beginCell()
            .storeAddress(user)
            .storeUint(queryId, 64)
            .endCell()
            .hash();
    }

    get fun vaultState(): VaultState {
        return VaultState {
            owner: self.owner,
            jettonMaster: self.jettonMaster,
            vaultJettonWallet: self.vaultJettonWallet,
            paused: self.paused,
            totalDepositedRaw: self.totalDepositedRaw,
            depositCount: self.depositCount,
            lastDepositor: self.lastDepositor,
            lastSeasonId: self.lastSeasonId,
            lastWaveId: self.lastWaveId,
            lastAmountRaw: self.lastAmountRaw,
            lastTargetUsd9: self.lastTargetUsd9,
        };
    }

    get fun userState(user: Address): UserState {
        let activeRaw = self.activeRawByUser.get(user);
        let targetUsd9 = self.targetUsd9ByUser.get(user);
        let seasonId = self.seasonIdByUser.get(user);
        let waveId = self.waveIdByUser.get(user);
        let goalReached = self.goalReachedByUser.get(user);
        return UserState {
            activeRaw: activeRaw == null ? 0 : activeRaw!!,
            targetUsd9: targetUsd9 == null ? 0 : targetUsd9!!,
            seasonId: seasonId == null ? 0 : seasonId!!,
            waveId: waveId == null ? 0 : waveId!!,
            goalReached: goalReached == null ? false : goalReached!!,
            pendingWithdrawal: false,
        };
    }

    get fun supportedTarget(targetUsd9: Int): Bool {
        return self.supportedTargetInternal(targetUsd9);
    }

    get fun derivedDepositKey(user: Address, queryId: Int): Int {
        return self.derivedDepositKeyInternal(user, queryId);
    }

    get fun owner(): Address {
        return self.owner;
    }
}
