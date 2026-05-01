import "./TestJetton.tact";

// AppRewardPool minimal Tact path.
//
// Scope:
// - per-application 72H reward custody, separate from Reserve/Alpha principal
// - accepts reward funding through this pool's standard Jetton wallet notification
// - records weighted reward claims with Reserve weight 1 and Alpha weight 10
//
// Not yet complete:
// - production event schema

message(0x72050001) ClaimReward {
    seatType: Int as uint8;
    seatNumber: Int as uint16;
}

message(0x72050002) RegisterRewardSeat {
    seatType: Int as uint8;
    seatNumber: Int as uint16;
    owner: Address;
}

message(0x72050003) FinalizeRewardClaim {
    queryId: Int as uint64;
}

message(0x72050004) SetPoolJettonWallet {
    wallet: Address;
}

contract AppRewardPool {
    owner: Address;
    registry: Address;
    jettonMaster: Address;
    poolJettonWallet: Address;
    appId: Int as uint8;
    reserveClaimIntervalSeconds: Int as uint32;
    alphaClaimIntervalSeconds: Int as uint32;
    availableRewards72H: Int as coins;
    totalFunded72H: Int as coins;
    totalClaimed72H: Int as coins;
    totalRewardWeight: Int as uint32;
    cumulativeRewardPerWeightScaled: Int as uint128;
    lastClaimAtBySeat: map<Int as uint32, Int as uint32>;
    claimedBySeat: map<Int as uint32, Int as coins>;
    rewardDebtScaledBySeat: map<Int as uint32, Int as uint128>;
    ownerBySeat: map<Int as uint32, Address>;
    pendingClaimSeatByQuery: map<Int as uint64, Int as uint32>;
    pendingClaimAmountByQuery: map<Int as uint64, Int as coins>;
    pendingClaimOwnerByQuery: map<Int as uint64, Address>;
    pendingClaimQueryBySeat: map<Int as uint32, Int as uint64>;

    init(owner: Address, registry: Address, jettonMaster: Address, poolJettonWallet: Address, appId: Int) {
        require(appId >= 1 && appId <= 3, "unsupported app");
        self.owner = owner;
        self.registry = registry;
        self.jettonMaster = jettonMaster;
        self.poolJettonWallet = poolJettonWallet;
        self.appId = appId;
        self.reserveClaimIntervalSeconds = 7 * 24 * 60 * 60;
        self.alphaClaimIntervalSeconds = 7 * 7 * 24 * 60 * 60;
        self.availableRewards72H = 0;
        self.totalFunded72H = 0;
        self.totalClaimed72H = 0;
        self.totalRewardWeight = 0;
        self.cumulativeRewardPerWeightScaled = 0;
    }

    receive() {}

    receive(msg: SetPoolJettonWallet) {
        self.requireOwner();
        self.poolJettonWallet = msg.wallet;
    }

    receive(msg: JettonTransferNotification) {
        require(sender() == self.poolJettonWallet, "invalid jetton wallet");
        require(msg.amount > 0, "reward funding must be positive");
        require(self.totalRewardWeight > 0, "no eligible reward weight");
        self.cumulativeRewardPerWeightScaled += (msg.amount * 1000000000) / self.totalRewardWeight;
        self.availableRewards72H += msg.amount;
        self.totalFunded72H += msg.amount;
    }

    receive(msg: RegisterRewardSeat) {
        require(sender() == self.registry || sender() == self.owner, "registry only");
        require(msg.seatType == 1, "alpha rewards closed for v1");
        require(msg.seatNumber > 0, "seat missing");

        let key = self.seatKey(msg.seatType, msg.seatNumber);
        if (!self.ownerBySeat.exists(key)) {
            self.totalRewardWeight += self.expectedWeight(msg.seatType);
        }
        self.ownerBySeat.set(key, msg.owner);
        self.rewardDebtScaledBySeat.set(key, self.cumulativeRewardPerWeightScaled * self.expectedWeight(msg.seatType));
    }

    receive(msg: ClaimReward) {
        require(msg.seatType == 1, "alpha rewards closed for v1");
        require(msg.seatNumber > 0, "seat missing");

        let key = self.seatKey(msg.seatType, msg.seatNumber);
        let seatOwner = self.ownerBySeat.get(key);
        require(seatOwner != null, "seat owner missing");
        require(sender() == seatOwner!!, "seat owner only");
        require(!self.pendingClaimQueryBySeat.exists(key), "reward claim pending");

        let lastClaimAt = self.lastClaimAtBySeat.get(key);
        if (lastClaimAt != null) {
            require(now() - lastClaimAt!! >= self.reserveClaimIntervalSeconds, "reward claim interval");
        }

        let entitledScaled = self.cumulativeRewardPerWeightScaled * self.expectedWeight(msg.seatType);
        let debtScaled = self.rewardDebtScaledBySeat.get(key);
        let currentDebtScaled = debtScaled == null ? 0 : debtScaled!!;
        require(entitledScaled > currentDebtScaled, "no rewards available");
        let claimAmount = (entitledScaled - currentDebtScaled) / 1000000000;
        require(claimAmount > 0, "claim amount too small");
        require(claimAmount <= self.availableRewards72H, "reward pool underflow");

        let queryId = self.claimQueryId(key);
        self.pendingClaimSeatByQuery.set(queryId, key);
        self.pendingClaimAmountByQuery.set(queryId, claimAmount);
        self.pendingClaimOwnerByQuery.set(queryId, sender());
        self.pendingClaimQueryBySeat.set(key, queryId);

        send(SendParameters {
            to: self.poolJettonWallet,
            value: ton("0.06"),
            bounce: true,
            body: JettonTransfer {
                queryId: queryId,
                amount: claimAmount,
                destination: sender(),
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: 0,
                forwardPayload: emptyJettonForwardPayload(),
            }.toCell(),
        });
    }

    receive(msg: JettonExcesses) {
        require(sender() == self.poolJettonWallet, "invalid finalize sender");
        self.finalizePendingClaim(msg.queryId);
    }

    receive(msg: FinalizeRewardClaim) {
        require(sender() == self.poolJettonWallet, "invalid finalize sender");
        self.finalizePendingClaim(msg.queryId);
    }

    bounced(msg: bounced<JettonTransfer>) {
        require(sender() == self.poolJettonWallet, "invalid bounced sender");
        let key = self.pendingClaimSeatByQuery.get(msg.queryId);
        if (key != null) {
            let amount = self.pendingClaimAmountByQuery.get(msg.queryId);
            require(amount != null, "pending amount missing");
            require(amount!! == msg.amount, "invalid bounced amount");
            self.clearPendingClaim(msg.queryId, key!!);
        }
    }

    fun finalizePendingClaim(queryId: Int) {
        let key = self.pendingClaimSeatByQuery.get(queryId);
        require(key != null, "pending claim missing");
        let claimAmount = self.pendingClaimAmountByQuery.get(queryId);
        require(claimAmount != null, "pending amount missing");
        require(claimAmount!! <= self.availableRewards72H, "reward pool underflow");

        self.availableRewards72H -= claimAmount!!;
        self.totalClaimed72H += claimAmount!!;
        self.lastClaimAtBySeat.set(key!!, now());
        self.rewardDebtScaledBySeat.set(key!!, self.cumulativeRewardPerWeightScaled * self.expectedWeightForKey(key!!));

        let claimed = self.claimedBySeat.get(key!!);
        if (claimed == null) {
            self.claimedBySeat.set(key!!, claimAmount!!);
        } else {
            self.claimedBySeat.set(key!!, claimed!! + claimAmount!!);
        }

        self.clearPendingClaim(queryId, key!!);
    }

    fun clearPendingClaim(queryId: Int, key: Int) {
        self.pendingClaimSeatByQuery.del(queryId);
        self.pendingClaimAmountByQuery.del(queryId);
        self.pendingClaimOwnerByQuery.del(queryId);
        self.pendingClaimQueryBySeat.del(key);
    }

    fun expectedWeight(seatType: Int): Int {
        if (seatType == 2) {
            return 10;
        }
        return 1;
    }

    fun seatKey(seatType: Int, seatNumber: Int): Int {
        return (seatType * 1000) + seatNumber;
    }

    fun expectedWeightForKey(key: Int): Int {
        if (key >= 2000) {
            return 10;
        }
        return 1;
    }

    fun claimQueryId(key: Int): Int {
        return (self.appId * 1000000000) + key;
    }

    fun requireOwner() {
        require(sender() == self.owner, "owner only");
    }

    fun getJettonWalletAddressInternal(): Address {
        return self.poolJettonWallet;
    }

    get fun getOwner(): Address {
        return self.owner;
    }

    get fun getJettonMaster(): Address {
        return self.jettonMaster;
    }

    get fun getJettonWalletAddress(): Address {
        return self.poolJettonWallet;
    }

    get fun getAppId(): Int {
        return self.appId;
    }

    get fun getAvailableRewards72H(): Int {
        return self.availableRewards72H;
    }

    get fun getTotalFunded72H(): Int {
        return self.totalFunded72H;
    }

    get fun getTotalClaimed72H(): Int {
        return self.totalClaimed72H;
    }

    get fun getCumulativeRewardPerWeightScaled(): Int {
        return self.cumulativeRewardPerWeightScaled;
    }

    get fun getTotalRewardWeight(): Int {
        return self.totalRewardWeight;
    }

    get fun getSeatOwner(seatType: Int, seatNumber: Int): Address {
        let owner = self.ownerBySeat.get(self.seatKey(seatType, seatNumber));
        require(owner != null, "seat owner missing");
        return owner!!;
    }

    get fun getPendingClaimQuery(seatType: Int, seatNumber: Int): Int {
        let queryId = self.pendingClaimQueryBySeat.get(self.seatKey(seatType, seatNumber));
        return queryId == null ? 0 : queryId!!;
    }
}
