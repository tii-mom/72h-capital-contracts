import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type GateCheck =
  | 'local_typecheck'
  | 'local_tact_check'
  | 'local_vitest'
  | 'testnet_deploy'
  | 'testnet_vault_wallet_bound'
  | 'testnet_deposit_supported_target'
  | 'testnet_rejects_bad_sender'
  | 'testnet_rejects_bad_target'
  | 'testnet_withdraw_after_goal'
  | 'testnet_finalize_excesses'
  | 'testnet_bounce_restore';

type Evidence = {
  readonly network?: string;
  readonly status?: string;
  readonly contract?: {
    readonly name?: string;
    readonly address?: string;
    readonly codeHashHex?: string;
  };
  readonly checks?: Partial<Record<GateCheck, boolean>>;
};

const evidencePath = resolve(process.cwd(), 'deployments/apps/multi-millionaire/v3/deposit-vault.testnet.latest.json');
const requiredChecks: readonly GateCheck[] = [
  'local_typecheck',
  'local_tact_check',
  'local_vitest',
  'testnet_deploy',
  'testnet_vault_wallet_bound',
  'testnet_deposit_supported_target',
  'testnet_rejects_bad_sender',
  'testnet_rejects_bad_target',
  'testnet_withdraw_after_goal',
  'testnet_finalize_excesses',
  'testnet_bounce_restore',
];

function fail(message: string): never {
  throw new Error(`Multi-millionaire V3 gate failed: ${message}`);
}

function isHex(value: string | undefined) {
  return !!value && /^[0-9a-f]+$/i.test(value);
}

if (!existsSync(evidencePath)) {
  fail(`missing testnet evidence file ${evidencePath}`);
}

const evidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as Evidence;

if (evidence.network !== 'ton-testnet' && evidence.network !== 'testnet') {
  fail(`expected network ton-testnet/testnet, got ${evidence.network ?? 'missing'}`);
}
if (evidence.status !== 'complete') {
  fail(`expected status complete, got ${evidence.status ?? 'missing'}`);
}
if (evidence.contract?.name !== 'MultiMillionaireDepositVault') {
  fail(`expected contract.name MultiMillionaireDepositVault, got ${evidence.contract?.name ?? 'missing'}`);
}
if (!evidence.contract.address) {
  fail('missing contract.address');
}
if (!isHex(evidence.contract.codeHashHex)) {
  fail('missing or invalid contract.codeHashHex');
}

const missingChecks = requiredChecks.filter((check) => evidence.checks?.[check] !== true);
if (missingChecks.length > 0) {
  fail(`required checks are not complete: ${missingChecks.join(', ')}`);
}

console.log('Multi-millionaire V3 testnet gate passed.');
