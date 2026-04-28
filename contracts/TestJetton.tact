// TestJetton72H standard-compatible testnet Jetton boundary.
//
// Scope:
// - testnet-only 72H rehearsal token
// - master/wallet split compatible with the standard Jetton transfer flow
// - owner-only mint for controlled testnet liquidity
// - wallet transfer emits transfer_notification#7362d09c when forward_ton_amount > 0
//
// Not production:
// - metadata content is intentionally minimal
// - must never be referenced by mainnet manifests

message(0x72000001) MintTest72H {
    to: Address;
    amount72H: Int as coins;
}

message(0x0f8a7ea5) JettonTransfer {
    queryId: Int as uint64;
    amount: Int as coins;
    destination: Address;
    responseDestination: Address;
    customPayload: Cell?;
    forwardTonAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

message(0x178d4519) JettonInternalTransfer {
    queryId: Int as uint64;
    amount: Int as coins;
    from: Address;
    responseAddress: Address;
    forwardTonAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

message(0x7362d09c) JettonTransferNotification {
    queryId: Int as uint64;
    amount: Int as coins;
    sender: Address;
    forwardPayload: Slice as remaining;
}

message(0xd53276db) JettonExcesses {
    queryId: Int as uint64;
}

message(0x72060006) ConfirmSeasonFundTransfer {
    queryId: Int as uint64;
    amount72H: Int as coins;
}

message(0x7207000b) ConfirmSeasonClaimFunding {
    queryId: Int as uint64;
    amount72H: Int as coins;
}

message(0x595f07bc) JettonBurn {
    queryId: Int as uint64;
    amount: Int as coins;
    responseDestination: Address;
    customPayload: Cell?;
}

message(0x7bdd97de) JettonBurnNotification {
    queryId: Int as uint64;
    amount: Int as coins;
    owner: Address;
    responseDestination: Address;
}

fun emptyJettonForwardPayload(): Slice {
    return beginCell().storeBit(false).endCell().asSlice();
}

struct JettonData {
    totalSupply: Int as coins;
    mintable: Bool;
    adminAddress: Address;
    jettonContent: Cell;
    jettonWalletCode: Cell;
}

struct JettonWalletData {
    balance: Int as coins;
    ownerAddress: Address;
    jettonMasterAddress: Address;
    jettonWalletCode: Cell;
}

contract TestJetton72H {
    owner: Address;
    totalSupply72H: Int as coins;

    init(owner: Address) {
        self.owner = owner;
        self.totalSupply72H = 0;
    }

    receive() {}

    receive(msg: MintTest72H) {
        self.requireOwner();
        require(msg.amount72H > 0, "mint must be positive");

        self.totalSupply72H += msg.amount72H;

        let walletState = initOf TestJetton72HWallet(myAddress(), msg.to);
        send(SendParameters {
            to: contractAddress(walletState),
            value: ton("0.05"),
            code: walletState.code,
            data: walletState.data,
            bounce: true,
            body: JettonInternalTransfer {
                queryId: 0,
                amount: msg.amount72H,
                from: self.owner,
                responseAddress: self.owner,
                forwardTonAmount: 0,
                forwardPayload: emptyCell().asSlice(),
            }.toCell(),
        });
    }

    receive(msg: JettonBurnNotification) {
        let expectedWallet = self.getWalletAddressInternal(msg.owner);
        require(sender() == expectedWallet, "invalid burn sender");
        require(msg.amount > 0, "burn must be positive");

        self.totalSupply72H -= msg.amount;

        send(SendParameters {
            to: msg.responseDestination,
            value: ton("0.01"),
            bounce: false,
            body: JettonExcesses { queryId: msg.queryId }.toCell(),
        });
    }

    fun requireOwner() {
        require(sender() == self.owner, "owner only");
    }

    fun getWalletAddressInternal(owner: Address): Address {
        let walletState = initOf TestJetton72HWallet(myAddress(), owner);
        return contractAddress(walletState);
    }

    get fun getOwner(): Address {
        return self.owner;
    }

    get fun getSymbolHash(): Int {
        return 0x373248;
    }

    get fun getDecimals(): Int {
        return 9;
    }

    get fun getTotalSupply72H(): Int {
        return self.totalSupply72H;
    }

    get fun get_wallet_address(owner: Address): Address {
        return self.getWalletAddressInternal(owner);
    }

    get fun get_jetton_data(): JettonData {
        let walletState = initOf TestJetton72HWallet(myAddress(), self.owner);
        return JettonData {
            totalSupply: self.totalSupply72H,
            mintable: true,
            adminAddress: self.owner,
            jettonContent: emptyCell(),
            jettonWalletCode: walletState.code,
        };
    }
}

contract TestJetton72HWallet {
    master: Address;
    owner: Address;
    balance: Int as coins;

    init(master: Address, owner: Address) {
        self.master = master;
        self.owner = owner;
        self.balance = 0;
    }

    receive() {}

    receive(msg: JettonTransfer) {
        require(sender() == self.owner, "wallet owner only");
        require(msg.amount > 0, "transfer must be positive");
        require(self.balance >= msg.amount, "insufficient balance");

        self.balance -= msg.amount;

        let destinationWalletState = initOf TestJetton72HWallet(self.master, msg.destination);
        send(SendParameters {
            to: contractAddress(destinationWalletState),
            value: msg.forwardTonAmount + ton("0.04"),
            code: destinationWalletState.code,
            data: destinationWalletState.data,
            bounce: true,
            body: JettonInternalTransfer {
                queryId: msg.queryId,
                amount: msg.amount,
                from: self.owner,
                responseAddress: msg.responseDestination,
                forwardTonAmount: msg.forwardTonAmount,
                forwardPayload: msg.forwardPayload,
            }.toCell(),
        });
    }

    receive(msg: JettonInternalTransfer) {
        require(msg.amount > 0, "internal transfer must be positive");

        if (sender() != self.master) {
            let expectedWallet = self.getWalletAddressForOwner(msg.from);
            require(sender() == expectedWallet, "invalid wallet sender");
        }

        self.balance += msg.amount;

        if (msg.forwardTonAmount > 0) {
            send(SendParameters {
                to: self.owner,
                value: msg.forwardTonAmount,
                bounce: false,
                body: JettonTransferNotification {
                    queryId: msg.queryId,
                    amount: msg.amount,
                    sender: msg.from,
                    forwardPayload: msg.forwardPayload,
                }.toCell(),
            });
        }

        send(SendParameters {
            to: msg.responseAddress,
            value: ton("0.005"),
            bounce: false,
            body: JettonExcesses { queryId: msg.queryId }.toCell(),
        });
    }

    receive(msg: JettonBurn) {
        require(sender() == self.owner, "wallet owner only");
        require(msg.amount > 0, "burn must be positive");
        require(self.balance >= msg.amount, "insufficient balance");

        self.balance -= msg.amount;

        send(SendParameters {
            to: self.master,
            value: ton("0.03"),
            bounce: true,
            body: JettonBurnNotification {
                queryId: msg.queryId,
                amount: msg.amount,
                owner: self.owner,
                responseDestination: msg.responseDestination,
            }.toCell(),
        });
    }

    fun getWalletAddressForOwner(owner: Address): Address {
        let walletState = initOf TestJetton72HWallet(self.master, owner);
        return contractAddress(walletState);
    }

    get fun getOwner(): Address {
        return self.owner;
    }

    get fun getMaster(): Address {
        return self.master;
    }

    get fun getBalance(): Int {
        return self.balance;
    }

    get fun get_wallet_data(): JettonWalletData {
        let walletState = initOf TestJetton72HWallet(self.master, self.owner);
        return JettonWalletData {
            balance: self.balance,
            ownerAddress: self.owner,
            jettonMasterAddress: self.master,
            jettonWalletCode: walletState.code,
        };
    }
}
