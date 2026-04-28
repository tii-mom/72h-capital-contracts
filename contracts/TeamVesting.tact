import "./TestJetton.tact";

const TEAM_VESTING_STAGE_AMOUNT_72H: Int = 100000000 * 1000000000;
const TEAM_VESTING_TOTAL_72H: Int = 300000000 * 1000000000;
const TEAM_VESTING_HOLD_SECONDS: Int = 72 * 60 * 60;

message(0x72090001) SetTeamJettonWallet {
    wallet: Address;
}

message(0x72090002) UnlockTeamStage {
    queryId: Int as uint64;
    stage: Int as uint8;
    priceUsd9: Int as uint128;
    observedAt: Int as uint32;
    evidenceHash: Int as uint256;
}

contract TeamVesting {
    owner: Address;
    jettonMaster: Address;
    teamJettonWallet: Address;
    teamWallet: Address;
    funded72H: Int as coins;
    released72H: Int as coins;
    releasedByStage: map<Int as uint8, Int as uint8>;
    priceByStage: map<Int as uint8, Int as uint128>;
    observedAtByStage: map<Int as uint8, Int as uint32>;
    evidenceHashByStage: map<Int as uint8, Int as uint256>;
    pendingStageByQuery: map<Int as uint64, Int as uint8>;

    init(owner: Address, jettonMaster: Address, teamJettonWallet: Address, teamWallet: Address) {
        self.owner = owner;
        self.jettonMaster = jettonMaster;
        self.teamJettonWallet = teamJettonWallet;
        self.teamWallet = teamWallet;
        self.funded72H = 0;
        self.released72H = 0;
    }

    receive() {}

    receive(msg: SetTeamJettonWallet) {
        self.requireOwner();
        require(self.funded72H == 0 && self.released72H == 0, "wallet locked after funding");
        self.teamJettonWallet = msg.wallet;
    }

    receive(msg: JettonTransferNotification) {
        require(sender() == self.teamJettonWallet, "invalid jetton wallet");
        require(msg.amount > 0, "funding must be positive");
        require(self.funded72H + msg.amount <= TEAM_VESTING_TOTAL_72H, "team vesting overfunded");
        self.funded72H += msg.amount;
    }

    receive(msg: UnlockTeamStage) {
        self.requireOwner();
        require(msg.stage >= 1 && msg.stage <= 3, "unsupported stage");
        require(!self.releasedByStage.exists(msg.stage), "stage released");
        require(now() >= msg.observedAt + TEAM_VESTING_HOLD_SECONDS, "price hold window not met");
        if (msg.stage == 1) {
            require(msg.priceUsd9 >= 100000000, "stage one price not met");
        } else if (msg.stage == 2) {
            require(msg.priceUsd9 >= 500000000, "stage two price not met");
        } else {
            require(msg.priceUsd9 >= 1000000000, "stage three price not met");
        }
        require(self.released72H + TEAM_VESTING_STAGE_AMOUNT_72H <= self.funded72H, "insufficient team funding");

        self.releasedByStage.set(msg.stage, 1);
        self.priceByStage.set(msg.stage, msg.priceUsd9);
        self.observedAtByStage.set(msg.stage, msg.observedAt);
        self.evidenceHashByStage.set(msg.stage, msg.evidenceHash);
        self.released72H += TEAM_VESTING_STAGE_AMOUNT_72H;
        self.pendingStageByQuery.set(msg.queryId, msg.stage);

        send(SendParameters {
            to: self.teamJettonWallet,
            value: ton("0.08"),
            bounce: true,
            body: JettonTransfer {
                queryId: msg.queryId,
                amount: TEAM_VESTING_STAGE_AMOUNT_72H,
                destination: self.teamWallet,
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: 0,
                forwardPayload: emptyJettonForwardPayload(),
            }.toCell(),
        });
    }

    bounced(msg: bounced<JettonTransfer>) {
        require(sender() == self.teamJettonWallet, "invalid bounced sender");
        let stage = self.pendingStageByQuery.get(msg.queryId);
        if (stage != null) {
            require(msg.amount == TEAM_VESTING_STAGE_AMOUNT_72H, "invalid bounced amount");
            self.released72H -= TEAM_VESTING_STAGE_AMOUNT_72H;
            self.releasedByStage.del(stage!!);
            self.priceByStage.del(stage!!);
            self.observedAtByStage.del(stage!!);
            self.evidenceHashByStage.del(stage!!);
            self.pendingStageByQuery.del(msg.queryId);
        }
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

    get fun isStageReleased(stage: Int): Bool {
        return self.releasedByStage.exists(stage);
    }

    get fun getStageAmount72H(): Int {
        return TEAM_VESTING_STAGE_AMOUNT_72H;
    }
}
