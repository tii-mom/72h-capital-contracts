import "../../supporting/TestJetton.tact";

const ECOSYSTEM_TREASURY_TOTAL_72H: Int = 4500000000 * 1000000000;

message(0x720a0001) SetEcosystemJettonWallet {
    wallet: Address;
}

message(0x720a0002) ApproveEcosystemContract {
    appContract: Address;
    approved: Bool;
    metadataHash: Int as uint256;
}

message(0x720a0003) FundEcosystemContract {
    queryId: Int as uint64;
    appContract: Address;
    amount72H: Int as coins;
    purposeHash: Int as uint256;
}

contract EcosystemTreasury {
    owner: Address;
    jettonMaster: Address;
    ecosystemJettonWallet: Address;
    funded72H: Int as coins;
    released72H: Int as coins;
    approvedByContract: map<Address, Int as uint8>;
    metadataHashByContract: map<Address, Int as uint256>;
    amountByFunding: map<Int as uint64, Int as coins>;
    targetByFunding: map<Int as uint64, Address>;
    purposeHashByFunding: map<Int as uint64, Int as uint256>;

    init(owner: Address, jettonMaster: Address, ecosystemJettonWallet: Address) {
        self.owner = owner;
        self.jettonMaster = jettonMaster;
        self.ecosystemJettonWallet = ecosystemJettonWallet;
        self.funded72H = 0;
        self.released72H = 0;
    }

    receive() {}

    receive(msg: SetEcosystemJettonWallet) {
        self.requireOwner();
        require(self.funded72H == 0 && self.released72H == 0, "wallet locked after funding");
        self.ecosystemJettonWallet = msg.wallet;
    }

    receive(msg: JettonTransferNotification) {
        require(sender() == self.ecosystemJettonWallet, "invalid jetton wallet");
        require(msg.amount > 0, "funding must be positive");
        require(self.funded72H + msg.amount <= ECOSYSTEM_TREASURY_TOTAL_72H, "ecosystem treasury overfunded");
        self.funded72H += msg.amount;
    }

    receive(msg: ApproveEcosystemContract) {
        self.requireOwner();
        self.approvedByContract.set(msg.appContract, msg.approved ? 1 : 0);
        self.metadataHashByContract.set(msg.appContract, msg.metadataHash);
    }

    receive(msg: FundEcosystemContract) {
        self.requireOwner();
        require(msg.amount72H > 0, "fund amount must be positive");
        require(self.isApprovedInternal(msg.appContract), "app contract not approved");
        require(!self.amountByFunding.exists(msg.queryId), "fund query exists");
        require(self.released72H + msg.amount72H <= self.funded72H, "insufficient ecosystem funding");

        self.released72H += msg.amount72H;
        self.amountByFunding.set(msg.queryId, msg.amount72H);
        self.targetByFunding.set(msg.queryId, msg.appContract);
        self.purposeHashByFunding.set(msg.queryId, msg.purposeHash);

        send(SendParameters {
            to: self.ecosystemJettonWallet,
            value: ton("0.08"),
            bounce: true,
            body: JettonTransfer {
                queryId: msg.queryId,
                amount: msg.amount72H,
                destination: msg.appContract,
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: ton("0.01"),
                forwardPayload: emptyJettonForwardPayload(),
            }.toCell(),
        });
    }

    bounced(msg: bounced<JettonTransfer>) {
        require(sender() == self.ecosystemJettonWallet, "invalid bounced sender");
        let amount = self.amountByFunding.get(msg.queryId);
        if (amount != null) {
            require(amount!! == msg.amount, "invalid bounced amount");
            self.released72H -= amount!!;
            self.amountByFunding.del(msg.queryId);
            self.targetByFunding.del(msg.queryId);
            self.purposeHashByFunding.del(msg.queryId);
        }
    }

    fun isApprovedInternal(appContract: Address): Bool {
        let approved = self.approvedByContract.get(appContract);
        return approved != null && approved!! == 1;
    }

    fun requireOwner() {
        require(sender() == self.owner, "owner only");
    }

    get fun getFunded72H(): Int {
        return self.funded72H;
    }

    get fun getReleased72H(): Int {
        return self.released72H;
    }

    get fun isApproved(appContract: Address): Bool {
        return self.isApprovedInternal(appContract);
    }

    get fun getFundingAmount(queryId: Int): Int {
        let value = self.amountByFunding.get(queryId);
        return value == null ? 0 : value!!;
    }

    get fun getFundingPurposeHash(queryId: Int): Int {
        let value = self.purposeHashByFunding.get(queryId);
        return value == null ? 0 : value!!;
    }
}
