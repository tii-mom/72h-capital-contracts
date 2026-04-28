import "./TestJetton.tact";

// Minimal AlphaVault Tact path.
//
// Scope:
// - accepts 72H Jetton notifications from this vault's Jetton wallet
// - enforces Alpha app boundaries, 9 seats, and app-specific first allocation thresholds
// - tracks non-redeemable principal, top-ups, 72-week completion, and 7-week settlement metadata
// - keeps settlement/admin paths owner-only for testable governance wiring
//
// Not yet complete:
// - audited yield transfer/claim mechanics
// - full registry callback protocol
// - production replay/signature model

message(0x72030001) SettleAlphaCycle {
    seatNumber: Int as uint16;
    cycleNumber: Int as uint16;
    settledReward72H: Int as coins;
    metadataHash: Int as uint256;
}

message(0x72030002) ClaimAlphaReward {
    seatNumber: Int as uint16;
}

message(0x72030003) MarkAlphaCompleted {
    seatNumber: Int as uint16;
}

message(0x72030004) RedeemAlpha {
    seatNumber: Int as uint16;
    amount72H: Int as coins;
}

contract AlphaVault {
    owner: Address;
    treasury: Address;
    jettonMaster: Address;
    appId: Int as uint8;
    seatCap: Int as uint16;
    threshold72H: Int as coins;
    cycleDurationSeconds: Int as uint32;
    settlementIntervalSeconds: Int as uint32;
    nextSeatNumber: Int as uint16;
    totalPrincipal72H: Int as coins;
    seatByOwner: map<Address, Int as uint16>;
    ownerBySeat: map<Int as uint16, Address>;
    principalBySeat: map<Int as uint16, Int as coins>;
    assignedAtBySeat: map<Int as uint16, Int as uint32>;
    completionAtBySeat: map<Int as uint16, Int as uint32>;
    completedBySeat: map<Int as uint16, Int as uint8>;
    settledYieldBySeat: map<Int as uint16, Int as coins>;
    claimedYieldBySeat: map<Int as uint16, Int as coins>;
    lastSettledCycleBySeat: map<Int as uint16, Int as uint16>;
    settlementMetadataByCycle: map<Int as uint32, Int as uint256>;
    settlementStartsAtByCycle: map<Int as uint32, Int as uint32>;
    settlementEndsAtByCycle: map<Int as uint32, Int as uint32>;
    settlementYieldByCycle: map<Int as uint32, Int as coins>;

    init(owner: Address, treasury: Address, jettonMaster: Address, appId: Int) {
        require(appId >= 1 && appId <= 3, "unsupported app");

        self.owner = owner;
        self.treasury = treasury;
        self.jettonMaster = jettonMaster;
        self.appId = appId;
        self.seatCap = 9;
        if (appId == 3) {
            self.threshold72H = 720000 * 1000000000;
        } else {
            self.threshold72H = 72000 * 1000000000;
        }
        self.cycleDurationSeconds = 72 * 7 * 24 * 60 * 60;
        self.settlementIntervalSeconds = 7 * 7 * 24 * 60 * 60;
        self.nextSeatNumber = 1;
        self.totalPrincipal72H = 0;
    }

    receive() {}

    receive(msg: JettonTransferNotification) {
        require(sender() == self.getJettonWalletAddressInternal(), "invalid jetton wallet");
        require(msg.amount > 0, "deposit must be positive");

        let existingSeat = self.seatByOwner.get(msg.sender);
        if (existingSeat == null) {
            require(msg.amount >= self.threshold72H, "alpha threshold not met");
        }

        let seatNumber = self.getOrAssignSeat(msg.sender);
        require(!self.isCompleted(seatNumber), "alpha seat completed");

        let currentPrincipal = self.principalBySeat.get(seatNumber);
        if (currentPrincipal == null) {
            self.principalBySeat.set(seatNumber, msg.amount);
        } else {
            self.principalBySeat.set(seatNumber, currentPrincipal!! + msg.amount);
        }

        self.totalPrincipal72H += msg.amount;
    }

    receive(msg: SettleAlphaCycle) {
        self.requireOwnerOrTreasury();
        require(msg.settledReward72H > 0, "settlement must be positive");
        self.requireSeat(msg.seatNumber);
        require(!self.isCompleted(msg.seatNumber), "alpha seat completed");

        let expectedCycle = self.getLastSettledCycle(msg.seatNumber) + 1;
        require(msg.cycleNumber == expectedCycle, "unexpected cycle");

        let assignedAt = self.assignedAtBySeat.get(msg.seatNumber);
        require(assignedAt != null, "seat assignment missing");

        let startsAt = assignedAt!! + ((msg.cycleNumber - 1) * self.settlementIntervalSeconds);
        let endsAt = assignedAt!! + (msg.cycleNumber * self.settlementIntervalSeconds);
        require(now() >= endsAt, "settlement boundary not reached");
        require(endsAt <= self.getCompletionAt(msg.seatNumber), "settlement past completion");

        let key = self.cycleKey(msg.seatNumber, msg.cycleNumber);
        self.settlementMetadataByCycle.set(key, msg.metadataHash);
        self.settlementStartsAtByCycle.set(key, startsAt);
        self.settlementEndsAtByCycle.set(key, endsAt);
        self.settlementYieldByCycle.set(key, msg.settledReward72H);
        self.lastSettledCycleBySeat.set(msg.seatNumber, msg.cycleNumber);

        let currentSettled = self.settledYieldBySeat.get(msg.seatNumber);
        if (currentSettled == null) {
            self.settledYieldBySeat.set(msg.seatNumber, msg.settledReward72H);
        } else {
            self.settledYieldBySeat.set(msg.seatNumber, currentSettled!! + msg.settledReward72H);
        }
    }

    receive(msg: ClaimAlphaReward) {
        self.requireSeat(msg.seatNumber);

        let seatOwner = self.ownerBySeat.get(msg.seatNumber);
        require(seatOwner != null, "seat owner missing");
        require(sender() == seatOwner!!, "seat owner only");

        let claimable = self.getClaimableReward72H(msg.seatNumber);
        require(claimable > 0, "no claimable yield");

        let alreadyClaimed = self.claimedYieldBySeat.get(msg.seatNumber);
        if (alreadyClaimed == null) {
            self.claimedYieldBySeat.set(msg.seatNumber, claimable);
        } else {
            self.claimedYieldBySeat.set(msg.seatNumber, alreadyClaimed!! + claimable);
        }
    }

    receive(msg: MarkAlphaCompleted) {
        self.requireOwnerOrTreasury();
        self.requireSeat(msg.seatNumber);
        require(now() >= self.getCompletionAt(msg.seatNumber), "completion boundary not reached");
        self.completedBySeat.set(msg.seatNumber, 1);
    }

    receive(msg: RedeemAlpha) {
        require(msg.amount72H > 0, "redeem amount must be positive");
        self.requireSeat(msg.seatNumber);
        require(false, "alpha principal is non-redeemable");
    }

    fun getOrAssignSeat(holder: Address): Int {
        let existingSeat = self.seatByOwner.get(holder);
        if (existingSeat != null) {
            return existingSeat!!;
        }

        require(self.nextSeatNumber <= self.seatCap, "alpha capacity reached");
        let assigned = self.nextSeatNumber;
        self.seatByOwner.set(holder, assigned);
        self.ownerBySeat.set(assigned, holder);
        self.assignedAtBySeat.set(assigned, now());
        self.completionAtBySeat.set(assigned, now() + self.cycleDurationSeconds);
        self.nextSeatNumber = assigned + 1;
        return assigned;
    }

    fun requireOwnerOrTreasury() {
        require(sender() == self.owner || sender() == self.treasury, "admin only");
    }

    fun requireSeat(seatNumber: Int) {
        require(seatNumber > 0 && seatNumber < self.nextSeatNumber, "seat missing");
    }

    fun requireApp(appId: Int) {
        require(appId >= 1 && appId <= 3, "unsupported app");
    }

    fun thresholdForApp(appId: Int): Int {
        self.requireApp(appId);
        if (appId == 3) {
            return 720000 * 1000000000;
        }
        return 72000 * 1000000000;
    }

    fun cycleKey(seatNumber: Int, cycleNumber: Int): Int {
        return (seatNumber * 1000) + cycleNumber;
    }

    fun getJettonWalletAddressInternal(): Address {
        let walletState = initOf TestJetton72HWallet(self.jettonMaster, myAddress());
        return contractAddress(walletState);
    }

    get fun getOwner(): Address {
        return self.owner;
    }

    get fun getTreasury(): Address {
        return self.treasury;
    }

    get fun getJettonMaster(): Address {
        return self.jettonMaster;
    }

    get fun getJettonWalletAddress(): Address {
        return self.getJettonWalletAddressInternal();
    }

    get fun getAppId(): Int {
        return self.appId;
    }

    get fun getSeatCap(): Int {
        return self.seatCap;
    }

    get fun getThreshold72H(): Int {
        return self.threshold72H;
    }

    get fun getCycleDurationSeconds(): Int {
        return self.cycleDurationSeconds;
    }

    get fun getSettlementIntervalSeconds(): Int {
        return self.settlementIntervalSeconds;
    }

    get fun getNextSeatNumber(): Int {
        return self.nextSeatNumber;
    }

    get fun getTotalPrincipal72H(): Int {
        return self.totalPrincipal72H;
    }

    get fun getSeatByOwner(owner: Address): Int {
        let seatNumber = self.seatByOwner.get(owner);
        if (seatNumber == null) {
            return 0;
        }
        return seatNumber!!;
    }

    get fun getOwnerBySeat(seatNumber: Int): Address {
        let owner = self.ownerBySeat.get(seatNumber);
        require(owner != null, "seat owner missing");
        return owner!!;
    }

    get fun getPrincipalBySeat(seatNumber: Int): Int {
        let principal = self.principalBySeat.get(seatNumber);
        if (principal == null) {
            return 0;
        }
        return principal!!;
    }

    get fun getAssignedAt(seatNumber: Int): Int {
        let assignedAt = self.assignedAtBySeat.get(seatNumber);
        if (assignedAt == null) {
            return 0;
        }
        return assignedAt!!;
    }

    get fun getCompletionAt(seatNumber: Int): Int {
        let completionAt = self.completionAtBySeat.get(seatNumber);
        if (completionAt == null) {
            return 0;
        }
        return completionAt!!;
    }

    get fun isCompleted(seatNumber: Int): Bool {
        let completed = self.completedBySeat.get(seatNumber);
        return completed != null && completed!! == 1;
    }

    get fun getLastSettledCycle(seatNumber: Int): Int {
        let cycleNumber = self.lastSettledCycleBySeat.get(seatNumber);
        if (cycleNumber == null) {
            return 0;
        }
        return cycleNumber!!;
    }

    get fun getSettledYield72H(seatNumber: Int): Int {
        let settled = self.settledYieldBySeat.get(seatNumber);
        if (settled == null) {
            return 0;
        }
        return settled!!;
    }

    get fun getClaimedYield72H(seatNumber: Int): Int {
        let claimed = self.claimedYieldBySeat.get(seatNumber);
        if (claimed == null) {
            return 0;
        }
        return claimed!!;
    }

    get fun getClaimableReward72H(seatNumber: Int): Int {
        return self.getSettledYield72H(seatNumber) - self.getClaimedYield72H(seatNumber);
    }

    get fun getSettlementMetadataHash(seatNumber: Int, cycleNumber: Int): Int {
        let metadataHash = self.settlementMetadataByCycle.get(self.cycleKey(seatNumber, cycleNumber));
        if (metadataHash == null) {
            return 0;
        }
        return metadataHash!!;
    }

    get fun getSettlementStartsAt(seatNumber: Int, cycleNumber: Int): Int {
        let startsAt = self.settlementStartsAtByCycle.get(self.cycleKey(seatNumber, cycleNumber));
        if (startsAt == null) {
            return 0;
        }
        return startsAt!!;
    }

    get fun getSettlementEndsAt(seatNumber: Int, cycleNumber: Int): Int {
        let endsAt = self.settlementEndsAtByCycle.get(self.cycleKey(seatNumber, cycleNumber));
        if (endsAt == null) {
            return 0;
        }
        return endsAt!!;
    }

    get fun getSettlementYield72H(seatNumber: Int, cycleNumber: Int): Int {
        let settled = self.settlementYieldByCycle.get(self.cycleKey(seatNumber, cycleNumber));
        if (settled == null) {
            return 0;
        }
        return settled!!;
    }
}
