import { CAPITAL_APP_SLUGS, CAPITAL_RULEBOOK } from '../config/capital.constants.js';
import type { ContractBlueprint } from '../types/blueprint.js';
import type { AlphaSeatRecord, CapitalAppSlug, ReserveSeatRecord } from '../types/domain.js';

export interface CapitalRegistryConfig {
  readonly apps: readonly CapitalAppSlug[];
  readonly reserveSeatCapPerApp: number;
  readonly alphaSeatCapPerApp: number;
  readonly historicalStatus: 'historical';
  readonly completedStatus: 'completed';
}

export interface CapitalVaultBindings {
  readonly reserveVaultId?: string;
  readonly alphaVaultId?: string;
  readonly rewardPoolId?: string;
  readonly multisigId?: string;
}

export interface CapitalAppRegistrationInput extends CapitalVaultBindings {
  readonly registeredAtUnix?: number;
}

export interface CapitalAppBinding extends CapitalVaultBindings {
  readonly app: CapitalAppSlug;
  readonly registeredAtUnix: number;
  readonly reserveSeatCap: number;
  readonly alphaSeatCap: number;
  readonly nextReserveSeatNumber: number;
  readonly nextAlphaSeatNumber: number;
}

type ReserveSeatOwnerKey = `${CapitalAppSlug}:${string}`;
type AlphaSeatOwnerKey = `${CapitalAppSlug}:${string}`;
type ReserveSeatLifecycleStatus = ReserveSeatRecord['status'];
type AlphaSeatLifecycleStatus = AlphaSeatRecord['status'];

export const capitalRegistryBlueprint: ContractBlueprint<CapitalRegistryConfig> = {
  name: 'CapitalRegistry',
  purpose: 'Seat identity registry and lifecycle coordinator for reserve and alpha allocations.',
  config: {
    apps: CAPITAL_APP_SLUGS,
    reserveSeatCapPerApp: CAPITAL_RULEBOOK.reserve.seatCap,
    alphaSeatCapPerApp: CAPITAL_RULEBOOK.alpha.seatCap,
    historicalStatus: CAPITAL_RULEBOOK.reserve.fullRedemptionStatus,
    completedStatus: CAPITAL_RULEBOOK.alpha.completedStatus,
  },
  invariants: [
    'Reserve seat cap is 72 per app.',
    'Alpha seat cap is 9 per app.',
    'Reserve and alpha seat numbers are deterministic per app and never recycled.',
    'App bindings hold registry metadata and deterministic seat counters.',
    'Seat identifiers are never released once assigned.',
    'Seat ownership is keyed by app and owner, and reassignment to a different owner is prohibited.',
    'Full reserve redemption transitions the seat lifecycle to historical.',
    'Completed alpha seats remain recorded after 72 weeks.',
    'App RewardPool bindings are separate from principal vault bindings.',
  ],
  storage: [
    {
      name: 'apps',
      type: 'map<appSlug, appConfig>',
      description: 'Registered app programs, caps, and vault bindings.',
    },
    {
      name: 'appBindings',
      type: 'map<appSlug, appBinding>',
      description: 'Deterministic seat counters plus registry-owned vault and reward-pool metadata.',
    },
    {
      name: 'reserveSeats',
      type: 'map<appSlug + seatNumber, reserveSeatRecord>',
      description: 'Reserve seat ownership and lifecycle status.',
    },
    {
      name: 'reserveSeatByOwner',
      type: 'map<appSlug + owner, seatNumber>',
      description: 'Owner lookup for reserve seat reactivation and lifecycle routing.',
    },
    {
      name: 'alphaSeats',
      type: 'map<appSlug + seatNumber, alphaSeatRecord>',
      description: 'Alpha seat ownership and lifecycle status.',
    },
    {
      name: 'alphaSeatByOwner',
      type: 'map<appSlug + owner, seatNumber>',
      description: 'Owner lookup for alpha seat lifecycle routing.',
    },
  ],
  entrypoints: [
    {
      name: 'registerApp',
      sender: 'multisig',
      description: 'Registers or refreshes an app binding without rewinding deterministic seat counters.',
    },
    {
      name: 'bindVaults',
      sender: 'multisig',
      description: 'Binds vault and reward-pool metadata to a registered app.',
    },
    {
      name: 'assignReserveSeat',
      sender: 'vault',
      description: 'Allocates or reactivates the owner-directed reserve seat.',
    },
    {
      name: 'markReserveActive',
      sender: 'vault',
      description: 'Marks a reserve seat active after allocation or reactivation.',
    },
    {
      name: 'markReserveHistorical',
      sender: 'vault',
      description: 'Marks a reserve seat historical after full redemption.',
    },
    {
      name: 'assignAlphaSeat',
      sender: 'vault',
      description: 'Allocates a new alpha seat to a qualifying owner.',
    },
    {
      name: 'markAlphaActive',
      sender: 'vault',
      description: 'Marks an alpha seat active after allocation or top-up.',
    },
    {
      name: 'markAlphaCompleted',
      sender: 'vault',
      description: 'Marks an alpha seat completed after 72 weeks.',
    },
  ],
  events: [
    {
      name: 'AppRegistered',
      description: 'A new app program is registered in the registry.',
    },
    {
      name: 'AppVaultsBound',
      description: 'Vault and reward-pool metadata are bound to a registered app.',
    },
    {
      name: 'ReserveSeatAssigned',
      description: 'A reserve seat number is assigned to an owner.',
    },
    {
      name: 'ReserveSeatReactivated',
      description: 'A historical reserve seat is reactivated for the same owner.',
    },
    {
      name: 'ReserveSeatHistorical',
      description: 'A reserve seat transitions to historical.',
    },
    {
      name: 'AlphaSeatAssigned',
      description: 'An alpha seat number is assigned to an owner.',
    },
    {
      name: 'SeatCompleted',
      description: 'An alpha seat transitions to completed.',
    },
  ],
  nextImplementationSteps: [
    'Promote app bindings and deterministic seat counters to on-chain registry storage.',
    'Specify registry-authenticated seat lifecycle messages for reserve and alpha transitions.',
    'Wire event emission for seat assignment, reactivation, reward-pool binding, and completion.',
  ],
};

function ownerKey(app: CapitalAppSlug, owner: string): ReserveSeatOwnerKey {
  return `${app}:${owner}`;
}

function alphaOwnerKey(app: CapitalAppSlug, owner: string): AlphaSeatOwnerKey {
  return `${app}:${owner}`;
}

function cloneReserveSeatRecord(record: ReserveSeatRecord): ReserveSeatRecord {
  return { ...record };
}

function cloneAlphaSeatRecord(record: AlphaSeatRecord): AlphaSeatRecord {
  return { ...record };
}

function cloneAppBinding(binding: CapitalAppBinding): CapitalAppBinding {
  return { ...binding };
}

export class CapitalRegistry {
  private readonly appBindings = new Map<CapitalAppSlug, CapitalAppBinding>();
  private readonly reserveSeatRecords = new Map<CapitalAppSlug, Map<number, ReserveSeatRecord>>();
  private readonly reserveSeatByOwner = new Map<ReserveSeatOwnerKey, number>();
  private readonly alphaSeatRecords = new Map<CapitalAppSlug, Map<number, AlphaSeatRecord>>();
  private readonly alphaSeatByOwner = new Map<AlphaSeatOwnerKey, number>();

  constructor(readonly config: CapitalRegistryConfig = capitalRegistryBlueprint.config) {
    for (const app of config.apps) {
      this.bootstrapApp(app);
    }
  }

  listAppBindings() {
    return Array.from(this.appBindings.values()).map(cloneAppBinding);
  }

  getAppBinding(app: CapitalAppSlug) {
    const binding = this.appBindings.get(app);
    return binding ? cloneAppBinding(binding) : undefined;
  }

  registerApp(app: CapitalAppSlug, input: CapitalAppRegistrationInput = {}) {
    return this.updateAppBinding(app, (binding) => ({
      ...binding,
      registeredAtUnix: input.registeredAtUnix ?? binding.registeredAtUnix,
      ...(input.reserveVaultId !== undefined ? { reserveVaultId: input.reserveVaultId } : {}),
      ...(input.alphaVaultId !== undefined ? { alphaVaultId: input.alphaVaultId } : {}),
      ...(input.rewardPoolId !== undefined ? { rewardPoolId: input.rewardPoolId } : {}),
      ...(input.multisigId !== undefined ? { multisigId: input.multisigId } : {}),
    }));
  }

  bindVaults(app: CapitalAppSlug, bindings: CapitalVaultBindings) {
    return this.updateAppBinding(app, (binding) => ({
      ...binding,
      ...(bindings.reserveVaultId !== undefined ? { reserveVaultId: bindings.reserveVaultId } : {}),
      ...(bindings.alphaVaultId !== undefined ? { alphaVaultId: bindings.alphaVaultId } : {}),
      ...(bindings.rewardPoolId !== undefined ? { rewardPoolId: bindings.rewardPoolId } : {}),
      ...(bindings.multisigId !== undefined ? { multisigId: bindings.multisigId } : {}),
    }));
  }

  listReserveSeats(app: CapitalAppSlug) {
    return Array.from(this.getAppReserveSeats(app).values())
      .sort((left, right) => left.seatNumber - right.seatNumber)
      .map(cloneReserveSeatRecord);
  }

  listAlphaSeats(app: CapitalAppSlug) {
    return Array.from(this.getAppAlphaSeats(app).values())
      .sort((left, right) => left.seatNumber - right.seatNumber)
      .map(cloneAlphaSeatRecord);
  }

  getReserveSeat(app: CapitalAppSlug, seatNumber: number) {
    const record = this.getAppReserveSeats(app).get(seatNumber);
    return record ? cloneReserveSeatRecord(record) : undefined;
  }

  getReserveSeatByOwner(app: CapitalAppSlug, owner: string) {
    const seatNumber = this.reserveSeatByOwner.get(ownerKey(app, owner));

    if (seatNumber === undefined) {
      return undefined;
    }

    return this.getReserveSeat(app, seatNumber);
  }

  getAlphaSeat(app: CapitalAppSlug, seatNumber: number) {
    const record = this.getAppAlphaSeats(app).get(seatNumber);
    return record ? cloneAlphaSeatRecord(record) : undefined;
  }

  getAlphaSeatByOwner(app: CapitalAppSlug, owner: string) {
    const seatNumber = this.alphaSeatByOwner.get(alphaOwnerKey(app, owner));

    if (seatNumber === undefined) {
      return undefined;
    }

    return this.getAlphaSeat(app, seatNumber);
  }

  assignReserveSeat(app: CapitalAppSlug, owner: string, timestamp: number) {
    this.assertOwner(owner);
    this.assertAppBinding(app);

    const existingSeat = this.getReserveSeatByOwner(app, owner);

    if (existingSeat) {
      return this.refreshReserveSeat(existingSeat, timestamp);
    }

    return this.allocateReserveSeat(app, owner, timestamp);
  }

  assignOrReactivateReserveSeat(app: CapitalAppSlug, owner: string, timestamp: number) {
    return this.assignReserveSeat(app, owner, timestamp);
  }

  markReserveActive(app: CapitalAppSlug, seatNumber: number, timestamp?: number) {
    const record = this.requireReserveSeat(app, seatNumber);
    this.assertReserveTransitionAllowed(record.status, 'active');

    return this.persistReserveSeat({
      ...record,
      status: 'active',
      lastActivatedAtUnix: timestamp ?? record.lastActivatedAtUnix,
    });
  }

  markReserveHistorical(app: CapitalAppSlug, seatNumber: number, timestamp: number) {
    const record = this.requireReserveSeat(app, seatNumber);
    this.assertReserveTransitionAllowed(record.status, 'historical');

    if (record.status === 'historical') {
      return cloneReserveSeatRecord(record);
    }

    return this.persistReserveSeat({
      ...record,
      status: 'historical',
      historicalAtUnix: timestamp,
    });
  }

  assignAlphaSeat(app: CapitalAppSlug, owner: string, timestamp: number) {
    this.assertOwner(owner);
    this.assertAppBinding(app);

    if (this.getAlphaSeatByOwner(app, owner)) {
      throw new Error(`Alpha seat already exists for ${owner} on ${app}.`);
    }

    const binding = this.getMutableAppBinding(app);
    const seatNumber = binding.nextAlphaSeatNumber;

    if (seatNumber > binding.alphaSeatCap) {
      throw new Error(`Alpha seat capacity reached for ${app}.`);
    }

    const record: AlphaSeatRecord = {
      app,
      owner,
      seatType: 'alpha',
      seatNumber,
      status: 'active',
      assignedAtUnix: timestamp,
      lastActivatedAtUnix: timestamp,
    };

    this.persistAlphaSeat(record);
    this.updateAppBinding(app, (current) => ({
      ...current,
      nextAlphaSeatNumber: seatNumber + 1,
    }));

    return cloneAlphaSeatRecord(record);
  }

  markAlphaActive(app: CapitalAppSlug, seatNumber: number, timestamp?: number) {
    const record = this.requireAlphaSeat(app, seatNumber);
    this.assertAlphaTransitionAllowed(record.status, 'active');

    if (record.status === 'active' && timestamp === undefined) {
      return cloneAlphaSeatRecord(record);
    }

    return this.persistAlphaSeat({
      ...record,
      status: 'active',
      lastActivatedAtUnix: timestamp ?? record.lastActivatedAtUnix,
    });
  }

  markAlphaCompleted(app: CapitalAppSlug, seatNumber: number, timestamp: number) {
    const record = this.requireAlphaSeat(app, seatNumber);
    this.assertAlphaTransitionAllowed(record.status, 'completed');

    if (record.status === 'completed') {
      return cloneAlphaSeatRecord(record);
    }

    return this.persistAlphaSeat({
      ...record,
      status: 'completed',
      completedAtUnix: timestamp,
    });
  }

  private allocateReserveSeat(app: CapitalAppSlug, owner: string, timestamp: number) {
    const binding = this.getMutableAppBinding(app);
    const seatNumber = binding.nextReserveSeatNumber;

    if (seatNumber > binding.reserveSeatCap) {
      throw new Error(`Reserve seat capacity reached for ${app}.`);
    }

    const record: ReserveSeatRecord = {
      app,
      owner,
      seatType: 'reserve',
      seatNumber,
      status: 'active',
      assignedAtUnix: timestamp,
      lastActivatedAtUnix: timestamp,
    };

    this.persistReserveSeat(record);
    this.updateAppBinding(app, (current) => ({
      ...current,
      nextReserveSeatNumber: seatNumber + 1,
    }));

    return cloneReserveSeatRecord(record);
  }

  private refreshReserveSeat(record: ReserveSeatRecord, timestamp: number) {
    const nextStatus: ReserveSeatLifecycleStatus = record.status === 'historical' ? 'active' : record.status;
    this.assertReserveTransitionAllowed(record.status, nextStatus);

    return this.persistReserveSeat({
      ...record,
      status: nextStatus,
      lastActivatedAtUnix: timestamp,
    });
  }

  private getAppReserveSeats(app: CapitalAppSlug) {
    const seats = this.reserveSeatRecords.get(app);

    if (!seats) {
      throw new Error(`Unknown app slug: ${app}.`);
    }

    return seats;
  }

  private getAppAlphaSeats(app: CapitalAppSlug) {
    const seats = this.alphaSeatRecords.get(app);

    if (!seats) {
      throw new Error(`Unknown app slug: ${app}.`);
    }

    return seats;
  }

  private requireReserveSeat(app: CapitalAppSlug, seatNumber: number) {
    const record = this.getAppReserveSeats(app).get(seatNumber);

    if (!record) {
      throw new Error(`Reserve seat ${seatNumber} not found for ${app}.`);
    }

    return record;
  }

  private requireAlphaSeat(app: CapitalAppSlug, seatNumber: number) {
    const record = this.getAppAlphaSeats(app).get(seatNumber);

    if (!record) {
      throw new Error(`Alpha seat ${seatNumber} not found for ${app}.`);
    }

    return record;
  }

  private bootstrapApp(app: CapitalAppSlug) {
    this.appBindings.set(app, this.createDefaultAppBinding(app));
    this.reserveSeatRecords.set(app, new Map());
    this.alphaSeatRecords.set(app, new Map());
  }

  private createDefaultAppBinding(app: CapitalAppSlug): CapitalAppBinding {
    return {
      app,
      registeredAtUnix: 0,
      reserveSeatCap: this.config.reserveSeatCapPerApp,
      alphaSeatCap: this.config.alphaSeatCapPerApp,
      nextReserveSeatNumber: 1,
      nextAlphaSeatNumber: 1,
    };
  }

  private ensureAppBinding(app: CapitalAppSlug) {
    const existing = this.appBindings.get(app);

    if (existing) {
      return existing;
    }

    const created = this.createDefaultAppBinding(app);
    this.appBindings.set(app, created);

    if (!this.reserveSeatRecords.has(app)) {
      this.reserveSeatRecords.set(app, new Map());
    }

    if (!this.alphaSeatRecords.has(app)) {
      this.alphaSeatRecords.set(app, new Map());
    }

    return created;
  }

  private getMutableAppBinding(app: CapitalAppSlug) {
    return this.ensureAppBinding(app);
  }

  private updateAppBinding(app: CapitalAppSlug, updater: (binding: CapitalAppBinding) => CapitalAppBinding) {
    const current = this.ensureAppBinding(app);
    const next = updater(current);

    this.assertAppBindingShape(app, next);
    this.appBindings.set(app, next);
    return cloneAppBinding(next);
  }

  private assertAppBindingShape(app: CapitalAppSlug, binding: CapitalAppBinding) {
    if (binding.app !== app) {
      throw new Error(`App binding mismatch for ${app}.`);
    }

    if (binding.reserveSeatCap !== this.config.reserveSeatCapPerApp) {
      throw new Error(`Reserve seat cap cannot change for ${app}.`);
    }

    if (binding.alphaSeatCap !== this.config.alphaSeatCapPerApp) {
      throw new Error(`Alpha seat cap cannot change for ${app}.`);
    }

    if (binding.nextReserveSeatNumber < 1) {
      throw new Error(`Reserve seat counter must stay positive for ${app}.`);
    }

    if (binding.nextAlphaSeatNumber < 1) {
      throw new Error(`Alpha seat counter must stay positive for ${app}.`);
    }
  }

  private persistReserveSeat(record: ReserveSeatRecord) {
    const seats = this.getAppReserveSeats(record.app);
    const current = seats.get(record.seatNumber);

    if (current && current.owner !== record.owner) {
      throw new Error('Unauthorized reserve seat reassignment is prohibited.');
    }

    if (current && current.app !== record.app) {
      throw new Error('Reserve seat app binding mismatch.');
    }

    this.assertReserveTransitionAllowed(current?.status ?? record.status, record.status);
    seats.set(record.seatNumber, cloneReserveSeatRecord(record));
    this.reserveSeatByOwner.set(ownerKey(record.app, record.owner), record.seatNumber);
    return cloneReserveSeatRecord(record);
  }

  private persistAlphaSeat(record: AlphaSeatRecord) {
    const seats = this.getAppAlphaSeats(record.app);
    const current = seats.get(record.seatNumber);

    if (current && current.owner !== record.owner) {
      throw new Error('Unauthorized alpha seat reassignment is prohibited.');
    }

    if (current && current.app !== record.app) {
      throw new Error('Alpha seat app binding mismatch.');
    }

    this.assertAlphaTransitionAllowed(current?.status ?? record.status, record.status);
    seats.set(record.seatNumber, cloneAlphaSeatRecord(record));
    this.alphaSeatByOwner.set(alphaOwnerKey(record.app, record.owner), record.seatNumber);
    return cloneAlphaSeatRecord(record);
  }

  private assertOwner(owner: string) {
    if (!owner.trim()) {
      throw new Error('Owner must be a non-empty identifier.');
    }
  }

  private assertAppBinding(app: CapitalAppSlug) {
    this.ensureAppBinding(app);
  }

  private assertReserveTransitionAllowed(
    current: ReserveSeatLifecycleStatus | undefined,
    next: ReserveSeatLifecycleStatus,
  ) {
    if (current === next) {
      return;
    }

    if (current === 'active' && next === 'historical') {
      return;
    }

    if (current === 'historical' && next === 'active') {
      return;
    }

    throw new Error(`Illegal reserve seat transition from ${current ?? 'unbound'} to ${next}.`);
  }

  private assertAlphaTransitionAllowed(current: AlphaSeatLifecycleStatus | undefined, next: AlphaSeatLifecycleStatus) {
    if (current === next) {
      return;
    }

    if (current === 'active' && next === 'completed') {
      return;
    }

    throw new Error(`Illegal alpha seat transition from ${current ?? 'unbound'} to ${next}.`);
  }
}
