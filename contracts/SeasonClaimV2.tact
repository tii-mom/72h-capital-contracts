import "./TestJetton.tact";

const SEASON_CLAIM_BPS_DENOMINATOR: Int = 10000;
const SEASON_CLAIM_STAGE_ONE_BPS: Int = 2000;
const SEASON_CLAIM_STAGE_TWO_BPS: Int = 4000;
const SEASON_CLAIM_STAGE_THREE_BPS: Int = 6000;
const SEASON_CLAIM_STAGE_FOUR_BPS: Int = 8000;
const SEASON_CLAIM_STAGE_FIVE_BPS: Int = 10000;
const SEASON_CLAIM_STAGE_ONE_PRICE_USD9: Int = 10000000;
const SEASON_CLAIM_STAGE_TWO_PRICE_USD9: Int = 30000000;
const SEASON_CLAIM_STAGE_THREE_PRICE_USD9: Int = 50000000;
const SEASON_CLAIM_STAGE_FOUR_PRICE_USD9: Int = 70000000;
const SEASON_CLAIM_STAGE_FIVE_PRICE_USD9: Int = 100000000;
const SEASON_CLAIM_PRICE_HOLD_SECONDS: Int = 72 * 60 * 60;
const SEASON_CLAIM_CLAIM_WINDOW_SECONDS: Int = 60 * 24 * 60 * 60;
const SEASON_CLAIM_BOUNCE_GRACE_SECONDS: Int = 72 * 60 * 60;
const SEASON_CLAIM_SWEEP_QUERY_OFFSET: Int = 7207000600000000;
const SEASON_CLAIM_MULTI_MILLIONAIRE_APP_ID: Int = 1;
const SEASON_CLAIM_MAX_SEASONS: Int = 10;
const SEASON_CLAIM_PERSONAL_DEPOSIT_BPS: Int = 5000;
const SEASON_CLAIM_TEAM_DEPOSIT_BPS: Int = 2500;
const SEASON_CLAIM_REFERRAL_BPS: Int = 1500;
const SEASON_CLAIM_LEADERBOARD_BPS: Int = 1000;

asm fun seasonClaimCellHash(cell: Cell): Int { HASHCU }

message(0x72070001) SetSeasonClaimJettonWallet {
    wallet: Address;
}

message(0x72070007) SetSeasonClaimSeasonVault {
    seasonVault: Address;
}

message(0x72070002) RegisterClaimRound {
    roundId: Int as uint32;
    merkleRoot: Int as uint256;
    totalAmount72H: Int as coins;
    openAt: Int as uint32;
    evidenceHash: Int as uint256;
}

message(0x72070009) RegisterSeasonClaim {
    seasonId: Int as uint8;
    merkleRoot: Int as uint256;
    totalAmount72H: Int as coins;
    personalDepositTotal72H: Int as coins;
    teamDepositTotal72H: Int as coins;
    referralTotal72H: Int as coins;
    leaderboardTotal72H: Int as coins;
    openAt: Int as uint32;
    evidenceHash: Int as uint256;
}

message(0x72070003) UnlockClaimStage {
    stage: Int as uint8;
    priceUsd9: Int as uint128;
    observedAt: Int as uint32;
    evidenceHash: Int as uint256;
}

message(0x72070004) ClaimSeasonReward {
    queryId: Int as uint64;
    seasonId: Int as uint8;
    personalDepositAmount72H: Int as coins;
    teamDepositAmount72H: Int as coins;
    referralAmount72H: Int as coins;
    leaderboardAmount72H: Int as coins;
    proof: Cell;
}

message(0x72070006) SweepExpiredClaimRound {
    roundId: Int as uint32;
}

message(0x7207000a) SweepExpiredSeasonClaim {
    seasonId: Int as uint8;
}

message(0x72070008) SettleSeasonClaimPending {
    queryId: Int as uint64;
}

contract SeasonClaimV2 {
    owner: Address;
    jettonMaster: Address;
    claimJettonWallet: Address;
    seasonVault: Address;
    funded72H: Int as coins;
    reserved72H: Int as coins;
    claimed72H: Int as coins;
    swept72H: Int as coins;
    unlockedBps: Int as uint16;
    merkleRootByRound: map<Int as uint32, Int as uint256>;
    totalByRound: map<Int as uint32, Int as coins>;
    personalDepositTotalBySeason: map<Int as uint8, Int as coins>;
    teamDepositTotalBySeason: map<Int as uint8, Int as coins>;
    referralTotalBySeason: map<Int as uint8, Int as coins>;
    leaderboardTotalBySeason: map<Int as uint8, Int as coins>;
    claimedByRound: map<Int as uint32, Int as coins>;
    sweptByRound: map<Int as uint32, Int as coins>;
    openAtByRound: map<Int as uint32, Int as uint32>;
    evidenceHashByRound: map<Int as uint32, Int as uint256>;
    claimedByLeaf: map<Int as uint256, Int as coins>;
    pendingLeafByQuery: map<Int as uint64, Int as uint256>;
    pendingRoundByQuery: map<Int as uint64, Int as uint32>;
    pendingAmountByQuery: map<Int as uint64, Int as coins>;
    pendingClaimOpenedAtByQuery: map<Int as uint64, Int as uint32>;
    pendingClaimAmountByRound: map<Int as uint32, Int as coins>;
    pendingSweepRoundByQuery: map<Int as uint64, Int as uint32>;
    pendingSweepAmountByQuery: map<Int as uint64, Int as coins>;

    init(owner: Address, jettonMaster: Address, claimJettonWallet: Address, seasonVault: Address) {
        self.owner = owner;
        self.jettonMaster = jettonMaster;
        self.claimJettonWallet = claimJettonWallet;
        self.seasonVault = seasonVault;
        self.funded72H = 0;
        self.reserved72H = 0;
        self.claimed72H = 0;
        self.swept72H = 0;
        self.unlockedBps = 0;
    }

    receive() {}

    receive(msg: SetSeasonClaimJettonWallet) {
        self.requireOwner();
        require(self.funded72H == 0 && self.reserved72H == 0 && self.claimed72H == 0 && self.swept72H == 0, "wallet locked after funding");
        self.claimJettonWallet = msg.wallet;
    }

    receive(msg: SetSeasonClaimSeasonVault) {
        self.requireOwner();
        require(self.funded72H == 0 && self.reserved72H == 0 && self.claimed72H == 0 && self.swept72H == 0, "season vault locked after funding");
        self.seasonVault = msg.seasonVault;
    }

    receive(msg: JettonTransferNotification) {
        require(sender() == self.claimJettonWallet, "invalid jetton wallet");
        require(msg.amount > 0, "funding must be positive");
        require(msg.sender == self.seasonVault, "season vault funding only");
        self.funded72H += msg.amount;
    }

    receive(msg: RegisterClaimRound) {
        require(false, "use season claim");
    }

    receive(msg: RegisterSeasonClaim) {
        self.requireOwner();
        require(msg.seasonId >= 1 && msg.seasonId <= SEASON_CLAIM_MAX_SEASONS, "season out of range");
        require(!self.merkleRootByRound.exists(msg.seasonId), "season root exists");
        require(msg.merkleRoot > 0, "root missing");
        require(msg.totalAmount72H > 0, "amount missing");
        require(
            msg.personalDepositTotal72H + msg.teamDepositTotal72H + msg.referralTotal72H + msg.leaderboardTotal72H == msg.totalAmount72H,
            "category total mismatch",
        );
        require(msg.personalDepositTotal72H == self.expectedCategoryTotal(msg.totalAmount72H, SEASON_CLAIM_PERSONAL_DEPOSIT_BPS), "personal total mismatch");
        require(msg.teamDepositTotal72H == self.expectedCategoryTotal(msg.totalAmount72H, SEASON_CLAIM_TEAM_DEPOSIT_BPS), "team total mismatch");
        require(msg.referralTotal72H == self.expectedCategoryTotal(msg.totalAmount72H, SEASON_CLAIM_REFERRAL_BPS), "referral total mismatch");
        require(msg.leaderboardTotal72H == self.expectedCategoryTotal(msg.totalAmount72H, SEASON_CLAIM_LEADERBOARD_BPS), "leaderboard total mismatch");
        require(self.reserved72H + msg.totalAmount72H <= self.funded72H, "insufficient claim funding");

        self.merkleRootByRound.set(msg.seasonId, msg.merkleRoot);
        self.totalByRound.set(msg.seasonId, msg.totalAmount72H);
        self.personalDepositTotalBySeason.set(msg.seasonId, msg.personalDepositTotal72H);
        self.teamDepositTotalBySeason.set(msg.seasonId, msg.teamDepositTotal72H);
        self.referralTotalBySeason.set(msg.seasonId, msg.referralTotal72H);
        self.leaderboardTotalBySeason.set(msg.seasonId, msg.leaderboardTotal72H);
        self.openAtByRound.set(msg.seasonId, msg.openAt);
        self.evidenceHashByRound.set(msg.seasonId, msg.evidenceHash);
        self.reserved72H += msg.totalAmount72H;
    }

    receive(msg: UnlockClaimStage) {
        self.requireOwner();
        require(now() >= msg.observedAt + SEASON_CLAIM_PRICE_HOLD_SECONDS, "price hold window not met");
        if (msg.stage == 1) {
            require(msg.priceUsd9 >= SEASON_CLAIM_STAGE_ONE_PRICE_USD9, "stage one price not met");
            require(self.unlockedBps < SEASON_CLAIM_STAGE_ONE_BPS, "stage already unlocked");
            self.unlockedBps = SEASON_CLAIM_STAGE_ONE_BPS;
        } else if (msg.stage == 2) {
            require(msg.priceUsd9 >= SEASON_CLAIM_STAGE_TWO_PRICE_USD9, "stage two price not met");
            require(self.unlockedBps < SEASON_CLAIM_STAGE_TWO_BPS, "stage already unlocked");
            self.unlockedBps = SEASON_CLAIM_STAGE_TWO_BPS;
        } else if (msg.stage == 3) {
            require(msg.priceUsd9 >= SEASON_CLAIM_STAGE_THREE_PRICE_USD9, "stage three price not met");
            require(self.unlockedBps < SEASON_CLAIM_STAGE_THREE_BPS, "stage already unlocked");
            self.unlockedBps = SEASON_CLAIM_STAGE_THREE_BPS;
        } else if (msg.stage == 4) {
            require(msg.priceUsd9 >= SEASON_CLAIM_STAGE_FOUR_PRICE_USD9, "stage four price not met");
            require(self.unlockedBps < SEASON_CLAIM_STAGE_FOUR_BPS, "stage already unlocked");
            self.unlockedBps = SEASON_CLAIM_STAGE_FOUR_BPS;
        } else {
            require(msg.stage == 5, "unsupported stage");
            require(msg.priceUsd9 >= SEASON_CLAIM_STAGE_FIVE_PRICE_USD9, "stage five price not met");
            require(self.unlockedBps < SEASON_CLAIM_STAGE_FIVE_BPS, "stage already unlocked");
            self.unlockedBps = SEASON_CLAIM_STAGE_FIVE_BPS;
        }
    }

    receive(msg: ClaimSeasonReward) {
        require(self.unlockedBps > 0, "claims locked");
        require(self.merkleRootByRound.exists(msg.seasonId), "season root missing");
        let totalAllocation72H = msg.personalDepositAmount72H + msg.teamDepositAmount72H + msg.referralAmount72H + msg.leaderboardAmount72H;
        require(totalAllocation72H > 0, "allocation missing");
        require(msg.queryId < SEASON_CLAIM_SWEEP_QUERY_OFFSET, "claim query reserved");
        require(!self.pendingLeafByQuery.exists(msg.queryId), "query pending");

        let openAt = self.openAtByRound.get(msg.seasonId);
        require(openAt != null, "claim open time missing");
        require(now() >= openAt!!, "claim not open");
        require(now() <= openAt!! + SEASON_CLAIM_CLAIM_WINDOW_SECONDS, "claim expired");

        let leafHash = self.leafHash(
            msg.seasonId,
            sender(),
            msg.personalDepositAmount72H,
            msg.teamDepositAmount72H,
            msg.referralAmount72H,
            msg.leaderboardAmount72H,
        );
        let expectedRoot = self.merkleRootByRound.get(msg.seasonId);
        require(expectedRoot != null, "root missing");
        require(self.verifyProof(leafHash, msg.proof) == expectedRoot!!, "invalid proof");

        let alreadyClaimed = self.claimedByLeaf.get(leafHash);
        let claimedSoFar = alreadyClaimed == null ? 0 : alreadyClaimed!!;
        let unlockedAmount = (totalAllocation72H * self.unlockedBps) / SEASON_CLAIM_BPS_DENOMINATOR;
        require(unlockedAmount > claimedSoFar, "nothing unlocked");
        let claimAmount = unlockedAmount - claimedSoFar;
        require(self.claimed72H + claimAmount <= self.reserved72H, "claim reserve underflow");

        self.pendingLeafByQuery.set(msg.queryId, leafHash);
        self.pendingRoundByQuery.set(msg.queryId, msg.seasonId);
        self.pendingAmountByQuery.set(msg.queryId, claimAmount);
        self.pendingClaimOpenedAtByQuery.set(msg.queryId, now());
        self.addPendingClaimAmount(msg.seasonId, claimAmount);
        self.applyClaim(leafHash, msg.seasonId, claimAmount);

        send(SendParameters {
            to: self.claimJettonWallet,
            value: ton("0.08"),
            bounce: true,
            body: JettonTransfer {
                queryId: msg.queryId,
                amount: claimAmount,
                destination: sender(),
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: 0,
                forwardPayload: emptyJettonForwardPayload(),
            }.toCell(),
        });
    }

    receive(msg: JettonExcesses) {
        // Standard V2 recipient Jetton wallets can emit excesses, but they
        // are not authenticated success proofs. Claim accounting is committed
        // before dispatch and only a bounced source-wallet transfer can roll it
        // back.
    }

    receive(msg: SettleSeasonClaimPending) {
        self.requireOwner();
        let leaf = self.pendingLeafByQuery.get(msg.queryId);
        require(leaf != null, "pending claim missing");
        let amount = self.pendingAmountByQuery.get(msg.queryId);
        let roundId = self.pendingRoundByQuery.get(msg.queryId);
        let openedAt = self.pendingClaimOpenedAtByQuery.get(msg.queryId);
        require(amount != null && roundId != null && openedAt != null, "pending claim incomplete");
        require(now() > openedAt!! + SEASON_CLAIM_BOUNCE_GRACE_SECONDS, "claim bounce grace");
        self.clearPendingClaim(msg.queryId, roundId!!, amount!!);
    }

    receive(msg: SweepExpiredClaimRound) {
        require(false, "use season sweep");
    }

    receive(msg: SweepExpiredSeasonClaim) {
        self.requireOwner();
        let total = self.totalByRound.get(msg.seasonId);
        require(total != null, "season missing");
        let openAt = self.openAtByRound.get(msg.seasonId);
        require(openAt != null, "claim open missing");
        require(now() > openAt!! + SEASON_CLAIM_CLAIM_WINDOW_SECONDS + SEASON_CLAIM_BOUNCE_GRACE_SECONDS, "claim still open");
        let pendingClaimAmount = self.pendingClaimAmountByRound.get(msg.seasonId);
        require(pendingClaimAmount == null || pendingClaimAmount!! == 0, "claims pending");
        require(!self.sweptByRound.exists(msg.seasonId), "season swept");

        let claimed = self.claimedByRound.get(msg.seasonId);
        let claimedAmount = claimed == null ? 0 : claimed!!;
        let unclaimed = total!! - claimedAmount;
        require(unclaimed > 0, "nothing to sweep");
        let sweepQueryId = SEASON_CLAIM_SWEEP_QUERY_OFFSET + msg.seasonId;
        require(!self.pendingSweepRoundByQuery.exists(sweepQueryId), "sweep pending");
        self.sweptByRound.set(msg.seasonId, unclaimed);
        self.swept72H += unclaimed;
        self.reserved72H -= unclaimed;
        self.pendingSweepRoundByQuery.set(sweepQueryId, msg.seasonId);
        self.pendingSweepAmountByQuery.set(sweepQueryId, unclaimed);

        send(SendParameters {
            to: self.claimJettonWallet,
            value: ton("0.08"),
            bounce: true,
            body: JettonTransfer {
                queryId: sweepQueryId,
                amount: unclaimed,
                destination: self.seasonVault,
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: ton("0.01"),
                forwardPayload: emptyJettonForwardPayload(),
            }.toCell(),
        });
    }

    bounced(msg: bounced<JettonTransfer>) {
        require(sender() == self.claimJettonWallet, "invalid bounced sender");
        let leaf = self.pendingLeafByQuery.get(msg.queryId);
        if (leaf != null) {
            let amount = self.pendingAmountByQuery.get(msg.queryId);
            let roundId = self.pendingRoundByQuery.get(msg.queryId);
            if (amount != null && roundId != null && amount!! == msg.amount) {
                self.rollbackClaim(leaf!!, roundId!!, amount!!);
                self.clearPendingClaim(msg.queryId, roundId!!, amount!!);
            }
        }
        let sweepRound = self.pendingSweepRoundByQuery.get(msg.queryId);
        if (sweepRound != null) {
            let sweepAmount = self.pendingSweepAmountByQuery.get(msg.queryId);
            require(sweepAmount != null, "pending sweep amount missing");
            require(sweepAmount!! == msg.amount, "invalid bounced amount");
            self.swept72H -= sweepAmount!!;
            self.reserved72H += sweepAmount!!;
            self.sweptByRound.del(sweepRound!!);
            self.pendingSweepRoundByQuery.del(msg.queryId);
            self.pendingSweepAmountByQuery.del(msg.queryId);
        }
    }

    fun expectedCategoryTotal(totalAmount72H: Int, bps: Int): Int {
        return (totalAmount72H * bps) / SEASON_CLAIM_BPS_DENOMINATOR;
    }

    fun addPendingClaimAmount(seasonId: Int, amount: Int) {
        let current = self.pendingClaimAmountByRound.get(seasonId);
        let currentAmount = current == null ? 0 : current!!;
        self.pendingClaimAmountByRound.set(seasonId, currentAmount + amount);
    }

    fun clearPendingClaim(queryId: Int, seasonId: Int, amount: Int) {
        let current = self.pendingClaimAmountByRound.get(seasonId);
        if (current != null) {
            if (current!! > amount) {
                self.pendingClaimAmountByRound.set(seasonId, current!! - amount);
            } else {
                self.pendingClaimAmountByRound.del(seasonId);
            }
        }
        self.pendingLeafByQuery.del(queryId);
        self.pendingRoundByQuery.del(queryId);
        self.pendingAmountByQuery.del(queryId);
        self.pendingClaimOpenedAtByQuery.del(queryId);
    }

    fun applyClaim(leaf: Int, seasonId: Int, amount: Int) {
        let currentClaimed = self.claimedByLeaf.get(leaf);
        let leafClaimed = currentClaimed == null ? 0 : currentClaimed!!;
        self.claimedByLeaf.set(leaf, leafClaimed + amount);

        let roundClaimed = self.claimedByRound.get(seasonId);
        let roundClaimedAmount = roundClaimed == null ? 0 : roundClaimed!!;
        self.claimedByRound.set(seasonId, roundClaimedAmount + amount);

        self.claimed72H += amount;
    }

    fun rollbackClaim(leaf: Int, seasonId: Int, amount: Int) {
        let currentClaimed = self.claimedByLeaf.get(leaf);
        if (currentClaimed != null) {
            if (currentClaimed!! > amount) {
                self.claimedByLeaf.set(leaf, currentClaimed!! - amount);
            } else {
                self.claimedByLeaf.del(leaf);
            }
        }

        let roundClaimed = self.claimedByRound.get(seasonId);
        if (roundClaimed != null) {
            if (roundClaimed!! > amount) {
                self.claimedByRound.set(seasonId, roundClaimed!! - amount);
            } else {
                self.claimedByRound.del(seasonId);
            }
        }

        if (self.claimed72H > amount) {
            self.claimed72H -= amount;
        } else {
            self.claimed72H = 0;
        }
    }

    fun leafHash(
        seasonId: Int,
        account: Address,
        personalDepositAmount72H: Int,
        teamDepositAmount72H: Int,
        referralAmount72H: Int,
        leaderboardAmount72H: Int,
    ): Int {
        let totalAmount72H = personalDepositAmount72H + teamDepositAmount72H + referralAmount72H + leaderboardAmount72H;
        let domainCell = beginCell()
            .storeAddress(self.jettonMaster)
            .storeAddress(myAddress())
            .endCell();
        let allocationCell = beginCell()
            .storeUint(seasonId, 8)
            .storeAddress(account)
            .storeCoins(personalDepositAmount72H)
            .storeCoins(teamDepositAmount72H)
            .storeCoins(referralAmount72H)
            .storeCoins(leaderboardAmount72H)
            .storeCoins(totalAmount72H)
            .endCell();

        return seasonClaimCellHash(beginCell()
            .storeUint(SEASON_CLAIM_MULTI_MILLIONAIRE_APP_ID, 32)
            .storeRef(domainCell)
            .storeRef(allocationCell)
            .endCell());
    }

    fun hashPair(left: Int, right: Int): Int {
        return seasonClaimCellHash(beginCell()
            .storeUint(left, 256)
            .storeUint(right, 256)
            .endCell());
    }

    fun verifyProof(leaf: Int, proof: Cell): Int {
        let cursor = proof.asSlice();
        let current = leaf;
        let done = false;
        while (!done) {
            while (cursor.bits() >= 257) {
                let siblingOnLeft = cursor.loadBool();
                let sibling = cursor.loadUint(256);
                if (siblingOnLeft) {
                    current = self.hashPair(sibling, current);
                } else {
                    current = self.hashPair(current, sibling);
                }
            }
            require(cursor.bits() == 0, "invalid proof bits");
            if (cursor.refs() == 0) {
                done = true;
            } else {
                require(cursor.refs() == 1, "invalid proof refs");
                cursor = cursor.loadRef().asSlice();
            }
        }
        return current;
    }

    fun requireOwner() {
        require(sender() == self.owner, "owner only");
    }

    get fun getUnlockedBps(): Int {
        return self.unlockedBps;
    }

    get fun getRewardAppId(): Int {
        return SEASON_CLAIM_MULTI_MILLIONAIRE_APP_ID;
    }

    get fun getPersonalDepositBps(): Int {
        return SEASON_CLAIM_PERSONAL_DEPOSIT_BPS;
    }

    get fun getTeamDepositBps(): Int {
        return SEASON_CLAIM_TEAM_DEPOSIT_BPS;
    }

    get fun getReferralBps(): Int {
        return SEASON_CLAIM_REFERRAL_BPS;
    }

    get fun getLeaderboardBps(): Int {
        return SEASON_CLAIM_LEADERBOARD_BPS;
    }

    get fun getFunded72H(): Int {
        return self.funded72H;
    }

    get fun getReserved72H(): Int {
        return self.reserved72H;
    }

    get fun getClaimed72H(): Int {
        return self.claimed72H;
    }

    get fun getRoundRoot(roundId: Int): Int {
        let value = self.merkleRootByRound.get(roundId);
        return value == null ? 0 : value!!;
    }

    get fun getSeasonRoot(seasonId: Int): Int {
        return self.getRoundRoot(seasonId);
    }

    get fun getRoundTotal(roundId: Int): Int {
        let value = self.totalByRound.get(roundId);
        return value == null ? 0 : value!!;
    }

    get fun getSeasonTotal(seasonId: Int): Int {
        return self.getRoundTotal(seasonId);
    }

    get fun getSeasonPersonalDepositTotal(seasonId: Int): Int {
        let value = self.personalDepositTotalBySeason.get(seasonId);
        return value == null ? 0 : value!!;
    }

    get fun getSeasonTeamDepositTotal(seasonId: Int): Int {
        let value = self.teamDepositTotalBySeason.get(seasonId);
        return value == null ? 0 : value!!;
    }

    get fun getSeasonReferralTotal(seasonId: Int): Int {
        let value = self.referralTotalBySeason.get(seasonId);
        return value == null ? 0 : value!!;
    }

    get fun getSeasonLeaderboardTotal(seasonId: Int): Int {
        let value = self.leaderboardTotalBySeason.get(seasonId);
        return value == null ? 0 : value!!;
    }

    get fun getRoundClaimed(roundId: Int): Int {
        let value = self.claimedByRound.get(roundId);
        return value == null ? 0 : value!!;
    }

    get fun getSeasonClaimed(seasonId: Int): Int {
        return self.getRoundClaimed(seasonId);
    }

    get fun getClaimedByLeaf(leaf: Int): Int {
        let value = self.claimedByLeaf.get(leaf);
        return value == null ? 0 : value!!;
    }

    get fun getPendingClaimAmount(queryId: Int): Int {
        let value = self.pendingAmountByQuery.get(queryId);
        return value == null ? 0 : value!!;
    }

    get fun getPendingClaimOpenedAt(queryId: Int): Int {
        let value = self.pendingClaimOpenedAtByQuery.get(queryId);
        return value == null ? 0 : value!!;
    }

    get fun getPendingClaimAmountByRound(roundId: Int): Int {
        let value = self.pendingClaimAmountByRound.get(roundId);
        return value == null ? 0 : value!!;
    }

    get fun getPendingClaimAmountBySeason(seasonId: Int): Int {
        return self.getPendingClaimAmountByRound(seasonId);
    }

    get fun getClaimWindowSeconds(): Int {
        return SEASON_CLAIM_CLAIM_WINDOW_SECONDS;
    }

    get fun getBounceGraceSeconds(): Int {
        return SEASON_CLAIM_BOUNCE_GRACE_SECONDS;
    }
}
