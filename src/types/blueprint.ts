export interface ContractStorageField {
  readonly name: string;
  readonly type: string;
  readonly description: string;
}

export interface ContractEntrypoint {
  readonly name: string;
  readonly sender: 'user' | 'admin' | 'multisig' | 'registry' | 'treasury' | 'vault';
  readonly description: string;
}

export interface ContractEvent {
  readonly name: string;
  readonly description: string;
}

export interface ContractBlueprint<TConfig extends object = object> {
  readonly name: string;
  readonly purpose: string;
  readonly config: TConfig;
  readonly invariants: readonly string[];
  readonly storage: readonly ContractStorageField[];
  readonly entrypoints: readonly ContractEntrypoint[];
  readonly events: readonly ContractEvent[];
  readonly nextImplementationSteps: readonly string[];
}
