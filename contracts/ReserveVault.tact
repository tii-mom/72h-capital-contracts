import "./TestJetton.tact";

// ReserveVault minimal Tact implementation for Jetton-notification-based deposits.
//
// Scope:
// - deployable/testable shell for Reserve testnet progression
// - accepts deposits only through the vault's standard Jetton wallet notification
// - enforces app-scoped 720 72H minimum for first allocation
// - records lot-level lock metadata for each top-up
// - keeps user principal in this vault until mature-lot redemption
//
// Not yet complete:
// - full event emission model

message(0x72010003) AssignReserveSeat {
    appId: Int as uint8;
    owner: Address;
}

message(0x72020003) RecordPrincipalRedeem {
    lotId: Int as uint32;
    amount72H: Int as coins;
}

message(0x72020004) FinalizePrincipalRedeem {
    queryId: Int as uint64;
}

message(0x72020005) SetVaultJettonWallet {
    wallet: Address;
}

contract ReserveVault {
    owner: Address;
    registry: Address;
    jettonMaster: Address;
    vaultJettonWallet: Address;
    appId: Int as uint8;
    minimumAllocation72H: Int as coins;
    lockDurationSeconds: Int as uint32;
    rewardClaimIntervalSeconds: Int as uint32;
    nextSeatNumber: Int as uint16;
    nextLotId: Int as uint32;
    totalPrincipal72H: Int as coins;
    seatByOwner: map<Address, Int as uint16>;
    ownerBySeat: map<Int as uint16, Address>;
    principalBySeat: map<Int as uint16, Int as coins>;
    lotOwnerById: map<Int as uint32, Address>;
    lotSeatById: map<Int as uint32, Int as uint16>;
    lotAmountById: map<Int as uint32, Int as coins>;
    lotUnlockAtById: map<Int as uint32, Int as uint32>;
    lotRedeemedById: map<Int as uint32, Int as coins>;
    pendingRedeemLotByQuery: map<Int as uint64, Int as uint32>;
    pendingRedeemAmountByQuery: map<Int as uint64, Int as coins>;
    pendingRedeemSeatByQuery: map<Int as uint64, Int as uint16>;
    pendingRedeemOwnerByQuery: map<Int as uint64, Address>;
    pendingRedeemQueryByLot: map<Int as uint32, Int as uint64>;

    init(owner: Address, registry: Address, jettonMaster: Address, vaultJettonWallet: Address, appId: Int) {
        self.owner = owner;
        self.registry = registry;
        self.jettonMaster = jettonMaster;
        self.vaultJettonWallet = vaultJettonWallet;
        self.appId = appId;
        self.minimumAllocation72H = 720 * 1000000000;
        self.lockDurationSeconds = 72 * 24 * 60 * 60;
        self.rewardClaimIntervalSeconds = 7 * 24 * 60 * 60;
        self.nextSeatNumber = 1;
        self.nextLotId = 1;
        self.totalPrincipal72H = 0;
    }

    receive() {}

    receive(msg: SetVaultJettonWallet) {
        self.requireOwner();
        self.vaultJettonWallet = msg.wallet;
    }

    receive(msg: JettonTransferNotification) {
        require(sender() == self.vaultJettonWallet, "invalid jetton wallet");
        require(msg.amount > 0, "deposit must be positive");

        let existingSeat = self.seatByOwner.get(msg.sender);
        if (existingSeat == null) {
            require(msg.amount >= self.minimumAllocation72H, "reserve minimum not met");
        }

        let seatNumber = self.getOrAssignSeat(msg.sender);
        self.addLot(msg.sender, seatNumber, msg.amount);
    }

    receive(msg: RecordPrincipalRedeem) {
        require(msg.amount72H > 0, "redeem amount must be positive");

        let lotOwner = self.lotOwnerById.get(msg.lotId);
        require(lotOwner != null, "lot missing");
        require(lotOwner!! == sender(), "lot owner only");

        let lotSeat = self.lotSeatById.get(msg.lotId);
        require(lotSeat != null, "lot seat missing");

        let unlockAt = self.lotUnlockAtById.get(msg.lotId);
        require(unlockAt != null, "lot lock missing");
        require(now() >= unlockAt!!, "reserve lot still locked");

        let lotAmount = self.lotAmountById.get(msg.lotId);
        require(lotAmount != null, "lot amount missing");

        let redeemedByLot = self.lotRedeemedById.get(msg.lotId);
        let currentRedeemedByLot = redeemedByLot == null ? 0 : redeemedByLot!!;
        require(currentRedeemedByLot + msg.amount72H <= lotAmount!!, "redeem exceeds lot");

        require(!self.pendingRedeemQueryByLot.exists(msg.lotId), "redeem already pending");

        let queryId = self.redeemQueryId(msg.lotId);
        self.pendingRedeemLotByQuery.set(queryId, msg.lotId);
        self.pendingRedeemAmountByQuery.set(queryId, msg.amount72H);
        self.pendingRedeemSeatByQuery.set(queryId, lotSeat!!);
        self.pendingRedeemOwnerByQuery.set(queryId, lotOwner!!);
        self.pendingRedeemQueryByLot.set(msg.lotId, queryId);

        send(SendParameters {
            to: self.vaultJettonWallet,
            value: ton("0.06"),
            bounce: true,
            body: JettonTransfer {
                queryId: queryId,
                amount: msg.amount72H,
                destination: lotOwner!!,
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: 0,
                forwardPayload: emptyJettonForwardPayload(),
            }.toCell(),
        });
    }

    receive(msg: JettonExcesses) {
        require(sender() == self.vaultJettonWallet, "invalid finalize sender");
        self.finalizePendingRedeem(msg.queryId);
    }

    receive(msg: FinalizePrincipalRedeem) {
        require(sender() == self.vaultJettonWallet, "invalid finalize sender");
        self.finalizePendingRedeem(msg.queryId);
    }

    bounced(msg: bounced<JettonTransfer>) {
        require(sender() == self.vaultJettonWallet, "invalid bounced sender");
        let lotId = self.pendingRedeemLotByQuery.get(msg.queryId);
        if (lotId != null) {
            let amount = self.pendingRedeemAmountByQuery.get(msg.queryId);
            require(amount != null, "pending amount missing");
            require(amount!! == msg.amount, "invalid bounced amount");
            self.clearPendingRedeem(msg.queryId, lotId!!);
        }
    }

    fun finalizePendingRedeem(queryId: Int) {
        let lotId = self.pendingRedeemLotByQuery.get(queryId);
        require(lotId != null, "pending redeem missing");
        let amount = self.pendingRedeemAmountByQuery.get(queryId);
        require(amount != null, "pending amount missing");
        let lotSeat = self.pendingRedeemSeatByQuery.get(queryId);
        require(lotSeat != null, "pending seat missing");

        let redeemedByLot = self.lotRedeemedById.get(lotId!!);
        let currentRedeemedByLot = redeemedByLot == null ? 0 : redeemedByLot!!;
        let lotAmount = self.lotAmountById.get(lotId!!);
        require(lotAmount != null, "lot amount missing");
        require(currentRedeemedByLot + amount!! <= lotAmount!!, "redeem exceeds lot");
        self.lotRedeemedById.set(lotId!!, currentRedeemedByLot + amount!!);

        let currentPrincipal = self.principalBySeat.get(lotSeat!!);
        require(currentPrincipal != null, "principal missing");
        require(currentPrincipal!! >= amount!!, "principal underflow");
        self.principalBySeat.set(lotSeat!!, currentPrincipal!! - amount!!);
        require(self.totalPrincipal72H >= amount!!, "vault principal underflow");
        self.totalPrincipal72H -= amount!!;

        self.clearPendingRedeem(queryId, lotId!!);
    }

    fun clearPendingRedeem(queryId: Int, lotId: Int) {
        self.pendingRedeemLotByQuery.del(queryId);
        self.pendingRedeemAmountByQuery.del(queryId);
        self.pendingRedeemSeatByQuery.del(queryId);
        self.pendingRedeemOwnerByQuery.del(queryId);
        self.pendingRedeemQueryByLot.del(lotId);
    }

    fun redeemQueryId(lotId: Int): Int {
        return (self.appId * 1000000000) + lotId;
    }

    fun requireOwner() {
        require(sender() == self.owner, "owner only");
    }

    fun getOrAssignSeat(holder: Address): Int {
        let existingSeat = self.seatByOwner.get(holder);
        if (existingSeat != null) {
            return existingSeat!!;
        }

        require(self.nextSeatNumber <= 72, "reserve capacity reached");
        let assigned = self.nextSeatNumber;
        self.seatByOwner.set(holder, assigned);
        self.ownerBySeat.set(assigned, holder);
        self.nextSeatNumber = assigned + 1;

        send(SendParameters {
            to: self.registry,
            value: ton("0.01"),
            bounce: true,
            body: AssignReserveSeat {
                appId: self.appId,
                owner: holder,
            }.toCell(),
        });

        return assigned;
    }

    fun addLot(holder: Address, seatNumber: Int, amount72H: Int) {
        let currentPrincipal = self.principalBySeat.get(seatNumber);
        if (currentPrincipal == null) {
            self.principalBySeat.set(seatNumber, amount72H);
        } else {
            self.principalBySeat.set(seatNumber, currentPrincipal!! + amount72H);
        }

        let lotId = self.nextLotId;
        self.lotOwnerById.set(lotId, holder);
        self.lotSeatById.set(lotId, seatNumber);
        self.lotAmountById.set(lotId, amount72H);
        self.lotUnlockAtById.set(lotId, now() + self.lockDurationSeconds);
        self.nextLotId = lotId + 1;
        self.totalPrincipal72H += amount72H;
    }

    fun getJettonWalletAddressInternal(): Address {
        return self.vaultJettonWallet;
    }

    get fun getOwner(): Address {
        return self.owner;
    }

    get fun getRegistry(): Address {
        return self.registry;
    }

    get fun getJettonMaster(): Address {
        return self.jettonMaster;
    }

    get fun getJettonWalletAddress(): Address {
        return self.vaultJettonWallet;
    }

    get fun getAppId(): Int {
        return self.appId;
    }

    get fun getMinimumAllocation72H(): Int {
        return self.minimumAllocation72H;
    }

    get fun getNextSeatNumber(): Int {
        return self.nextSeatNumber;
    }

    get fun getNextLotId(): Int {
        return self.nextLotId;
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

    get fun getLotOwner(lotId: Int): Address {
        let owner = self.lotOwnerById.get(lotId);
        require(owner != null, "lot owner missing");
        return owner!!;
    }

    get fun getLotSeat(lotId: Int): Int {
        let seat = self.lotSeatById.get(lotId);
        if (seat == null) {
            return 0;
        }
        return seat!!;
    }

    get fun getLotAmount(lotId: Int): Int {
        let amount = self.lotAmountById.get(lotId);
        if (amount == null) {
            return 0;
        }
        return amount!!;
    }

    get fun getLotUnlockAt(lotId: Int): Int {
        let unlockAt = self.lotUnlockAtById.get(lotId);
        if (unlockAt == null) {
            return 0;
        }
        return unlockAt!!;
    }

    get fun getRedeemedByLot(lotId: Int): Int {
        let redeemed = self.lotRedeemedById.get(lotId);
        if (redeemed == null) {
            return 0;
        }
        return redeemed!!;
    }

    get fun getPendingRedeemQueryByLot(lotId: Int): Int {
        let queryId = self.pendingRedeemQueryByLot.get(lotId);
        return queryId == null ? 0 : queryId!!;
    }

    get fun getPendingRedeemAmount(queryId: Int): Int {
        let amount = self.pendingRedeemAmountByQuery.get(queryId);
        return amount == null ? 0 : amount!!;
    }
}
