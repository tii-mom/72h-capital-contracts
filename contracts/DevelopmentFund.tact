import "./TestJetton.tact";

message(0x720c0001) SetDevelopmentFundJettonWallet {
    wallet: Address;
}

message(0x720c0002) WithdrawDevelopmentFund {
    queryId: Int as uint64;
    amount72H: Int as coins;
    destination: Address;
    purposeHash: Int as uint256;
}

contract DevelopmentFund {
    owner: Address;
    jettonMaster: Address;
    fundJettonWallet: Address;
    funded72H: Int as coins;
    withdrawn72H: Int as coins;
    amountByWithdrawal: map<Int as uint64, Int as coins>;
    destinationByWithdrawal: map<Int as uint64, Address>;
    purposeHashByWithdrawal: map<Int as uint64, Int as uint256>;

    init(owner: Address, jettonMaster: Address, fundJettonWallet: Address) {
        self.owner = owner;
        self.jettonMaster = jettonMaster;
        self.fundJettonWallet = fundJettonWallet;
        self.funded72H = 0;
        self.withdrawn72H = 0;
    }

    receive() {}

    receive(msg: SetDevelopmentFundJettonWallet) {
        self.requireOwner();
        require(self.funded72H == 0 && self.withdrawn72H == 0, "wallet locked after funding");
        self.fundJettonWallet = msg.wallet;
    }

    receive(msg: JettonTransferNotification) {
        require(sender() == self.fundJettonWallet, "invalid jetton wallet");
        require(msg.amount > 0, "funding must be positive");
        self.funded72H += msg.amount;
    }

    receive(msg: WithdrawDevelopmentFund) {
        self.requireOwner();
        require(msg.amount72H > 0, "withdraw must be positive");
        require(!self.amountByWithdrawal.exists(msg.queryId), "withdraw query exists");
        require(self.withdrawn72H + msg.amount72H <= self.funded72H, "withdraw exceeds fund balance");

        self.withdrawn72H += msg.amount72H;
        self.amountByWithdrawal.set(msg.queryId, msg.amount72H);
        self.destinationByWithdrawal.set(msg.queryId, msg.destination);
        self.purposeHashByWithdrawal.set(msg.queryId, msg.purposeHash);

        send(SendParameters {
            to: self.fundJettonWallet,
            value: ton("0.08"),
            bounce: true,
            body: JettonTransfer {
                queryId: msg.queryId,
                amount: msg.amount72H,
                destination: msg.destination,
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: 0,
                forwardPayload: emptyJettonForwardPayload(),
            }.toCell(),
        });
    }

    bounced(msg: bounced<JettonTransfer>) {
        require(sender() == self.fundJettonWallet, "invalid bounced sender");
        let amount = self.amountByWithdrawal.get(msg.queryId);
        if (amount != null) {
            require(amount!! == msg.amount, "invalid bounced amount");
            self.withdrawn72H -= amount!!;
            self.amountByWithdrawal.del(msg.queryId);
            self.destinationByWithdrawal.del(msg.queryId);
            self.purposeHashByWithdrawal.del(msg.queryId);
        }
    }

    fun requireOwner() {
        require(sender() == self.owner, "owner only");
    }

    get fun getFunded72H(): Int {
        return self.funded72H;
    }

    get fun getWithdrawn72H(): Int {
        return self.withdrawn72H;
    }

    get fun getAvailable72H(): Int {
        return self.funded72H - self.withdrawn72H;
    }

    get fun getWithdrawalAmount(queryId: Int): Int {
        let value = self.amountByWithdrawal.get(queryId);
        return value == null ? 0 : value!!;
    }

    get fun getWithdrawalPurposeHash(queryId: Int): Int {
        let value = self.purposeHashByWithdrawal.get(queryId);
        return value == null ? 0 : value!!;
    }
}
