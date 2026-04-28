import "./SeasonClaimV2.tact";

const SEASON_CLAIM_V2_BRIDGE_FORWARD_QUERY_OFFSET: Int = 7207100000000000;
const SEASON_CLAIM_V2_BRIDGE_MANUAL_FORWARD_QUERY_OFFSET: Int = 14414200000000000;
const SEASON_CLAIM_V2_BRIDGE_MAX_SEASONS: Int = 10;

message(0x72071001) SetSeasonClaimV2BridgeJettonWallet {
    wallet: Address;
}

message(0x72071004) SetSeasonClaimV2BridgeTarget {
    seasonClaimV2: Address;
}

message(0x72071002) ClaimLegacySeasonForV2 {
    queryId: Int as uint64;
    seasonId: Int as uint8;
    personalDepositAmount72H: Int as coins;
    teamDepositAmount72H: Int as coins;
    referralAmount72H: Int as coins;
    leaderboardAmount72H: Int as coins;
    expectedClaimAmount72H: Int as coins;
    proof: Cell;
}

message(0x72071003) ForwardBridgeInventoryToV2 {
    queryId: Int as uint64;
    amount72H: Int as coins;
}

contract SeasonClaimV2LegacyBridge {
    owner: Address;
    jettonMaster: Address;
    legacySeasonClaim: Address;
    seasonClaimV2: Address;
    bridgeJettonWallet: Address;
    claimedFromLegacy72H: Int as coins;
    forwardedToV272H: Int as coins;
    pendingForward72H: Int as coins;
    configurationLocked: Bool;
    pendingLegacySeasonByQuery: map<Int as uint64, Int as uint8>;
    pendingLegacyAmountByQuery: map<Int as uint64, Int as coins>;
    pendingForwardAmountByQuery: map<Int as uint64, Int as coins>;

    init(owner: Address, jettonMaster: Address, legacySeasonClaim: Address, seasonClaimV2: Address, bridgeJettonWallet: Address) {
        self.owner = owner;
        self.jettonMaster = jettonMaster;
        self.legacySeasonClaim = legacySeasonClaim;
        self.seasonClaimV2 = seasonClaimV2;
        self.bridgeJettonWallet = bridgeJettonWallet;
        self.claimedFromLegacy72H = 0;
        self.forwardedToV272H = 0;
        self.pendingForward72H = 0;
        self.configurationLocked = false;
    }

    receive() {}

    receive(msg: SetSeasonClaimV2BridgeJettonWallet) {
        self.requireOwner();
        require(!self.configurationLocked, "wallet locked after activity");
        self.bridgeJettonWallet = msg.wallet;
    }

    receive(msg: SetSeasonClaimV2BridgeTarget) {
        self.requireOwner();
        require(!self.configurationLocked, "target locked after activity");
        self.seasonClaimV2 = msg.seasonClaimV2;
    }

    receive(msg: ClaimLegacySeasonForV2) {
        self.requireOwner();
        require(msg.seasonId >= 1 && msg.seasonId <= SEASON_CLAIM_V2_BRIDGE_MAX_SEASONS, "season out of range");
        require(msg.expectedClaimAmount72H > 0, "expected claim missing");
        require(msg.queryId < SEASON_CLAIM_V2_BRIDGE_FORWARD_QUERY_OFFSET, "legacy query reserved");
        require(!self.pendingLegacySeasonByQuery.exists(msg.queryId), "legacy query pending");

        self.configurationLocked = true;
        self.pendingLegacySeasonByQuery.set(msg.queryId, msg.seasonId);
        self.pendingLegacyAmountByQuery.set(msg.queryId, msg.expectedClaimAmount72H);

        send(SendParameters {
            to: self.legacySeasonClaim,
            value: ton("0.12"),
            bounce: true,
            body: ClaimSeasonReward {
                queryId: msg.queryId,
                seasonId: msg.seasonId,
                personalDepositAmount72H: msg.personalDepositAmount72H,
                teamDepositAmount72H: msg.teamDepositAmount72H,
                referralAmount72H: msg.referralAmount72H,
                leaderboardAmount72H: msg.leaderboardAmount72H,
                proof: msg.proof,
            }.toCell(),
        });
    }

    receive(msg: ForwardBridgeInventoryToV2) {
        self.requireOwner();
        require(msg.amount72H > 0, "amount missing");
        require(msg.queryId >= SEASON_CLAIM_V2_BRIDGE_MANUAL_FORWARD_QUERY_OFFSET, "manual forward query required");
        require(!self.pendingForwardAmountByQuery.exists(msg.queryId), "forward query pending");
        require(msg.amount72H <= self.availableToForward72H(), "insufficient bridge inventory");
        self.configurationLocked = true;
        self.forwardToV2(msg.queryId, msg.amount72H);
    }

    receive(msg: JettonTransferNotification) {
        require(sender() == self.bridgeJettonWallet, "invalid bridge jetton wallet");
        require(msg.sender == self.legacySeasonClaim, "legacy claim funding only");
        let pendingSeason = self.pendingLegacySeasonByQuery.get(msg.queryId);
        require(pendingSeason != null, "legacy claim pending missing");
        let pendingAmount = self.pendingLegacyAmountByQuery.get(msg.queryId);
        require(pendingAmount != null, "legacy claim amount missing");

        self.pendingLegacySeasonByQuery.del(msg.queryId);
        self.pendingLegacyAmountByQuery.del(msg.queryId);
        self.claimedFromLegacy72H += msg.amount;
        let autoForwardQueryId = SEASON_CLAIM_V2_BRIDGE_FORWARD_QUERY_OFFSET + msg.queryId;
        require(autoForwardQueryId < SEASON_CLAIM_V2_BRIDGE_MANUAL_FORWARD_QUERY_OFFSET, "auto forward query overflow");
        self.forwardToV2(autoForwardQueryId, msg.amount);
    }

    receive(msg: ConfirmSeasonClaimFunding) {
        require(sender() == self.seasonClaimV2, "season claim v2 only");
        let pendingAmount = self.pendingForwardAmountByQuery.get(msg.queryId);
        require(pendingAmount != null, "forward pending missing");
        require(pendingAmount!! == msg.amount72H, "invalid forward confirm amount");
        self.pendingForwardAmountByQuery.del(msg.queryId);
        self.pendingForward72H -= msg.amount72H;
        self.forwardedToV272H += msg.amount72H;
    }

    receive(msg: JettonExcesses) {
        require(sender() == self.bridgeJettonWallet, "invalid bridge excess sender");
        // Excesses from the Jetton wallet are not treated as V2 funding proof.
        // Only ConfirmSeasonClaimFunding from SeasonClaimV2 finalizes a forward.
    }

    bounced(msg: bounced<JettonTransfer>) {
        require(sender() == self.bridgeJettonWallet, "invalid bounced sender");
        let pendingAmount = self.pendingForwardAmountByQuery.get(msg.queryId);
        if (pendingAmount != null) {
            require(pendingAmount!! == msg.amount, "invalid bounced amount");
            self.pendingForwardAmountByQuery.del(msg.queryId);
            self.pendingForward72H -= msg.amount;
        }
    }

    bounced(msg: bounced<ClaimSeasonReward>) {
        require(sender() == self.legacySeasonClaim, "invalid legacy bounce sender");
        self.pendingLegacySeasonByQuery.del(msg.queryId);
        self.pendingLegacyAmountByQuery.del(msg.queryId);
    }

    fun forwardToV2(queryId: Int, amount72H: Int) {
        require(queryId >= SEASON_CLAIM_V2_BRIDGE_FORWARD_QUERY_OFFSET, "forward query required");
        require(!self.pendingForwardAmountByQuery.exists(queryId), "forward query pending");
        self.pendingForwardAmountByQuery.set(queryId, amount72H);
        self.pendingForward72H += amount72H;

        send(SendParameters {
            to: self.bridgeJettonWallet,
            value: ton("0.10"),
            bounce: true,
            body: JettonTransfer {
                queryId: queryId,
                amount: amount72H,
                destination: self.seasonClaimV2,
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: ton("0.03"),
                forwardPayload: emptyJettonForwardPayload(),
            }.toCell(),
        });
    }

    fun availableToForward72H(): Int {
        return self.claimedFromLegacy72H - self.forwardedToV272H - self.pendingForward72H;
    }

    fun requireOwner() {
        require(sender() == self.owner, "owner only");
    }

    get fun getClaimedFromLegacy72H(): Int {
        return self.claimedFromLegacy72H;
    }

    get fun getForwardedToV272H(): Int {
        return self.forwardedToV272H;
    }

    get fun getPendingForward72H(): Int {
        return self.pendingForward72H;
    }

    get fun getAvailableToForward72H(): Int {
        return self.availableToForward72H();
    }

    get fun getPendingLegacyAmount(queryId: Int): Int {
        let value = self.pendingLegacyAmountByQuery.get(queryId);
        return value == null ? 0 : value!!;
    }

    get fun getPendingForwardAmount(queryId: Int): Int {
        let value = self.pendingForwardAmountByQuery.get(queryId);
        return value == null ? 0 : value!!;
    }

    get fun getConfigurationLocked(): Bool {
        return self.configurationLocked;
    }
}
