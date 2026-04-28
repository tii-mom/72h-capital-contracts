import "./TestJetton.tact";

const SEASON_VAULT_ROUND_AMOUNT_72H: Int = 500000000 * 1000000000;
const SEASON_VAULT_MAX_ROUNDS: Int = 180;
const SEASON_VAULT_ROUNDS_PER_SEASON: Int = 18;
const SEASON_VAULT_MAX_SEASONS: Int = 10;
const SEASON_VAULT_TOTAL_ALLOCATION_72H: Int = 90000000000 * 1000000000;
const SEASON_VAULT_BPS_DENOMINATOR: Int = 10000;
const SEASON_VAULT_PERSONAL_DEPOSIT_BPS: Int = 5000;
const SEASON_VAULT_TEAM_DEPOSIT_BPS: Int = 2500;
const SEASON_VAULT_REFERRAL_BPS: Int = 1500;
const SEASON_VAULT_LEADERBOARD_BPS: Int = 1000;

message(0x72060001) SetSeasonVaultJettonWallet {
    wallet: Address;
}

message(0x72060004) SetSeasonVaultRoutes {
    claimContract: Address;
    fundVestingContract: Address;
}

message(0x72060002) RecordSeasonRound {
    roundId: Int as uint32;
    startAt: Int as uint32;
    endAt: Int as uint32;
    startPriceUsd9: Int as uint128;
    endPriceUsd9: Int as uint128;
    success: Bool;
    evidenceHash: Int as uint256;
}

message(0x72060003) SweepSeasonRemainder {
    queryId: Int as uint64;
    amount72H: Int as coins;
}

message(0x72060005) FinalizeSeasonRewards {
    queryId: Int as uint64;
    seasonId: Int as uint8;
    evidenceHash: Int as uint256;
}

contract SeasonVault {
    owner: Address;
    jettonMaster: Address;
    vaultJettonWallet: Address;
    claimContract: Address;
    fundVestingContract: Address;
    funded72H: Int as coins;
    allocated72H: Int as coins;
    userRewardAllocated72H: Int as coins;
    fundAllocated72H: Int as coins;
    highestRecordedRoundId: Int as uint32;
    successByRound: map<Int as uint32, Int as uint8>;
    amountByRound: map<Int as uint32, Int as coins>;
    startAtByRound: map<Int as uint32, Int as uint32>;
    endAtByRound: map<Int as uint32, Int as uint32>;
    startPriceByRound: map<Int as uint32, Int as uint128>;
    endPriceByRound: map<Int as uint32, Int as uint128>;
    evidenceHashByRound: map<Int as uint32, Int as uint256>;
    claimableBySeason: map<Int as uint8, Int as coins>;
    finalizedBySeason: map<Int as uint8, Int as coins>;
    finalizeEvidenceHashBySeason: map<Int as uint8, Int as uint256>;
    pendingFundRoundByQuery: map<Int as uint64, Int as uint32>;
    pendingFundTransferCount: Int as uint16;
    pendingSeasonByQuery: map<Int as uint64, Int as uint8>;
    pendingSeasonAmountByQuery: map<Int as uint64, Int as coins>;

    init(owner: Address, jettonMaster: Address, vaultJettonWallet: Address, claimContract: Address, fundVestingContract: Address) {
        self.owner = owner;
        self.jettonMaster = jettonMaster;
        self.vaultJettonWallet = vaultJettonWallet;
        self.claimContract = claimContract;
        self.fundVestingContract = fundVestingContract;
        self.funded72H = 0;
        self.allocated72H = 0;
        self.userRewardAllocated72H = 0;
        self.fundAllocated72H = 0;
        self.highestRecordedRoundId = 0;
        self.pendingFundTransferCount = 0;
    }

    receive() {}

    receive(msg: SetSeasonVaultJettonWallet) {
        self.requireOwner();
        require(self.funded72H == 0 && self.allocated72H == 0, "wallet locked after funding");
        self.vaultJettonWallet = msg.wallet;
    }

    receive(msg: SetSeasonVaultRoutes) {
        self.requireOwner();
        require(self.funded72H == 0 && self.allocated72H == 0, "routes locked after funding");
        self.claimContract = msg.claimContract;
        self.fundVestingContract = msg.fundVestingContract;
    }

    receive(msg: JettonTransferNotification) {
        require(sender() == self.vaultJettonWallet, "invalid jetton wallet");
        require(msg.amount > 0, "funding must be positive");
        if (msg.sender == self.claimContract) {
            require(self.allocated72H >= msg.amount, "return exceeds allocation");
            require(self.userRewardAllocated72H >= msg.amount, "return exceeds user rewards");
            self.allocated72H -= msg.amount;
            self.userRewardAllocated72H -= msg.amount;
        } else {
            require(self.funded72H + msg.amount <= SEASON_VAULT_TOTAL_ALLOCATION_72H, "season vault overfunded");
            self.funded72H += msg.amount;
        }
    }

    receive(msg: JettonExcesses) {
        require(sender() == self.vaultJettonWallet, "invalid season transfer sender");

        let seasonId = self.pendingSeasonByQuery.get(msg.queryId);
        if (seasonId != null) {
            self.pendingSeasonByQuery.del(msg.queryId);
            self.pendingSeasonAmountByQuery.del(msg.queryId);
        }
    }

    receive(msg: ConfirmSeasonFundTransfer) {
        require(sender() == self.fundVestingContract, "fund vesting only");
        let roundId = self.pendingFundRoundByQuery.get(msg.queryId);
        if (roundId != null) {
            let amount = self.amountByRound.get(roundId!!);
            require(amount != null, "pending round amount missing");
            require(amount!! == msg.amount72H, "invalid fund confirm amount");
            self.pendingFundRoundByQuery.del(msg.queryId);
            if (self.pendingFundTransferCount > 0) {
                self.pendingFundTransferCount -= 1;
            }
        }
    }

    receive(msg: RecordSeasonRound) {
        self.requireOwner();
        require(self.pendingFundTransferCount == 0, "fund transfer pending");
        require(msg.roundId >= 1 && msg.roundId <= SEASON_VAULT_MAX_ROUNDS, "round out of range");
        require(msg.roundId == self.highestRecordedRoundId + 1, "round must be sequential");
        require(!self.amountByRound.exists(msg.roundId), "round already recorded");
        require(msg.endAt > msg.startAt, "invalid round time");
        require(self.allocated72H + SEASON_VAULT_ROUND_AMOUNT_72H <= self.funded72H, "insufficient funded inventory");

        self.allocated72H += SEASON_VAULT_ROUND_AMOUNT_72H;
        self.amountByRound.set(msg.roundId, SEASON_VAULT_ROUND_AMOUNT_72H);
        self.startAtByRound.set(msg.roundId, msg.startAt);
        self.endAtByRound.set(msg.roundId, msg.endAt);
        self.startPriceByRound.set(msg.roundId, msg.startPriceUsd9);
        self.endPriceByRound.set(msg.roundId, msg.endPriceUsd9);
        self.evidenceHashByRound.set(msg.roundId, msg.evidenceHash);
        self.successByRound.set(msg.roundId, msg.success ? 1 : 0);
        if (msg.roundId > self.highestRecordedRoundId) {
            self.highestRecordedRoundId = msg.roundId;
        }

        if (msg.success) {
            self.userRewardAllocated72H += SEASON_VAULT_ROUND_AMOUNT_72H;
            let seasonId = self.seasonIdForRound(msg.roundId);
            let currentClaimable = self.claimableBySeason.get(seasonId);
            let seasonClaimable = currentClaimable == null ? 0 : currentClaimable!!;
            self.claimableBySeason.set(seasonId, seasonClaimable + SEASON_VAULT_ROUND_AMOUNT_72H);
        } else {
            self.fundAllocated72H += SEASON_VAULT_ROUND_AMOUNT_72H;
            self.pendingFundRoundByQuery.set(msg.roundId, msg.roundId);
            self.pendingFundTransferCount += 1;
            self.transferJettons(msg.roundId, SEASON_VAULT_ROUND_AMOUNT_72H, self.fundVestingContract);
        }
    }

    receive(msg: FinalizeSeasonRewards) {
        self.requireOwner();
        require(self.pendingFundTransferCount == 0, "fund transfer pending");
        require(msg.seasonId >= 1 && msg.seasonId <= SEASON_VAULT_MAX_SEASONS, "season out of range");
        require(self.highestRecordedRoundId >= msg.seasonId * SEASON_VAULT_ROUNDS_PER_SEASON, "season not complete");
        require(!self.finalizedBySeason.exists(msg.seasonId), "season finalized");
        require(!self.pendingSeasonByQuery.exists(msg.queryId), "season query exists");

        let amount = self.claimableBySeason.get(msg.seasonId);
        require(amount != null && amount!! > 0, "no successful season rewards");

        self.finalizedBySeason.set(msg.seasonId, amount!!);
        self.finalizeEvidenceHashBySeason.set(msg.seasonId, msg.evidenceHash);
        self.pendingSeasonByQuery.set(msg.queryId, msg.seasonId);
        self.pendingSeasonAmountByQuery.set(msg.queryId, amount!!);
        self.transferJettons(msg.queryId, amount!!, self.claimContract);
    }

    receive(msg: SweepSeasonRemainder) {
        require(sender() == self.claimContract, "claim contract only");
        require(msg.amount72H > 0, "sweep must be positive");
        require(self.allocated72H >= msg.amount72H, "sweep exceeds allocation");
        self.allocated72H -= msg.amount72H;
    }

    bounced(msg: bounced<JettonTransfer>) {
        require(sender() == self.vaultJettonWallet, "invalid bounced sender");
        let seasonId = self.pendingSeasonByQuery.get(msg.queryId);
        if (seasonId != null) {
            let seasonAmount = self.pendingSeasonAmountByQuery.get(msg.queryId);
            require(seasonAmount != null, "pending season amount missing");
            require(seasonAmount!! == msg.amount, "invalid bounced amount");
            self.finalizedBySeason.del(seasonId!!);
            self.finalizeEvidenceHashBySeason.del(seasonId!!);
            self.pendingSeasonByQuery.del(msg.queryId);
            self.pendingSeasonAmountByQuery.del(msg.queryId);
            return;
        }

        let roundId = self.pendingFundRoundByQuery.get(msg.queryId);
        if (roundId != null) {
            let amount = self.amountByRound.get(roundId!!);
            require(amount != null, "pending round amount missing");
            require(amount!! == msg.amount, "invalid bounced amount");
            self.allocated72H -= amount!!;
            self.fundAllocated72H -= amount!!;
            self.amountByRound.del(roundId!!);
            self.startAtByRound.del(roundId!!);
            self.endAtByRound.del(roundId!!);
            self.startPriceByRound.del(roundId!!);
            self.endPriceByRound.del(roundId!!);
            self.evidenceHashByRound.del(roundId!!);
            self.successByRound.del(roundId!!);
            self.pendingFundRoundByQuery.del(msg.queryId);
            if (self.pendingFundTransferCount > 0) {
                self.pendingFundTransferCount -= 1;
            }
            if (self.highestRecordedRoundId == roundId!!) {
                self.highestRecordedRoundId = roundId!! - 1;
            }
        }
    }

    fun transferJettons(queryId: Int, amount72H: Int, destination: Address) {
        send(SendParameters {
            to: self.vaultJettonWallet,
            value: ton("0.08"),
            bounce: true,
            body: JettonTransfer {
                queryId: queryId,
                amount: amount72H,
                destination: destination,
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: ton("0.01"),
                forwardPayload: emptyJettonForwardPayload(),
            }.toCell(),
        });
    }

    fun requireOwner() {
        require(sender() == self.owner, "owner only");
    }

    fun seasonIdForRound(roundId: Int): Int {
        return ((roundId - 1) / SEASON_VAULT_ROUNDS_PER_SEASON) + 1;
    }

    fun roundCategoryAmount(bps: Int): Int {
        return (SEASON_VAULT_ROUND_AMOUNT_72H * bps) / SEASON_VAULT_BPS_DENOMINATOR;
    }

    get fun getRoundAmount72H(): Int {
        return SEASON_VAULT_ROUND_AMOUNT_72H;
    }

    get fun getRoundPersonalDepositAmount72H(): Int {
        return self.roundCategoryAmount(SEASON_VAULT_PERSONAL_DEPOSIT_BPS);
    }

    get fun getRoundTeamDepositAmount72H(): Int {
        return self.roundCategoryAmount(SEASON_VAULT_TEAM_DEPOSIT_BPS);
    }

    get fun getRoundReferralAmount72H(): Int {
        return self.roundCategoryAmount(SEASON_VAULT_REFERRAL_BPS);
    }

    get fun getRoundLeaderboardAmount72H(): Int {
        return self.roundCategoryAmount(SEASON_VAULT_LEADERBOARD_BPS);
    }

    get fun getRoundsPerSeason(): Int {
        return SEASON_VAULT_ROUNDS_PER_SEASON;
    }

    get fun getMaxRounds(): Int {
        return SEASON_VAULT_MAX_ROUNDS;
    }

    get fun getMaxSeasons(): Int {
        return SEASON_VAULT_MAX_SEASONS;
    }

    get fun getFunded72H(): Int {
        return self.funded72H;
    }

    get fun getAllocated72H(): Int {
        return self.allocated72H;
    }

    get fun getUserRewardAllocated72H(): Int {
        return self.userRewardAllocated72H;
    }

    get fun getFundAllocated72H(): Int {
        return self.fundAllocated72H;
    }

    get fun getHighestRecordedRoundId(): Int {
        return self.highestRecordedRoundId;
    }

    get fun isRoundRecorded(roundId: Int): Bool {
        return self.amountByRound.exists(roundId);
    }

    get fun isRoundSuccessful(roundId: Int): Bool {
        let value = self.successByRound.get(roundId);
        return value != null && value!! == 1;
    }

    get fun getRoundAmount(roundId: Int): Int {
        let amount = self.amountByRound.get(roundId);
        return amount == null ? 0 : amount!!;
    }

    get fun getRoundStartPriceUsd9(roundId: Int): Int {
        let value = self.startPriceByRound.get(roundId);
        return value == null ? 0 : value!!;
    }

    get fun getRoundEndPriceUsd9(roundId: Int): Int {
        let value = self.endPriceByRound.get(roundId);
        return value == null ? 0 : value!!;
    }

    get fun getRoundEvidenceHash(roundId: Int): Int {
        let value = self.evidenceHashByRound.get(roundId);
        return value == null ? 0 : value!!;
    }

    get fun getSeasonClaimable72H(seasonId: Int): Int {
        let value = self.claimableBySeason.get(seasonId);
        return value == null ? 0 : value!!;
    }

    get fun getSeasonFinalized72H(seasonId: Int): Int {
        let value = self.finalizedBySeason.get(seasonId);
        return value == null ? 0 : value!!;
    }

    get fun getSeasonFinalizeEvidenceHash(seasonId: Int): Int {
        let value = self.finalizeEvidenceHashBySeason.get(seasonId);
        return value == null ? 0 : value!!;
    }

    get fun getPendingSeasonFinalizeAmount(queryId: Int): Int {
        let value = self.pendingSeasonAmountByQuery.get(queryId);
        return value == null ? 0 : value!!;
    }

    get fun getPendingFundTransferCount(): Int {
        return self.pendingFundTransferCount;
    }
}
