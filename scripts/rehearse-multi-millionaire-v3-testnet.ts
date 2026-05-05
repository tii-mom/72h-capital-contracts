import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, type Contract } from '@ton/core';
import { TonClient, type TonClientParameters } from '@ton/ton';

type GeneratedContractInstance = Contract & {
  readonly address: Address;
};

type OpenedDepositVault = GeneratedContractInstance & {
  getVaultState: () => Promise<{
    vaultJettonWallet: Address;
    totalDepositedRaw: bigint;
    depositCount: bigint;
    lastDepositor: Address;
    lastSeasonId: bigint;
    lastWaveId: bigint;
    lastAmountRaw: bigint;
    lastTargetUsd9: bigint;
  }>;
  getSupportedTarget: (targetUsd9: bigint) => Promise<boolean>;
  getDerivedDepositKey: (user: Address, queryId: bigint) => Promise<bigint>;
  getUserState: (user: Address) => Promise<{
    activeRaw: bigint;
    targetUsd9: bigint;
    seasonId: bigint;
    waveId: bigint;
    goalReached: boolean;
    pendingWithdrawal: boolean;
  }>;
};

type DepositVaultManifest = {
  readonly contracts: {
    readonly TestJetton72H: string;
    readonly MultiMillionaireDepositVault: string;
    readonly MultiMillionaireDepositVaultJettonWallet: string;
  };
};

const DEFAULT_TARGET_USD9 = 100_000n * 1_000_000_000n;
const DEFAULT_QUERY_ID = 1n;
const GENERATED_WRAPPER_EXTENSION = `.${'ts'}`;
const GENERATED_WRAPPER =
  `build/tact/MultiMillionaireDepositVault/MultiMillionaireDepositVault_MultiMillionaireDepositVault${GENERATED_WRAPPER_EXTENSION}`;
const LATEST_MANIFEST = 'deployments/multi-millionaire-deposit-vault.testnet.latest.json';

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return undefined;
  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex <= 0) return undefined;
  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function loadLocalEnv() {
  const loaded: string[] = [];
  for (const filename of ['.env.local', '.env']) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (parsed && process.env[parsed.key] === undefined) {
        process.env[parsed.key] = parsed.value;
      }
    }
    loaded.push(filename);
  }
  return loaded;
}

function optionalEnv(name: string) {
  return process.env[name]?.trim() || undefined;
}

function requireEnv(name: string) {
  const value = optionalEnv(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function readDepositVaultManifest(): DepositVaultManifest {
  const path = resolve(process.cwd(), LATEST_MANIFEST);
  if (!existsSync(path)) {
    throw new Error(`Missing ${LATEST_MANIFEST}. Deploy the testnet DepositVault first.`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as DepositVaultManifest;
}

function parseBigintEnv(name: string, fallback: bigint) {
  const value = optionalEnv(name);
  if (!value) return fallback;
  if (!/^[0-9]+$/.test(value)) throw new Error(`${name} must be a non-negative whole number.`);
  return BigInt(value);
}

function maskValue(value: string | undefined) {
  if (!value) return 'missing';
  if (value.length <= 12) return 'configured';
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function formatAddress(address: Address) {
  return address.toString({ testOnly: true });
}

function createClient(endpoint: string) {
  const apiKey = optionalEnv('TON_TESTNET_RPC_API_KEY') ?? optionalEnv('TON_TESTNET_API_KEY') ?? optionalEnv('TONCENTER_API_KEY');
  const parameters: TonClientParameters = { endpoint, timeout: 20_000 };
  if (apiKey) parameters.apiKey = apiKey;
  return new TonClient(parameters);
}

function isRetryableRpcError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('429') || message.includes('timeout') || message.includes('socket hang up') || message.includes('network');
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function withRpcRetry<T>(label: string, operation: () => Promise<T>, attempts = 6) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableRpcError(error) || attempt === attempts) break;
      const delayMs = attempt * 5_000;
      console.warn(`${label} failed (${error instanceof Error ? error.message : String(error)}). Retrying in ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

async function loadDepositVaultClass() {
  const absolutePath = resolve(process.cwd(), GENERATED_WRAPPER);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing generated wrapper ${GENERATED_WRAPPER}. Run npm run tact:build first.`);
  }
  const module = await import(pathToFileURL(absolutePath).href);
  if (!module.MultiMillionaireDepositVault?.fromAddress) {
    throw new Error(`Generated wrapper ${GENERATED_WRAPPER} does not export MultiMillionaireDepositVault.`);
  }
  return module.MultiMillionaireDepositVault as {
    fromAddress: (address: Address) => OpenedDepositVault;
  };
}

async function main() {
  const send = process.argv.includes('--send');
  const loadedEnv = loadLocalEnv();
  const manifest = readDepositVaultManifest();
  const endpoint = optionalEnv('TON_TESTNET_RPC_URL') || 'https://testnet.toncenter.com/api/v2/jsonRPC';
  const vaultAddress = Address.parse(
    optionalEnv('TON_TESTNET_MULTI_MILLIONAIRE_DEPOSIT_VAULT_ADDRESS') ?? manifest.contracts.MultiMillionaireDepositVault,
  );
  const manifestVaultAddress = Address.parse(manifest.contracts.MultiMillionaireDepositVault);
  if (!vaultAddress.equals(manifestVaultAddress)) {
    throw new Error(`TON_TESTNET_MULTI_MILLIONAIRE_DEPOSIT_VAULT_ADDRESS does not match ${LATEST_MANIFEST}.`);
  }
  const rehearsalWallet = Address.parse(optionalEnv('TON_TESTNET_REHEARSAL_WALLET_ADDRESS') ?? optionalEnv('TON_TESTNET_DEPLOYER_ADDRESS') ?? requireEnv('TON_TESTNET_REHEARSAL_WALLET_ADDRESS'));
  const manifestVaultJettonWallet = Address.parse(manifest.contracts.MultiMillionaireDepositVaultJettonWallet);
  const targetUsd9 = parseBigintEnv('TON_TESTNET_MULTI_MILLIONAIRE_TARGET_USD9', DEFAULT_TARGET_USD9);
  const queryId = parseBigintEnv('TON_TESTNET_MULTI_MILLIONAIRE_QUERY_ID', DEFAULT_QUERY_ID);

  if (send) {
    throw new Error(
      'Sending a DepositVault canary is intentionally not implemented in this script yet. Use this script for read-only getter rehearsal, then add a reviewed Jetton transfer sender before running a --send canary.'
    );
  }

  const DepositVault = await loadDepositVaultClass();
  const client = createClient(endpoint);
  const vault = client.open(DepositVault.fromAddress(vaultAddress)) as unknown as OpenedDepositVault;
  const state = await withRpcRetry('DepositVault contract state', () => client.getContractState(vaultAddress));
  if (state.state !== 'active') {
    throw new Error(`DepositVault is not active. state=${state.state}`);
  }
  const vaultJettonWalletState = await withRpcRetry('DepositVault Jetton wallet state', () => client.getContractState(manifestVaultJettonWallet));
  const vaultState = await withRpcRetry<Awaited<ReturnType<OpenedDepositVault['getVaultState']>>>('DepositVault vaultState', () => vault.getVaultState());
  if (!vaultState.vaultJettonWallet.equals(manifestVaultJettonWallet)) {
    throw new Error(`DepositVault configured Jetton wallet does not match manifest ${formatAddress(manifestVaultJettonWallet)}.`);
  }

  const supportedTarget = await withRpcRetry<boolean>('DepositVault supportedTarget', () => vault.getSupportedTarget(targetUsd9));
  if (!supportedTarget) {
    throw new Error(`DepositVault does not support targetUsd9=${targetUsd9.toString()}.`);
  }
  const derivedDepositKey = await withRpcRetry<bigint>('DepositVault derivedDepositKey', () => vault.getDerivedDepositKey(rehearsalWallet, queryId));
  const userState = await withRpcRetry<Awaited<ReturnType<OpenedDepositVault['getUserState']>>>('DepositVault userState', () => vault.getUserState(rehearsalWallet));

  const realCanaryComplete = vaultJettonWalletState.state === 'active' && userState.activeRaw > 0n;
  const evidence = {
    status: 'pass',
    mode: 'read_only',
    evidence_type: 'multi-millionaire-v3-testnet-rehearsal',
    generated_at: new Date().toISOString(),
    loaded_env: loadedEnv,
    endpoint: maskValue(endpoint),
    manifest: LATEST_MANIFEST,
    test_jetton_master: manifest.contracts.TestJetton72H,
    deposit_vault: formatAddress(vaultAddress),
    rehearsal_wallet: formatAddress(rehearsalWallet),
    manifest_vault_jetton_wallet: formatAddress(manifestVaultJettonWallet),
    vault_contract_state: state.state,
    vault_jetton_wallet_state: vaultJettonWalletState.state,
    real_canary_complete: realCanaryComplete,
    canary_status: realCanaryComplete
      ? 'testnet canary deposit observed'
      : 'not complete: vault Jetton wallet is uninitialized or rehearsal user has no active deposit',
    target_usd9: targetUsd9.toString(),
    query_id: queryId.toString(),
    supported_target: supportedTarget,
    derived_deposit_key: derivedDepositKey.toString(),
    vault_state: {
      vault_jetton_wallet: formatAddress(vaultState.vaultJettonWallet),
      total_deposited_raw: vaultState.totalDepositedRaw.toString(),
      deposit_count: vaultState.depositCount.toString(),
      last_depositor: formatAddress(vaultState.lastDepositor),
      last_season_id: vaultState.lastSeasonId.toString(),
      last_wave_id: vaultState.lastWaveId.toString(),
      last_amount_raw: vaultState.lastAmountRaw.toString(),
      last_target_usd9: vaultState.lastTargetUsd9.toString(),
    },
    user_state: {
      active_raw: userState.activeRaw.toString(),
      target_usd9: userState.targetUsd9.toString(),
      season_id: userState.seasonId.toString(),
      wave_id: userState.waveId.toString(),
      goal_reached: userState.goalReached,
      pending_withdrawal: userState.pendingWithdrawal,
    },
  };

  const directory = resolve(process.cwd(), 'deployments');
  mkdirSync(directory, { recursive: true });
  const timestamp = evidence.generated_at.replace(/[:.]/g, '-');
  const evidencePath = resolve(directory, `multi-millionaire-deposit-vault.testnet.rehearsal.${timestamp}.json`);
  const latestPath = resolve(directory, 'multi-millionaire-deposit-vault.testnet.rehearsal.latest.json');
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  writeFileSync(latestPath, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(JSON.stringify({
    ...evidence,
    evidence_path: evidencePath,
    latest_evidence_path: latestPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
