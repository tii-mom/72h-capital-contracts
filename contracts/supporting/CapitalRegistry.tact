// CapitalRegistry minimal Tact implementation.
//
// Scope:
// - deployable/testable shell for testnet progression
// - tracks app-scoped reserve seat counters and owner assignments
// - keeps app IDs compact on chain:
//   1 = 72hours, 2 = wan, 3 = multi-millionaire
//
// Not yet complete:
// - alpha lifecycle
// - full ReserveVault callback protocol
// - production audit/replay model

message(0x72010001) RegisterApp {
    appId: Int as uint8;
}

message(0x72010002) BindReserveVault {
    appId: Int as uint8;
    vault: Address;
}

message(0x72010003) AssignReserveSeat {
    appId: Int as uint8;
    owner: Address;
}

contract CapitalRegistry {
    owner: Address;
    reserveSeatCap: Int as uint16;
    alphaSeatCap: Int as uint16;
    nextReserveSeatByApp: map<Int as uint8, Int as uint16>;
    reserveVaultByApp: map<Int as uint8, Address>;
    reserveSeatByOwner72hours: map<Address, Int as uint16>;
    reserveSeatByOwnerWan: map<Address, Int as uint16>;
    reserveSeatByOwnerMultiMillionaire: map<Address, Int as uint16>;
    reserveOwnerBySeat72hours: map<Int as uint16, Address>;
    reserveOwnerBySeatWan: map<Int as uint16, Address>;
    reserveOwnerBySeatMultiMillionaire: map<Int as uint16, Address>;

    init(owner: Address) {
        self.owner = owner;
        self.reserveSeatCap = 72;
        self.alphaSeatCap = 9;
    }

    receive() {}

    receive(msg: RegisterApp) {
        self.requireOwner();
        self.requireApp(msg.appId);

        if (!self.nextReserveSeatByApp.exists(msg.appId)) {
            self.nextReserveSeatByApp.set(msg.appId, 1);
        }
    }

    receive(msg: BindReserveVault) {
        self.requireOwner();
        self.requireApp(msg.appId);
        self.reserveVaultByApp.set(msg.appId, msg.vault);

        if (!self.nextReserveSeatByApp.exists(msg.appId)) {
            self.nextReserveSeatByApp.set(msg.appId, 1);
        }
    }

    receive(msg: AssignReserveSeat) {
        self.requireApp(msg.appId);

        let boundVault = self.reserveVaultByApp.get(msg.appId);
        require(boundVault != null, "reserve vault not bound");
        require(sender() == boundVault!!, "sender is not bound reserve vault");

        if (self.hasReserveSeatByAppOwner(msg.appId, msg.owner)) {
            return;
        }

        let nextSeat = self.getNextReserveSeat(msg.appId);
        require(nextSeat <= self.reserveSeatCap, "reserve seat capacity reached");

        self.setReserveSeatByAppOwner(msg.appId, msg.owner, nextSeat);
        self.nextReserveSeatByApp.set(msg.appId, nextSeat + 1);
    }

    fun hasReserveSeatByAppOwner(appId: Int, owner: Address): Bool {
        if (appId == 1) {
            return self.reserveSeatByOwner72hours.exists(owner);
        }
        if (appId == 2) {
            return self.reserveSeatByOwnerWan.exists(owner);
        }
        return self.reserveSeatByOwnerMultiMillionaire.exists(owner);
    }

    fun setReserveSeatByAppOwner(appId: Int, owner: Address, seatNumber: Int) {
        if (appId == 1) {
            self.reserveSeatByOwner72hours.set(owner, seatNumber);
            self.reserveOwnerBySeat72hours.set(seatNumber, owner);
            return;
        }
        if (appId == 2) {
            self.reserveSeatByOwnerWan.set(owner, seatNumber);
            self.reserveOwnerBySeatWan.set(seatNumber, owner);
            return;
        }
        self.reserveSeatByOwnerMultiMillionaire.set(owner, seatNumber);
        self.reserveOwnerBySeatMultiMillionaire.set(seatNumber, owner);
    }

    fun getReserveSeatByAppOwnerInternal(appId: Int, owner: Address): Int {
        self.requireApp(appId);

        if (appId == 1) {
            let seatNumber = self.reserveSeatByOwner72hours.get(owner);
            return seatNumber == null ? 0 : seatNumber!!;
        }
        if (appId == 2) {
            let seatNumber = self.reserveSeatByOwnerWan.get(owner);
            return seatNumber == null ? 0 : seatNumber!!;
        }

        let seatNumber = self.reserveSeatByOwnerMultiMillionaire.get(owner);
        return seatNumber == null ? 0 : seatNumber!!;
    }

    fun getReserveOwnerByAppSeatInternal(appId: Int, seatNumber: Int): Address {
        self.requireApp(appId);

        if (appId == 1) {
            let owner = self.reserveOwnerBySeat72hours.get(seatNumber);
            require(owner != null, "reserve owner missing");
            return owner!!;
        }
        if (appId == 2) {
            let owner = self.reserveOwnerBySeatWan.get(seatNumber);
            require(owner != null, "reserve owner missing");
            return owner!!;
        }

        let owner = self.reserveOwnerBySeatMultiMillionaire.get(seatNumber);
        require(owner != null, "reserve owner missing");
        return owner!!;
    }

    fun requireOwner() {
        require(sender() == self.owner, "owner only");
    }

    fun requireApp(appId: Int) {
        require(appId >= 1 && appId <= 3, "unsupported app");
    }

    get fun getOwner(): Address {
        return self.owner;
    }

    get fun getReserveSeatCap(): Int {
        return self.reserveSeatCap;
    }

    get fun getAlphaSeatCap(): Int {
        return self.alphaSeatCap;
    }

    get fun getNextReserveSeat(appId: Int): Int {
        let nextSeat = self.nextReserveSeatByApp.get(appId);
        if (nextSeat == null) {
            return 1;
        }
        return nextSeat!!;
    }

    get fun getReserveVaultByApp(appId: Int): Address {
        self.requireApp(appId);

        let vault = self.reserveVaultByApp.get(appId);
        require(vault != null, "reserve vault not bound");
        return vault!!;
    }

    get fun getReserveSeatByAppOwner(appId: Int, owner: Address): Int {
        return self.getReserveSeatByAppOwnerInternal(appId, owner);
    }

    get fun getReserveOwnerByAppSeat(appId: Int, seatNumber: Int): Address {
        return self.getReserveOwnerByAppSeatInternal(appId, seatNumber);
    }

    get fun getReserveSeatByOwner(owner: Address): Int {
        // Deprecated compatibility getter. Production callers must pass appId.
        return self.getReserveSeatByAppOwnerInternal(1, owner);
    }
}
