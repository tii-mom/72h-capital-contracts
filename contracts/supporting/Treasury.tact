// Minimal Treasury Tact path.
//
// Scope:
// - legacy owner/admin-only accounting scaffold, not the v1 reward path
// - separates reserve-yield scope from alpha-settlement scope
// - tracks approval, execution, replay nonce, 7-day reserve cadence, and 7-week alpha cadence
//
// Not yet complete:
// - audited Jetton transfer dispatch
// - external multisig callback execution
// - full batch recipient proof encoding

message(0x72040001) FundTreasury {
    amount72H: Int as coins;
}

message(0x72040002) PrepareDistributionBatch {
    batchId: Int as uint32;
    nonce: Int as uint32;
    scope: Int as uint8;
    target: Address;
    amount72H: Int as coins;
    metadataHash: Int as uint256;
}

message(0x72040003) ApproveDistributionBatch {
    batchId: Int as uint32;
}

message(0x72040004) ExecuteDistributionBatch {
    batchId: Int as uint32;
}

message(0x72040005) InvalidateDistributionBatch {
    batchId: Int as uint32;
}

message(0x72040006) SetDistributionPause {
    scope: Int as uint8;
    paused: Bool;
}

contract Treasury {
    owner: Address;
    availableBalance72H: Int as coins;
    reserveClaimIntervalSeconds: Int as uint32;
    alphaSettlementIntervalSeconds: Int as uint32;
    amountByBatch: map<Int as uint32, Int as coins>;
    nonceByBatch: map<Int as uint32, Int as uint32>;
    scopeByBatch: map<Int as uint32, Int as uint8>;
    targetByBatch: map<Int as uint32, Address>;
    metadataHashByBatch: map<Int as uint32, Int as uint256>;
    approvedByBatch: map<Int as uint32, Int as uint8>;
    executedByBatch: map<Int as uint32, Int as uint8>;
    invalidatedByBatch: map<Int as uint32, Int as uint8>;
    processedNonceByBatch: map<Int as uint32, Int as uint32>;
    lastExecutedAtByScope: map<Int as uint8, Int as uint32>;
    pausedByScope: map<Int as uint8, Int as uint8>;

    init(owner: Address) {
        self.owner = owner;
        self.availableBalance72H = 0;
        self.reserveClaimIntervalSeconds = 7 * 24 * 60 * 60;
        self.alphaSettlementIntervalSeconds = 7 * 7 * 24 * 60 * 60;
    }

    receive() {}

    receive(msg: FundTreasury) {
        self.requireOwner();
        require(msg.amount72H > 0, "fund amount must be positive");
        self.availableBalance72H += msg.amount72H;
    }

    receive(msg: PrepareDistributionBatch) {
        self.requireOwner();
        self.requireScope(msg.scope);
        require(msg.amount72H > 0, "batch amount must be positive");
        require(!self.batchExists(msg.batchId), "batch exists");

        self.amountByBatch.set(msg.batchId, msg.amount72H);
        self.nonceByBatch.set(msg.batchId, msg.nonce);
        self.scopeByBatch.set(msg.batchId, msg.scope);
        self.targetByBatch.set(msg.batchId, msg.target);
        self.metadataHashByBatch.set(msg.batchId, msg.metadataHash);
    }

    receive(msg: ApproveDistributionBatch) {
        self.requireOwner();
        self.requireBatch(msg.batchId);
        require(!self.isInvalidated(msg.batchId), "batch invalidated");
        require(!self.isExecuted(msg.batchId), "batch executed");
        self.approvedByBatch.set(msg.batchId, 1);
    }

    receive(msg: ExecuteDistributionBatch) {
        self.requireOwner();
        self.requireBatch(msg.batchId);
        require(self.isApproved(msg.batchId), "batch not approved");
        require(!self.isInvalidated(msg.batchId), "batch invalidated");
        require(!self.isExecuted(msg.batchId), "batch executed");

        let amount = self.amountByBatch.get(msg.batchId);
        let scope = self.scopeByBatch.get(msg.batchId);
        let nonce = self.nonceByBatch.get(msg.batchId);
        require(amount != null, "batch amount missing");
        require(scope != null, "batch scope missing");
        require(nonce != null, "batch nonce missing");
        require(!self.isPaused(scope!!), "scope paused");
        require(self.availableBalance72H >= amount!!, "insufficient treasury balance");

        let processedNonce = self.processedNonceByBatch.get(msg.batchId);
        require(processedNonce == null || processedNonce!! != nonce!!, "batch replay");

        self.requireCadence(scope!!);

        self.availableBalance72H -= amount!!;
        self.executedByBatch.set(msg.batchId, 1);
        self.processedNonceByBatch.set(msg.batchId, nonce!!);
        self.lastExecutedAtByScope.set(scope!!, now());
    }

    receive(msg: InvalidateDistributionBatch) {
        self.requireOwner();
        self.requireBatch(msg.batchId);
        require(!self.isExecuted(msg.batchId), "batch executed");
        self.invalidatedByBatch.set(msg.batchId, 1);
    }

    receive(msg: SetDistributionPause) {
        self.requireOwner();
        self.requireScope(msg.scope);
        self.pausedByScope.set(msg.scope, msg.paused ? 1 : 0);
    }

    fun requireOwner() {
        require(sender() == self.owner, "owner only");
    }

    fun requireScope(scope: Int) {
        require(scope == 1 || scope == 2, "unsupported scope");
    }

    fun requireBatch(batchId: Int) {
        require(self.batchExists(batchId), "batch missing");
    }

    fun batchExists(batchId: Int): Bool {
        return self.amountByBatch.exists(batchId);
    }

    fun requireCadence(scope: Int) {
        let lastExecutedAt = self.lastExecutedAtByScope.get(scope);
        if (lastExecutedAt != null) {
            if (scope == 1) {
                require(now() >= lastExecutedAt!! + self.reserveClaimIntervalSeconds, "reserve cadence not reached");
            } else {
                require(now() >= lastExecutedAt!! + self.alphaSettlementIntervalSeconds, "alpha cadence not reached");
            }
        }
    }

    get fun getOwner(): Address {
        return self.owner;
    }

    get fun getAvailableBalance72H(): Int {
        return self.availableBalance72H;
    }

    get fun getReserveClaimIntervalSeconds(): Int {
        return self.reserveClaimIntervalSeconds;
    }

    get fun getAlphaSettlementIntervalSeconds(): Int {
        return self.alphaSettlementIntervalSeconds;
    }

    get fun isApproved(batchId: Int): Bool {
        let approved = self.approvedByBatch.get(batchId);
        return approved != null && approved!! == 1;
    }

    get fun isExecuted(batchId: Int): Bool {
        let executed = self.executedByBatch.get(batchId);
        return executed != null && executed!! == 1;
    }

    get fun isInvalidated(batchId: Int): Bool {
        let invalidated = self.invalidatedByBatch.get(batchId);
        return invalidated != null && invalidated!! == 1;
    }

    get fun isPaused(scope: Int): Bool {
        let paused = self.pausedByScope.get(scope);
        return paused != null && paused!! == 1;
    }

    get fun getBatchAmount72H(batchId: Int): Int {
        let amount = self.amountByBatch.get(batchId);
        if (amount == null) {
            return 0;
        }
        return amount!!;
    }

    get fun getBatchNonce(batchId: Int): Int {
        let nonce = self.nonceByBatch.get(batchId);
        if (nonce == null) {
            return 0;
        }
        return nonce!!;
    }

    get fun getBatchScope(batchId: Int): Int {
        let scope = self.scopeByBatch.get(batchId);
        if (scope == null) {
            return 0;
        }
        return scope!!;
    }

    get fun getBatchTarget(batchId: Int): Address {
        let target = self.targetByBatch.get(batchId);
        require(target != null, "batch target missing");
        return target!!;
    }

    get fun getBatchMetadataHash(batchId: Int): Int {
        let metadataHash = self.metadataHashByBatch.get(batchId);
        if (metadataHash == null) {
            return 0;
        }
        return metadataHash!!;
    }

    get fun getLastExecutedAt(scope: Int): Int {
        let executedAt = self.lastExecutedAtByScope.get(scope);
        if (executedAt == null) {
            return 0;
        }
        return executedAt!!;
    }
}
