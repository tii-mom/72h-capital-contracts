import "../supporting/TestJetton.tact";

message(0x7207f001) MockSeasonClaimV2Funding {
    queryId: Int as uint64;
    amount: Int as coins;
}

contract SeasonClaimV2BouncingJettonWallet {
    owner: Address;
    claimContract: Address;
    seasonVault: Address;

    init(owner: Address, claimContract: Address, seasonVault: Address) {
        self.owner = owner;
        self.claimContract = claimContract;
        self.seasonVault = seasonVault;
    }

    receive() {}

    receive(msg: MockSeasonClaimV2Funding) {
        self.requireOwner();
        require(msg.amount > 0, "amount missing");

        send(SendParameters {
            to: self.claimContract,
            value: ton("0.08"),
            bounce: true,
            body: JettonTransferNotification {
                queryId: msg.queryId,
                amount: msg.amount,
                sender: self.seasonVault,
                forwardPayload: emptyJettonForwardPayload(),
            }.toCell(),
        });
    }

    receive(msg: JettonTransfer) {
        require(false, "mock jetton bounce");
    }

    fun requireOwner() {
        require(sender() == self.owner, "owner only");
    }
}
