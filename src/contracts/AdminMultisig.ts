import type { ContractBlueprint } from '../types/blueprint.js';

export interface AdminAuthorityConfig {
  readonly signerCount: number;
  readonly minApprovals: number;
  readonly manages: readonly string[];
  readonly approvalModel: 'single-admin';
  readonly replayProtection: 'operation-id + nonce + target';
  readonly emergencyScopes: readonly string[];
}

export const adminAuthorityBlueprint: ContractBlueprint<AdminAuthorityConfig> = {
  name: 'AdminAuthority',
  purpose: 'Single-admin authority and emergency control surface for privileged 72H Capital operations. All writes are admin-approved and replay-protected.',
  config: {
    signerCount: 1,
    minApprovals: 1,
    manages: ['CapitalRegistry', 'ReserveVault', 'AlphaVault', 'AppRewardPool'],
    approvalModel: 'single-admin',
    replayProtection: 'operation-id + nonce + target',
    emergencyScopes: ['CapitalRegistry', 'ReserveVault', 'AlphaVault', 'AppRewardPool'],
  },
  invariants: [
    'Privileged operations require administrator approval before execution.',
    'The administrator authority is the only actor allowed to register apps or change vault bindings.',
    'Each operation is scoped by target contract, operation id, and nonce so replayed approvals are rejected.',
    'Emergency pause and reward-pool controls must route through administrator approval.',
    'Administrator rotation must be explicit and cannot bypass replay protection.',
    'Emergency controls can pause write paths but cannot rewrite completed seat history.',
  ],
  storage: [
    {
      name: 'signers',
      type: 'set<address>',
      description: 'Authorized administrator address.',
    },
    {
      name: 'threshold',
      type: 'uint',
      description: 'Minimum approvals required to execute an operation. Fixed to 1 for the current single-admin policy.',
    },
    {
      name: 'operations',
      type: 'map<operationId, adminAuthorityOperation>',
      description: 'Pending, approved, executed, or cancelled privileged operations.',
    },
    {
      name: 'executedDigests',
      type: 'set<operationDigest>',
      description: 'Replay protection for already executed governance payloads.',
    },
    {
      name: 'emergencyState',
      type: 'map<scope, paused>',
      description: 'Emergency pause state across registry, reserve, alpha, and reward-pool scopes.',
    },
  ],
  entrypoints: [
    {
      name: 'proposeOperation',
      sender: 'admin',
      description: 'Creates a pending privileged operation with a unique id, target, nonce, and scope.',
    },
    {
      name: 'approveOperation',
      sender: 'admin',
      description: 'Approves a pending operation. Approvals are counted per signer and are not reusable across targets.',
    },
    {
      name: 'executeOperation',
      sender: 'admin',
      description: 'Executes an operation after the threshold is met and the digest has not been seen before.',
    },
    {
      name: 'cancelOperation',
      sender: 'admin',
      description: 'Cancels a pending operation so it cannot be executed later.',
    },
    {
      name: 'setEmergencyState',
      sender: 'admin',
      description: 'Pauses or resumes an emergency scope without altering seat history.',
    },
    {
      name: 'rotateSignerSet',
      sender: 'admin',
      description: 'Replaces the signer set through governed approval.',
    },
  ],
  events: [
    {
      name: 'OperationProposed',
      description: 'A privileged operation enters the approval queue.',
    },
    {
      name: 'OperationApproved',
      description: 'A signer approves a pending operation.',
    },
    {
      name: 'OperationExecuted',
      description: 'A pending operation is executed.',
    },
    {
      name: 'OperationCancelled',
      description: 'A pending operation is cancelled before execution.',
    },
    {
      name: 'EmergencyStateChanged',
      description: 'An emergency scope is paused or resumed.',
    },
    {
      name: 'SignerSetRotated',
      description: 'The governed signer set is replaced.',
    },
  ],
  nextImplementationSteps: [
    'Keep signer count fixed to one unless owner explicitly migrates to multisig governance.',
    'Design operation payload encoding for registry, reward-pool, and vault control paths.',
    'Persist operation digests and nonce checks so approvals cannot be replayed across targets.',
    'Add emergency pause wiring for registry, reserve, alpha, and reward-pool scopes.',
  ],
};

export type AdminMultisigConfig = AdminAuthorityConfig;

export const adminMultisigBlueprint = adminAuthorityBlueprint;
