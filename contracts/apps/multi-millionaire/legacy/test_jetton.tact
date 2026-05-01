import "@stdlib/ownable";

const JETTON_TRANSFER_GAS: Int = 50000000;

message(0x4d494e54) Mint {
    queryId: Int as uint64;
    recipient: Address;
    amount: Int as coins;
    responseDestination: Address;
}

message(0x178d4519) InternalJettonTransfer {
    queryId: Int as uint64;
    amount: Int as coins;
    fromAddress: Address;
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

message(0x0f8a7ea5) JettonTransfer {
    queryId: Int as uint64;
    amount: Int as coins;
    destination: Address;
    responseDestination: Address;
    customPayload: Cell?;
    forwardTonAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

struct JettonData {
    totalSupply: Int as coins;
    mintable: Bool;
    adminAddress: Address;
    content: Cell;
    walletCode: Cell;
}

struct WalletData {
    balance: Int as coins;
    owner: Address;
    master: Address;
    walletCode: Cell;
}

contract TestJettonMaster with Ownable {
    owner: Address;
    totalSupply: Int as coins;
    content: Cell;

    init(owner: Address) {
        self.owner = owner;
        self.totalSupply = 0;
        self.content = beginCell().storeUint(0, 8).endCell();
    }

    receive() {}

    receive(msg: Mint) {
        self.requireOwner();
        throwUnless(2001, msg.amount > 0);

        let walletInit: StateInit = initOf TestJettonWallet(myAddress(), msg.recipient);
        let walletAddress: Address = contractAddress(walletInit);
        self.totalSupply += msg.amount;

        send(SendParameters {
            to: walletAddress,
            value: JETTON_TRANSFER_GAS,
            bounce: false,
            code: walletInit.code,
            data: walletInit.data,
            body: InternalJettonTransfer {
                queryId: msg.queryId,
                amount: msg.amount,
                fromAddress: myAddress(),
                responseAddress: msg.responseDestination,
                forwardTonAmount: 0,
                forwardPayload: emptySlice(),
            }.toCell(),
        });
    }

    get fun get_wallet_address(owner: Address): Address {
        let walletInit: StateInit = initOf TestJettonWallet(myAddress(), owner);
        return contractAddress(walletInit);
    }

    get fun get_jetton_data(): JettonData {
        let walletInit: StateInit = initOf TestJettonWallet(myAddress(), myAddress());
        return JettonData {
            totalSupply: self.totalSupply,
            mintable: true,
            adminAddress: self.owner,
            content: self.content,
            walletCode: walletInit.code,
        };
    }

}

contract TestJettonWallet {
    master: Address;
    owner: Address;
    balance: Int as coins;

    init(master: Address, owner: Address) {
        self.master = master;
        self.owner = owner;
        self.balance = 0;
    }

    receive() {}

    receive(msg: InternalJettonTransfer) {
        throwUnless(2101, msg.amount > 0);
        let expectedSenderWallet: Address = contractAddress(initOf TestJettonWallet(self.master, msg.fromAddress));
        throwUnless(2102, sender() == self.master || sender() == expectedSenderWallet);

        self.balance += msg.amount;

        if (msg.forwardTonAmount > 0) {
            send(SendParameters {
                to: self.owner,
                value: msg.forwardTonAmount,
                bounce: false,
                body: JettonTransferNotification {
                    queryId: msg.queryId,
                    amount: msg.amount,
                    sender: msg.fromAddress,
                    forwardPayload: msg.forwardPayload,
                }.toCell(),
            });
        }
    }

    receive(msg: JettonTransfer) {
        throwUnless(2201, sender() == self.owner);
        throwUnless(2202, msg.amount > 0);
        throwUnless(2203, self.balance >= msg.amount);

        let recipientWalletInit: StateInit = initOf TestJettonWallet(self.master, msg.destination);
        let recipientWalletAddress: Address = contractAddress(recipientWalletInit);
        self.balance -= msg.amount;

        send(SendParameters {
            to: recipientWalletAddress,
            value: JETTON_TRANSFER_GAS + msg.forwardTonAmount,
            bounce: false,
            code: recipientWalletInit.code,
            data: recipientWalletInit.data,
            body: InternalJettonTransfer {
                queryId: msg.queryId,
                amount: msg.amount,
                fromAddress: self.owner,
                responseAddress: msg.responseDestination,
                forwardTonAmount: msg.forwardTonAmount,
                forwardPayload: msg.forwardPayload,
            }.toCell(),
        });
    }

    get fun get_wallet_data(): WalletData {
        let walletInit: StateInit = initOf TestJettonWallet(self.master, self.owner);
        return WalletData {
            balance: self.balance,
            owner: self.owner,
            master: self.master,
            walletCode: walletInit.code,
        };
    }
}
