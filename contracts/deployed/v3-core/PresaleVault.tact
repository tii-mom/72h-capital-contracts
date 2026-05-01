import "../../supporting/TestJetton.tact";

const PRESALE_STAGE_CAP_72H: Int = 1500000000 * 1000000000;
const PRESALE_TOTAL_CAP_72H: Int = 4500000000 * 1000000000;

message(0x720b0001) SetPresaleJettonWallet {
    wallet: Address;
}

message(0x720b0002) SetPresaleActive {
    active: Bool;
}

message(0x720b0006) SetPresaleStage {
    stage: Int as uint8;
}

message(0x720b0003) BuyPresale {
    queryId: Int as uint64;
    stage: Int as uint8;
    tonAmount: Int as coins;
    minTokens72H: Int as coins;
}

message(0x720b0004) WithdrawPresaleTon {
    amountTon: Int as coins;
}

message(0x720b0005) SweepUnsoldPresale {
    queryId: Int as uint64;
}

contract PresaleVault {
    owner: Address;
    jettonMaster: Address;
    presaleJettonWallet: Address;
    proceedsWallet: Address;
    unsoldDestination: Address;
    tokensPerTonStage1: Int as coins;
    tokensPerTonStage2: Int as coins;
    tokensPerTonStage3: Int as coins;
    walletCap72H: Int as coins;
    currentStage: Int as uint8;
    active: Bool;
    hasBeenActive: Bool;
    funded72H: Int as coins;
    sold72H: Int as coins;
    sweptUnsold72H: Int as coins;
    saleProceedsTon: Int as coins;
    withdrawnTon: Int as coins;
    pendingSold72H: Int as coins;
    pendingSaleProceedsTon: Int as coins;
    pendingUnsoldSweep72H: Int as coins;
    soldByStage: map<Int as uint8, Int as coins>;
    purchasedByBuyer: map<Address, Int as coins>;
    pendingBuyerByQuery: map<Int as uint64, Address>;
    pendingStageByQuery: map<Int as uint64, Int as uint8>;
    pendingTokensByQuery: map<Int as uint64, Int as coins>;
    pendingTonByQuery: map<Int as uint64, Int as coins>;
    pendingUnsoldSweepByQuery: map<Int as uint64, Int as coins>;
    completedPurchaseByQuery: map<Int as uint64, Int as coins>;
    completedUnsoldSweepByQuery: map<Int as uint64, Int as coins>;

    init(
        owner: Address,
        jettonMaster: Address,
        presaleJettonWallet: Address,
        proceedsWallet: Address,
        unsoldDestination: Address,
        tokensPerTonStage1: Int,
        tokensPerTonStage2: Int,
        tokensPerTonStage3: Int,
        walletCap72H: Int
    ) {
        self.owner = owner;
        self.jettonMaster = jettonMaster;
        self.presaleJettonWallet = presaleJettonWallet;
        self.proceedsWallet = proceedsWallet;
        self.unsoldDestination = unsoldDestination;
        self.tokensPerTonStage1 = tokensPerTonStage1;
        self.tokensPerTonStage2 = tokensPerTonStage2;
        self.tokensPerTonStage3 = tokensPerTonStage3;
        self.walletCap72H = walletCap72H;
        self.currentStage = 1;
        self.active = false;
        self.hasBeenActive = false;
        self.funded72H = 0;
        self.sold72H = 0;
        self.sweptUnsold72H = 0;
        self.saleProceedsTon = 0;
        self.withdrawnTon = 0;
        self.pendingSold72H = 0;
        self.pendingSaleProceedsTon = 0;
        self.pendingUnsoldSweep72H = 0;
    }

    receive() {}

    receive(msg: SetPresaleJettonWallet) {
        self.requireOwner();
        require(!self.active && self.funded72H == 0 && self.sold72H == 0 && self.sweptUnsold72H == 0 && self.saleProceedsTon == 0 && self.withdrawnTon == 0, "wallet locked after funding");
        self.presaleJettonWallet = msg.wallet;
    }

    receive(msg: SetPresaleActive) {
        self.requireOwner();
        if (msg.active) {
            require(self.sweptUnsold72H == 0 && self.pendingUnsoldSweep72H == 0, "unsold already swept");
        }
        self.active = msg.active;
        if (msg.active) {
            self.hasBeenActive = true;
        }
    }

    receive(msg: SetPresaleStage) {
        self.requireOwner();
        require(!self.active, "close presale before changing stage");
        require(msg.stage >= 1 && msg.stage <= 3, "unsupported stage");
        require(msg.stage >= self.currentStage, "cannot rewind stage");
        self.currentStage = msg.stage;
    }

    receive(msg: JettonTransferNotification) {
        require(sender() == self.presaleJettonWallet, "invalid jetton wallet");
        require(msg.amount > 0, "funding must be positive");
        require(self.funded72H + msg.amount <= PRESALE_TOTAL_CAP_72H, "presale overfunded");
        self.funded72H += msg.amount;
    }

    receive(msg: BuyPresale) {
        require(self.active, "presale inactive");
        require(msg.stage >= 1 && msg.stage <= 3, "unsupported stage");
        require(msg.stage == self.currentStage, "stage not active");
        require(msg.tonAmount > 0, "ton amount missing");
        require(context().value >= msg.tonAmount + ton("0.12"), "insufficient ton for purchase and gas");
        require(!self.pendingBuyerByQuery.exists(msg.queryId), "query pending");
        require(!self.completedPurchaseByQuery.exists(msg.queryId), "query completed");
        require(!self.pendingUnsoldSweepByQuery.exists(msg.queryId) && !self.completedUnsoldSweepByQuery.exists(msg.queryId), "query reserved");

        let tokenAmount = (msg.tonAmount * self.tokensPerTon(msg.stage)) / 1000000000;
        require(tokenAmount >= msg.minTokens72H, "min tokens not met");
        require(tokenAmount > 0, "token amount too small");
        require(self.sold72H + self.sweptUnsold72H + tokenAmount <= self.funded72H, "insufficient presale inventory");

        let stageSold = self.soldByStage.get(msg.stage);
        let currentStageSold = stageSold == null ? 0 : stageSold!!;
        require(currentStageSold + tokenAmount <= PRESALE_STAGE_CAP_72H, "stage sold out");

        let buyerPurchased = self.purchasedByBuyer.get(sender());
        let currentBuyerPurchased = buyerPurchased == null ? 0 : buyerPurchased!!;
        require(currentBuyerPurchased + tokenAmount <= self.walletCap72H, "wallet cap exceeded");

        self.sold72H += tokenAmount;
        self.saleProceedsTon += msg.tonAmount;
        self.pendingSold72H += tokenAmount;
        self.pendingSaleProceedsTon += msg.tonAmount;
        self.soldByStage.set(msg.stage, currentStageSold + tokenAmount);
        self.purchasedByBuyer.set(sender(), currentBuyerPurchased + tokenAmount);
        self.pendingBuyerByQuery.set(msg.queryId, sender());
        self.pendingStageByQuery.set(msg.queryId, msg.stage);
        self.pendingTokensByQuery.set(msg.queryId, tokenAmount);
        self.pendingTonByQuery.set(msg.queryId, msg.tonAmount);

        send(SendParameters {
            to: self.presaleJettonWallet,
            value: ton("0.08"),
            bounce: true,
            body: JettonTransfer {
                queryId: msg.queryId,
                amount: tokenAmount,
                destination: sender(),
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: 0,
                forwardPayload: emptyJettonForwardPayload(),
            }.toCell(),
        });
    }

    receive(msg: WithdrawPresaleTon) {
        self.requireOwner();
        require(msg.amountTon > 0, "withdraw must be positive");
        require(self.withdrawnTon + msg.amountTon <= self.saleProceedsTon - self.pendingSaleProceedsTon, "withdraw exceeds settled proceeds");
        self.withdrawnTon += msg.amountTon;
        send(SendParameters {
            to: self.proceedsWallet,
            value: msg.amountTon,
            bounce: false,
        });
    }

    receive(msg: SweepUnsoldPresale) {
        self.requireOwner();
        require(!self.active, "presale active");
        require(self.hasBeenActive, "presale never opened");
        require(self.pendingSold72H == 0 && self.pendingSaleProceedsTon == 0, "purchases pending");
        require(self.pendingUnsoldSweep72H == 0, "sweep pending");
        let unsold = self.funded72H - self.sold72H - self.sweptUnsold72H;
        require(unsold > 0, "no unsold tokens");
        require(!self.pendingUnsoldSweepByQuery.exists(msg.queryId), "sweep query exists");
        require(!self.completedUnsoldSweepByQuery.exists(msg.queryId), "sweep query completed");
        require(!self.pendingBuyerByQuery.exists(msg.queryId) && !self.completedPurchaseByQuery.exists(msg.queryId), "query reserved");
        self.sweptUnsold72H += unsold;
        self.pendingUnsoldSweep72H += unsold;
        self.pendingUnsoldSweepByQuery.set(msg.queryId, unsold);

        send(SendParameters {
            to: self.presaleJettonWallet,
            value: ton("0.08"),
            bounce: true,
            body: JettonTransfer {
                queryId: msg.queryId,
                amount: unsold,
                destination: self.unsoldDestination,
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: ton("0.01"),
                forwardPayload: emptyJettonForwardPayload(),
            }.toCell(),
        });
    }

    receive(msg: JettonExcesses) {
        require(sender() == self.presaleJettonWallet, "invalid jetton wallet");
        let buyer = self.pendingBuyerByQuery.get(msg.queryId);
        if (buyer != null) {
            let tokens = self.pendingTokensByQuery.get(msg.queryId);
            let tonAmount = self.pendingTonByQuery.get(msg.queryId);
            require(tokens != null && tonAmount != null, "pending purchase incomplete");
            self.pendingSold72H -= tokens!!;
            self.pendingSaleProceedsTon -= tonAmount!!;
            self.completedPurchaseByQuery.set(msg.queryId, tokens!!);
            self.pendingBuyerByQuery.del(msg.queryId);
            self.pendingStageByQuery.del(msg.queryId);
            self.pendingTokensByQuery.del(msg.queryId);
            self.pendingTonByQuery.del(msg.queryId);
        }
        let unsoldSweep = self.pendingUnsoldSweepByQuery.get(msg.queryId);
        if (unsoldSweep != null) {
            self.pendingUnsoldSweep72H -= unsoldSweep!!;
            self.completedUnsoldSweepByQuery.set(msg.queryId, unsoldSweep!!);
            self.pendingUnsoldSweepByQuery.del(msg.queryId);
        }
    }

    bounced(msg: bounced<JettonTransfer>) {
        require(sender() == self.presaleJettonWallet, "invalid bounced sender");
        let buyer = self.pendingBuyerByQuery.get(msg.queryId);
        if (buyer != null) {
            let tokens = self.pendingTokensByQuery.get(msg.queryId);
            let tonAmount = self.pendingTonByQuery.get(msg.queryId);
            let stage = self.pendingStageByQuery.get(msg.queryId);
            require(tokens != null && tonAmount != null && stage != null, "pending purchase incomplete");
            require(tokens!! == msg.amount, "invalid bounced amount");
            self.sold72H -= tokens!!;
            self.saleProceedsTon -= tonAmount!!;
            self.pendingSold72H -= tokens!!;
            self.pendingSaleProceedsTon -= tonAmount!!;

            let stageSold = self.soldByStage.get(stage!!);
            if (stageSold != null) {
                self.soldByStage.set(stage!!, stageSold!! - tokens!!);
            }

            let buyerPurchased = self.purchasedByBuyer.get(buyer!!);
            if (buyerPurchased != null) {
                self.purchasedByBuyer.set(buyer!!, buyerPurchased!! - tokens!!);
            }

            send(SendParameters {
                to: buyer!!,
                value: tonAmount!!,
                bounce: false,
            });
            self.pendingBuyerByQuery.del(msg.queryId);
            self.pendingStageByQuery.del(msg.queryId);
            self.pendingTokensByQuery.del(msg.queryId);
            self.pendingTonByQuery.del(msg.queryId);
        }
        let unsoldSweep = self.pendingUnsoldSweepByQuery.get(msg.queryId);
        if (unsoldSweep != null) {
            require(unsoldSweep!! == msg.amount, "invalid bounced amount");
            self.sweptUnsold72H -= unsoldSweep!!;
            self.pendingUnsoldSweep72H -= unsoldSweep!!;
            self.pendingUnsoldSweepByQuery.del(msg.queryId);
        }
    }

    fun getSoldByStageInternal(stage: Int): Int {
        let value = self.soldByStage.get(stage);
        return value == null ? 0 : value!!;
    }

    fun tokensPerTon(stage: Int): Int {
        if (stage == 1) {
            return self.tokensPerTonStage1;
        }
        if (stage == 2) {
            return self.tokensPerTonStage2;
        }
        return self.tokensPerTonStage3;
    }

    fun requireOwner() {
        require(sender() == self.owner, "owner only");
    }

    get fun isActive(): Bool {
        return self.active;
    }

    get fun getCurrentStage(): Int {
        return self.currentStage;
    }

    get fun getStageCap72H(): Int {
        return PRESALE_STAGE_CAP_72H;
    }

    get fun getTotalCap72H(): Int {
        return PRESALE_TOTAL_CAP_72H;
    }

    get fun getFunded72H(): Int {
        return self.funded72H;
    }

    get fun getSold72H(): Int {
        return self.sold72H;
    }

    get fun getSaleProceedsTon(): Int {
        return self.saleProceedsTon;
    }

    get fun getWithdrawnTon(): Int {
        return self.withdrawnTon;
    }

    get fun getSettledSaleProceedsTon(): Int {
        return self.saleProceedsTon - self.pendingSaleProceedsTon;
    }

    get fun getPendingSold72H(): Int {
        return self.pendingSold72H;
    }

    get fun getPendingSaleProceedsTon(): Int {
        return self.pendingSaleProceedsTon;
    }

    get fun getSweptUnsold72H(): Int {
        return self.sweptUnsold72H;
    }

    get fun getPendingUnsoldSweep72H(): Int {
        return self.pendingUnsoldSweep72H;
    }

    get fun getSoldByStage(stage: Int): Int {
        return self.getSoldByStageInternal(stage);
    }

    get fun getPurchasedByBuyer(buyer: Address): Int {
        let value = self.purchasedByBuyer.get(buyer);
        return value == null ? 0 : value!!;
    }

    get fun getPendingPurchaseTokens(queryId: Int): Int {
        let value = self.pendingTokensByQuery.get(queryId);
        return value == null ? 0 : value!!;
    }

    get fun getCompletedPurchaseTokens(queryId: Int): Int {
        let value = self.completedPurchaseByQuery.get(queryId);
        return value == null ? 0 : value!!;
    }

    get fun getPendingUnsoldSweepAmount(queryId: Int): Int {
        let value = self.pendingUnsoldSweepByQuery.get(queryId);
        return value == null ? 0 : value!!;
    }

    get fun getCompletedUnsoldSweepAmount(queryId: Int): Int {
        let value = self.completedUnsoldSweepByQuery.get(queryId);
        return value == null ? 0 : value!!;
    }
}
