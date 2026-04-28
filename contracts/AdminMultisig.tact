// Minimal AdminMultisig Tact path.
//
// Scope:
// - single administrator signer with 1-of-1 approval threshold
// - operation proposal, approval, execution, cancellation, and emergency metadata
// - replay boundary by operation id + nonce + target hash skeleton
//
// Not yet complete:
// - arbitrary outbound payload execution
// - governed signer rotation implementation
// - audited target-specific digest encoding

message(0x72050001) ProposeOperation {
    operationId: Int as uint32;
    nonce: Int as uint32;
    target: Address;
    scope: Int as uint8;
    payloadHash: Int as uint256;
}

message(0x72050002) ApproveOperation {
    operationId: Int as uint32;
}

message(0x72050003) ExecuteOperation {
    operationId: Int as uint32;
}

message(0x72050004) CancelOperation {
    operationId: Int as uint32;
}

message(0x72050005) SetEmergencyState {
    scope: Int as uint8;
    paused: Bool;
}

contract AdminMultisig {
    signerCount: Int as uint8;
    threshold: Int as uint8;
    signerIndexByAddress: map<Address, Int as uint8>;
    nonceByOperation: map<Int as uint32, Int as uint32>;
    targetByOperation: map<Int as uint32, Address>;
    scopeByOperation: map<Int as uint32, Int as uint8>;
    payloadHashByOperation: map<Int as uint32, Int as uint256>;
    approvalsByOperation: map<Int as uint32, Int as uint8>;
    executedByOperation: map<Int as uint32, Int as uint8>;
    cancelledByOperation: map<Int as uint32, Int as uint8>;
    approvedByOperationSigner: map<Int as uint32, Int as uint8>;
    executedNonceByOperation: map<Int as uint32, Int as uint32>;
    emergencyPausedByScope: map<Int as uint8, Int as uint8>;

    init(admin: Address) {
        self.signerCount = 1;
        self.threshold = 1;
        self.signerIndexByAddress.set(admin, 1);
    }

    receive() {}

    receive(msg: ProposeOperation) {
        let signerIndex = self.requireSigner();
        self.requireScope(msg.scope);
        require(!self.operationExists(msg.operationId), "operation exists");

        self.nonceByOperation.set(msg.operationId, msg.nonce);
        self.targetByOperation.set(msg.operationId, msg.target);
        self.scopeByOperation.set(msg.operationId, msg.scope);
        self.payloadHashByOperation.set(msg.operationId, msg.payloadHash);
        self.approvalsByOperation.set(msg.operationId, 1);
        self.approvedByOperationSigner.set(self.approvalKey(msg.operationId, signerIndex), 1);
    }

    receive(msg: ApproveOperation) {
        let signerIndex = self.requireSigner();
        self.requireOperation(msg.operationId);
        require(!self.isCancelled(msg.operationId), "operation cancelled");
        require(!self.isExecuted(msg.operationId), "operation executed");

        let key = self.approvalKey(msg.operationId, signerIndex);
        require(!self.approvedByOperationSigner.exists(key), "already approved");

        self.approvedByOperationSigner.set(key, 1);
        self.approvalsByOperation.set(msg.operationId, self.getApprovalCount(msg.operationId) + 1);
    }

    receive(msg: ExecuteOperation) {
        self.requireSigner();
        self.requireOperation(msg.operationId);
        require(!self.isCancelled(msg.operationId), "operation cancelled");
        require(!self.isExecuted(msg.operationId), "operation executed");
        require(self.getApprovalCount(msg.operationId) >= self.threshold, "threshold not met");

        let nonce = self.nonceByOperation.get(msg.operationId);
        require(nonce != null, "operation nonce missing");
        let executedNonce = self.executedNonceByOperation.get(msg.operationId);
        require(executedNonce == null || executedNonce!! != nonce!!, "operation replay");

        self.executedByOperation.set(msg.operationId, 1);
        self.executedNonceByOperation.set(msg.operationId, nonce!!);
    }

    receive(msg: CancelOperation) {
        self.requireSigner();
        self.requireOperation(msg.operationId);
        require(!self.isExecuted(msg.operationId), "operation executed");
        self.cancelledByOperation.set(msg.operationId, 1);
    }

    receive(msg: SetEmergencyState) {
        self.requireSigner();
        self.requireScope(msg.scope);
        self.emergencyPausedByScope.set(msg.scope, msg.paused ? 1 : 0);
    }

    fun requireSigner(): Int {
        let signerIndex = self.signerIndexByAddress.get(sender());
        require(signerIndex != null, "signer only");
        return signerIndex!!;
    }

    fun requireScope(scope: Int) {
        require(scope >= 1 && scope <= 4, "unsupported scope");
    }

    fun requireOperation(operationId: Int) {
        require(self.operationExists(operationId), "operation missing");
    }

    fun operationExists(operationId: Int): Bool {
        return self.nonceByOperation.exists(operationId);
    }

    fun approvalKey(operationId: Int, signerIndex: Int): Int {
        return (operationId * 10) + signerIndex;
    }

    get fun getSignerCount(): Int {
        return self.signerCount;
    }

    get fun getThreshold(): Int {
        return self.threshold;
    }

    get fun isSigner(account: Address): Bool {
        return self.signerIndexByAddress.exists(account);
    }

    get fun getApprovalCount(operationId: Int): Int {
        let approvals = self.approvalsByOperation.get(operationId);
        if (approvals == null) {
            return 0;
        }
        return approvals!!;
    }

    get fun isExecuted(operationId: Int): Bool {
        let executed = self.executedByOperation.get(operationId);
        return executed != null && executed!! == 1;
    }

    get fun isCancelled(operationId: Int): Bool {
        let cancelled = self.cancelledByOperation.get(operationId);
        return cancelled != null && cancelled!! == 1;
    }

    get fun isEmergencyPaused(scope: Int): Bool {
        let paused = self.emergencyPausedByScope.get(scope);
        return paused != null && paused!! == 1;
    }

    get fun getOperationNonce(operationId: Int): Int {
        let nonce = self.nonceByOperation.get(operationId);
        if (nonce == null) {
            return 0;
        }
        return nonce!!;
    }

    get fun getOperationTarget(operationId: Int): Address {
        let target = self.targetByOperation.get(operationId);
        require(target != null, "operation target missing");
        return target!!;
    }

    get fun getOperationScope(operationId: Int): Int {
        let scope = self.scopeByOperation.get(operationId);
        if (scope == null) {
            return 0;
        }
        return scope!!;
    }

    get fun getOperationPayloadHash(operationId: Int): Int {
        let payloadHash = self.payloadHashByOperation.get(operationId);
        if (payloadHash == null) {
            return 0;
        }
        return payloadHash!!;
    }
}
