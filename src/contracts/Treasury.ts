import { CAPITAL_RULEBOOK } from '../config/capital.constants.js';
import type { ContractBlueprint } from '../types/blueprint.js';

export interface TreasuryConfig {
  readonly rewardToken: '72H';
  readonly reserveClaimIntervalSeconds: number;
  readonly alphaSettlementIntervalSeconds: number;
  readonly distributionAuthority: 'multisig';
  readonly batchReplayProtection: 'batch-id + nonce';
  readonly distributionScope: 'reserve-yield' | 'alpha-settlement';
}

export const treasuryBlueprint: ContractBlueprint<TreasuryConfig> = {
  name: 'Treasury',
  purpose: 'Privileged 72H-only distribution treasury. It receives approved yield batches and dispatches them to reserve and alpha flows after multisig approval.',
  config: {
    rewardToken: CAPITAL_RULEBOOK.shared.rewardToken,
    reserveClaimIntervalSeconds: CAPITAL_RULEBOOK.reserve.rewardClaimIntervalSeconds,
    alphaSettlementIntervalSeconds: CAPITAL_RULEBOOK.alpha.settlementIntervalSeconds,
    distributionAuthority: 'multisig',
    batchReplayProtection: 'batch-id + nonce',
    distributionScope: 'reserve-yield',
  },
  invariants: [
    'Treasury distributes yield in 72H only.',
    'Treasury is not a yield source and never mints or redeems principal.',
    'Reserve reward claims are gated by a 7-day cadence.',
    'Alpha settlement batches are aligned to 7-week cycles.',
    'Every batch is explicitly scoped to reserve yield or alpha settlement.',
    'Batch execution is privileged, multisig-approved, and replay-protected by batch id plus nonce.',
    'Treasury actions require privileged approval via multisig-controlled flows.',
  ],
  storage: [
    {
      name: 'availableBalance',
      type: '72H token balance',
      description: 'Treasury-controlled 72H available for distribution.',
    },
    {
      name: 'distributionBatches',
      type: 'map<batchId, distributionBatch>',
      description: 'Legacy treasury accounting rows retained outside the v1 reward path.',
    },
    {
      name: 'processedBatchDigests',
      type: 'set<batchDigest>',
      description: 'Replay protection for already-executed distribution batches.',
    },
    {
      name: 'vaultBindings',
      type: 'map<appSlug + seatType, vaultAddress>',
      description: 'Authorized reserve and alpha vault recipients.',
    },
    {
      name: 'pauseFlags',
      type: 'map<scope, paused>',
      description: 'Emergency pause state for reserve yield and alpha settlement routes.',
    },
  ],
  entrypoints: [
    {
      name: 'fundTreasury',
      sender: 'multisig',
      description: 'Moves approved yield funding into treasury control.',
    },
    {
      name: 'prepareDistributionBatch',
      sender: 'multisig',
      description: 'Creates a scoped 72H-only distribution batch for either reserve yield or alpha settlement.',
    },
    {
      name: 'approveDistributionBatch',
      sender: 'multisig',
      description: 'Approves a pending distribution batch before execution.',
    },
    {
      name: 'distributeReserveYield',
      sender: 'multisig',
      description: 'Executes an approved reserve yield batch after interval checks and replay validation.',
    },
    {
      name: 'distributeAlphaReward',
      sender: 'multisig',
      description: 'Executes an approved alpha settlement batch after interval checks and replay validation.',
    },
    {
      name: 'invalidateDistributionBatch',
      sender: 'multisig',
      description: 'Invalidates a pending batch so it cannot be replayed or executed later.',
    },
    {
      name: 'setDistributionPause',
      sender: 'multisig',
      description: 'Pauses or resumes a distribution scope during incidents.',
    },
  ],
  events: [
    {
      name: 'TreasuryFunded',
      description: 'Treasury balance is increased for upcoming distributions.',
    },
    {
      name: 'DistributionBatchPrepared',
      description: 'A privileged 72H distribution batch is prepared.',
    },
    {
      name: 'DistributionBatchApproved',
      description: 'A pending batch receives multisig approval.',
    },
    {
      name: 'ReserveYieldDistributed',
      description: 'A reserve yield batch is distributed in 72H.',
    },
    {
      name: 'AlphaRewardDistributed',
      description: 'An alpha settlement batch is distributed in 72H.',
    },
    {
      name: 'DistributionBatchInvalidated',
      description: 'A pending batch is cancelled before execution.',
    },
    {
      name: 'DistributionPauseChanged',
      description: 'The treasury distribution surface is paused or resumed.',
    },
  ],
  nextImplementationSteps: [
    'Define transfer authorization and token integration for 72H-only batch routing.',
    'Specify the replay digest for reserve-yield and alpha-settlement batch execution.',
    'Add pause semantics and batch invalidation rules for incident response.',
  ],
};
