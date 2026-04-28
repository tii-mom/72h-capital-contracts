import "./TestJetton.tact";

const FUND_VESTING_BPS_DENOMINATOR: Int = 10000;
const FUND_VESTING_STAGE_ONE_BPS: Int = 2000;
const FUND_VESTING_STAGE_TWO_BPS: Int = 4000;
const FUND_VESTING_STAGE_THREE_BPS: Int = 6000;
const FUND_VESTING_STAGE_FOUR_BPS: Int = 8000;
const FUND_VESTING_STAGE_FIVE_BPS: Int = 10000;
const FUND_VESTING_STAGE_ONE_PRICE_USD9: Int = 10000000;
const FUND_VESTING_STAGE_TWO_PRICE_USD9: Int = 30000000;
const FUND_VESTING_STAGE_THREE_PRICE_USD9: Int = 50000000;
const FUND_VESTING_STAGE_FOUR_PRICE_USD9: Int = 70000000;
const FUND_VESTING_STAGE_FIVE_PRICE_USD9: Int = 100000000;
const FUND_VESTING_HOLD_SECONDS: Int = 72 * 60 * 60;

message(0x72080001) SetFundJettonWallet {
    wallet: Address;
}

message(0x72080004) SetFundSeasonVault {
    seasonVault: Address;
}

message(0x72080002) UnlockFundStage {
    stage: Int as uint8;
    priceUsd9: Int as uint128;
    observedAt: Int as uint32;
    evidenceHash: Int as uint256;
}

message(0x72080003) WithdrawFund {
    queryId: Int as uint64;
    amount72H: Int as coins;
    purposeHash: Int as uint256;
}

contract FundVesting {
    owner: Address;
    jettonMaster: Address;
    fundJettonWallet: Address;
    seasonVault: Address;
    fundWallet: Address;
    funded72H: Int as coins;
    withdrawn72H: Int as coins;
    unlockedBps: Int as uint16;
    priceByStage: map<Int as uint8, Int as uint128>;
    observedAtByStage: map<Int as uint8, Int as uint32>;
    evidenceHashByStage: map<Int as uint8, Int as uint256>;
    amountByWithdrawal: map<Int as uint64, Int as coins>;
    purposeHashByWithdrawal: map<Int as uint64, Int as uint256>;

    init(owner: Address, jettonMaster: Address, fundJettonWallet: Address, seasonVault: Address, fundWallet: Address) {
        self.owner = owner;
        self.jettonMaster = jettonMaster;
        self.fundJettonWallet = fundJettonWallet;
        self.seasonVault = seasonVault;
        self.fundWallet = fundWallet;
        self.funded72H = 0;
        self.withdrawn72H = 0;
        self.unlockedBps = 0;
    }

    receive() {}

    receive(msg: SetFundJettonWallet) {
        self.requireOwner();
        require(self.funded72H == 0 && self.withdrawn72H == 0, "wallet locked after funding");
        self.fundJettonWallet = msg.wallet;
    }

    receive(msg: SetFundSeasonVault) {
        self.requireOwner();
        require(self.funded72H == 0 && self.withdrawn72H == 0, "season vault locked after funding");
        self.seasonVault = msg.seasonVault;
    }

    receive(msg: JettonTransferNotification) {
        require(sender() == self.fundJettonWallet, "invalid jetton wallet");
        require(msg.sender == self.seasonVault, "season vault funding only");
        require(msg.amount > 0, "funding must be positive");
        self.funded72H += msg.amount;

        send(SendParameters {
            to: self.seasonVault,
            value: ton("0.02"),
            bounce: false,
            body: ConfirmSeasonFundTransfer {
                queryId: msg.queryId,
                amount72H: msg.amount,
            }.toCell(),
        });
    }

    receive(msg: UnlockFundStage) {
        self.requireOwner();
        require(now() >= msg.observedAt + FUND_VESTING_HOLD_SECONDS, "price hold window not met");
        if (msg.stage == 1) {
            require(msg.priceUsd9 >= FUND_VESTING_STAGE_ONE_PRICE_USD9, "stage one price not met");
            require(self.unlockedBps < FUND_VESTING_STAGE_ONE_BPS, "stage already unlocked");
            self.unlockedBps = FUND_VESTING_STAGE_ONE_BPS;
        } else if (msg.stage == 2) {
            require(msg.priceUsd9 >= FUND_VESTING_STAGE_TWO_PRICE_USD9, "stage two price not met");
            require(self.unlockedBps < FUND_VESTING_STAGE_TWO_BPS, "stage already unlocked");
            self.unlockedBps = FUND_VESTING_STAGE_TWO_BPS;
        } else if (msg.stage == 3) {
            require(msg.priceUsd9 >= FUND_VESTING_STAGE_THREE_PRICE_USD9, "stage three price not met");
            require(self.unlockedBps < FUND_VESTING_STAGE_THREE_BPS, "stage already unlocked");
            self.unlockedBps = FUND_VESTING_STAGE_THREE_BPS;
        } else if (msg.stage == 4) {
            require(msg.priceUsd9 >= FUND_VESTING_STAGE_FOUR_PRICE_USD9, "stage four price not met");
            require(self.unlockedBps < FUND_VESTING_STAGE_FOUR_BPS, "stage already unlocked");
            self.unlockedBps = FUND_VESTING_STAGE_FOUR_BPS;
        } else {
            require(msg.stage == 5, "unsupported stage");
            require(msg.priceUsd9 >= FUND_VESTING_STAGE_FIVE_PRICE_USD9, "stage five price not met");
            require(self.unlockedBps < FUND_VESTING_STAGE_FIVE_BPS, "stage already unlocked");
            self.unlockedBps = FUND_VESTING_STAGE_FIVE_BPS;
        }
        self.priceByStage.set(msg.stage, msg.priceUsd9);
        self.observedAtByStage.set(msg.stage, msg.observedAt);
        self.evidenceHashByStage.set(msg.stage, msg.evidenceHash);
    }

    receive(msg: WithdrawFund) {
        self.requireOwner();
        require(msg.amount72H > 0, "withdraw must be positive");
        require(!self.amountByWithdrawal.exists(msg.queryId), "withdraw query exists");
        require(self.withdrawn72H + msg.amount72H <= self.getUnlockedAmountInternal(), "withdraw exceeds unlocked");

        self.withdrawn72H += msg.amount72H;
        self.amountByWithdrawal.set(msg.queryId, msg.amount72H);
        self.purposeHashByWithdrawal.set(msg.queryId, msg.purposeHash);

        send(SendParameters {
            to: self.fundJettonWallet,
            value: ton("0.08"),
            bounce: true,
            body: JettonTransfer {
                queryId: msg.queryId,
                amount: msg.amount72H,
                destination: self.fundWallet,
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
            self.purposeHashByWithdrawal.del(msg.queryId);
        }
    }

    fun getUnlockedAmountInternal(): Int {
        return (self.funded72H * self.unlockedBps) / FUND_VESTING_BPS_DENOMINATOR;
    }

    fun requireOwner() {
        require(sender() == self.owner, "owner only");
    }

    get fun getFunded72H(): Int {
        return self.funded72H;
    }

    get fun getUnlockedBps(): Int {
        return self.unlockedBps;
    }

    get fun getUnlockedAmount72H(): Int {
        return self.getUnlockedAmountInternal();
    }

    get fun getWithdrawn72H(): Int {
        return self.withdrawn72H;
    }

    get fun getAvailableToWithdraw72H(): Int {
        return self.getUnlockedAmountInternal() - self.withdrawn72H;
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
