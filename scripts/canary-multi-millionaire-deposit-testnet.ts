import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, beginCell, fromNano, internal, type Cell, type Contract } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, type TonClientParameters, WalletContractV4 } from '@ton/ton';
import {
  createMintTest72HMessageCell,
  H72H_JETTON_SCALE,
  TACT_MESSAGE_OPCODES,
  to72HJettonUnits,
} from '../src/encoding/tactMessageCells.js';

type GeneratedContractInstance = Contract & {
  readonly address: Address;
};

type GeneratedContractClass<TContract extends GeneratedContractInstance> = {
  fromAddress: (address: Address) => TContract;
};

type ChainStateName = 'active' | 'uninitialized' | 'frozen' | 'unknown';

type DepositVaultManifest = {
  readonly contracts: {
    readonly TestJetton72H: string;
    readonly MultiMillionaireDepositVault: string;
    readonly MultiMillionaireDepositVaultJettonWallet: string;
  };
};

type OpenedTestJetton = GeneratedContractInstance & {
  getGetWalletAddress: (owner: Address) => Promise<Address>;
  getGetTotalSupply72H: () => Promise<bigint>;
};

type OpenedTestJettonWallet = GeneratedContractInstance & {
  getGetBalance: () => Promise<bigint>;
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
  getUserState: (user: Address) => Promise<{
    activeRaw: bigint;
    targetUsd9: bigint;
    seasonId: bigint;
    waveId: bigint;
    goalReached: boolean;
    pendingWithdrawal: boolean;
  }>;
  getSupportedTarget: (targetUsd9: bigint) => Promise<boolean>;
  getDerivedDepositKey: (user: Address, queryId: bigint) => Promise<bigint>;
};

const DEFAULT_AMOUNT_72H = 1_000n;
const DEFAULT_TARGET_USD9 = 100_000n * 1_000_000_000n;
const DEFAULT_SEASON_ID = 1;
const DEFAULT_WAVE_ID = 1;
const MINT_MESSAGE_VALUE = 80_000_000n;
const JETTON_TRANSFER_MESSAGE_VALUE = 120_000_000n;
const JETTON_FORWARD_TON_AMOUNT = 20_000_000n;
const POLL_INTERVAL_MS = 2_500;
const POLL_ATTEMPTS = 40;

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

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optionalEnv(name: string) {
  return process.env[name]?.trim() || undefined;
}

function parsePositiveBigintEnv(name: string, fallback: bigint) {
  const value = optionalEnv(name);
  if (!value) return fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive whole number.`);
  return BigInt(value);
}

function parseUintEnv(name: string, fallback: number, max: number) {
  const value = optionalEnv(name);
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative whole number.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) {
    throw new Error(`${name} must be between 0 and ${max}.`);
  }
  return parsed;
}

function maskValue(value: string | undefined) {
  if (!value) return 'missing';
  if (value.length <= 12) return 'configured';
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function formatAddress(address: Address) {
  return address.toString({ testOnly: true });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableRpcError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('429') || message.includes('timeout') || message.includes('timed out') || message.includes('socket hang up') || message.includes('network');
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
      console.warn(`${label} failed (${getErrorMessage(error)}). Retrying in ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

async function loadGeneratedContract<TContract extends GeneratedContractInstance>(relativePath: string, exportName: string) {
  const absolutePath = resolve(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing generated wrapper ${relativePath}. Run npm run tact:build first.`);
  }
  const module = (await import(pathToFileURL(absolutePath).href)) as Record<string, unknown>;
  const contract = module[exportName] as GeneratedContractClass<TContract> | undefined;
  if (!contract?.fromAddress) {
    throw new Error(`Generated wrapper ${relativePath} does not export ${exportName}.`);
  }
  return contract;
}

function readDepositVaultManifest(): DepositVaultManifest {
  const path = resolve(process.cwd(), 'deployments/multi-millionaire-deposit-vault.testnet.latest.json');
  if (!existsSync(path)) {
    throw new Error('Missing deployments/multi-millionaire-deposit-vault.testnet.latest.json. Deploy the testnet DepositVault first.');
  }
  return JSON.parse(readFileSync(path, 'utf8')) as DepositVaultManifest;
}

function createClient(endpoint: string) {
  const apiKey = optionalEnv('TON_TESTNET_RPC_API_KEY') ?? optionalEnv('TON_TESTNET_API_KEY') ?? optionalEnv('TONCENTER_API_KEY');
  const parameters: TonClientParameters = { endpoint, timeout: 20_000 };
  if (apiKey) parameters.apiKey = apiKey;
  return new TonClient(parameters);
}

async function getWalletSeqno(client: TonClient, wallet: WalletContractV4) {
  return withRpcRetry('wallet seqno', () => wallet.getSeqno(client.provider(wallet.address, wallet.init)));
}

async function waitForSeqnoIncrease(client: TonClient, wallet: WalletContractV4, previousSeqno: number) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const nextSeqno = await getWalletSeqno(client, wallet);
    if (nextSeqno > previousSeqno) return nextSeqno;
  }
  throw new Error(`Wallet seqno did not increase from ${previousSeqno} before timeout.`);
}

async function waitForCondition(label: string, predicate: () => Promise<boolean>) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    if (await predicate()) return;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`${label} was not observed before timeout.`);
}

async function getContractState(client: TonClient, address: Address) {
  try {
    const state = await withRpcRetry(`contract state ${formatAddress(address)}`, () => client.getContractState(address));
    return { state: state.state as ChainStateName, balance: state.balance };
  } catch (error) {
    console.warn(`Unable to read ${formatAddress(address)} state: ${getErrorMessage(error)}`);
    return { state: 'unknown' as const, balance: 0n };
  }
}

async function sendInternalMessage(
  client: TonClient,
  wallet: WalletContractV4,
  label: string,
  input: { readonly to: Address; readonly value: bigint; readonly bounce: boolean; readonly secretKey: Buffer; readonly body: Cell },
): Promise<{ readonly beforeSeqno: number; readonly afterSeqno: number }> {
  const beforeSeqno = await getWalletSeqno(client, wallet);
  console.log(`Sending ${label}; wallet seqno=${beforeSeqno}`);
  const message = internal({
    to: input.to,
    value: input.value,
    bounce: input.bounce,
    body: input.body,
  });
  const transfer = wallet.createTransfer({
    seqno: beforeSeqno,
    secretKey: input.secretKey,
    messages: [message],
  });

  try {
    await withRpcRetry(`${label} send`, () => wallet.send(client.provider(wallet.address, wallet.init), transfer), 8);
  } catch (error) {
    let currentSeqno = beforeSeqno;
    try {
      currentSeqno = await getWalletSeqno(client, wallet);
    } catch (seqnoError) {
      throw new Error(`${label} send failed and seqno confirmation also failed: ${getErrorMessage(error)}; ${getErrorMessage(seqnoError)}`);
    }
    if (currentSeqno > beforeSeqno) {
      console.log(`Send response failed, but wallet seqno advanced to ${currentSeqno}.`);
      return { beforeSeqno, afterSeqno: currentSeqno };
    }
    throw error;
  }
  const afterSeqno = await waitForSeqnoIncrease(client, wallet, beforeSeqno);
  console.log(`Confirmed wallet seqno=${afterSeqno}`);
  return { beforeSeqno, afterSeqno };
}

function createTargetDepositPayload(input: { readonly seasonId: number; readonly waveId: number; readonly targetUsd9: bigint }) {
  return beginCell()
    .storeUint(input.seasonId, 8)
    .storeUint(input.waveId, 32)
    .storeUint(input.targetUsd9, 128);
}

function createTargetDepositTransferMessageCell(input: {
  readonly amount72H: bigint;
  readonly depositVault: Address;
  readonly responseDestination: Address;
  readonly queryId: bigint;
  readonly seasonId: number;
  readonly waveId: number;
  readonly targetUsd9: bigint;
}) {
  const forwardPayload = createTargetDepositPayload({
    seasonId: input.seasonId,
    waveId: input.waveId,
    targetUsd9: input.targetUsd9,
  });
  return beginCell()
    .storeUint(TACT_MESSAGE_OPCODES.JettonWallet.Transfer, 32)
    .storeUint(input.queryId, 64)
    .storeCoins(to72HJettonUnits(input.amount72H))
    .storeAddress(input.depositVault)
    .storeAddress(input.responseDestination)
    .storeMaybeRef(null)
    .storeCoins(JETTON_FORWARD_TON_AMOUNT)
    .storeBit(false)
    .storeBuilder(forwardPayload)
    .endCell();
}

function assertAddress(label: string, actual: Address, expected: Address) {
  if (!actual.equals(expected)) {
    throw new Error(`${label} mismatch: expected ${formatAddress(expected)}, got ${formatAddress(actual)}.`);
  }
}

function writeEvidence(evidence: Record<string, unknown>, suffix: string) {
  const directory = resolve(process.cwd(), 'deployments');
  mkdirSync(directory, { recursive: true });
  const generatedAt = String(evidence.generated_at ?? new Date().toISOString());
  const timestamp = generatedAt.replace(/[:.]/g, '-');
  const path = resolve(directory, `multi-millionaire-deposit-vault.testnet.canary.${suffix}.${timestamp}.json`);
  const latestPath = resolve(directory, `multi-millionaire-deposit-vault.testnet.canary.${suffix}.latest.json`);
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
  writeFileSync(latestPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return { path, latestPath };
}

const loadedEnvFiles = loadLocalEnv();
const manifest = readDepositVaultManifest();
const shouldSend = process.argv.includes('--send');
if (shouldSend && process.env.TON_TESTNET_ALLOW_MULTI_MILLIONAIRE_DEPOSIT_CANARY_SEND !== 'true') {
  throw new Error('Refusing to send. Set TON_TESTNET_ALLOW_MULTI_MILLIONAIRE_DEPOSIT_CANARY_SEND=true and pass --send.');
}

const endpoint = requireEnv('TON_TESTNET_RPC_URL');
const configuredDeployerAddress = Address.parse(requireEnv('TON_TESTNET_DEPLOYER_ADDRESS'));
const rehearsalWalletAddress = Address.parse(optionalEnv('TON_TESTNET_REHEARSAL_WALLET_ADDRESS') ?? formatAddress(configuredDeployerAddress));
const amount72H = parsePositiveBigintEnv('TON_TESTNET_MULTI_MILLIONAIRE_CANARY_AMOUNT_72H', DEFAULT_AMOUNT_72H);
const targetUsd9 = parsePositiveBigintEnv('TON_TESTNET_MULTI_MILLIONAIRE_TARGET_USD9', DEFAULT_TARGET_USD9);
const queryId = parsePositiveBigintEnv('TON_TESTNET_MULTI_MILLIONAIRE_QUERY_ID', BigInt(Date.now()));
const seasonId = parseUintEnv('TON_TESTNET_MULTI_MILLIONAIRE_CANARY_SEASON_ID', DEFAULT_SEASON_ID, 255);
const waveId = parseUintEnv('TON_TESTNET_MULTI_MILLIONAIRE_CANARY_WAVE_ID', DEFAULT_WAVE_ID, 4_294_967_295);
const amountAtomic = to72HJettonUnits(amount72H);
const testJettonAddress = Address.parse(manifest.contracts.TestJetton72H);
const depositVaultAddress = Address.parse(optionalEnv('TON_TESTNET_MULTI_MILLIONAIRE_DEPOSIT_VAULT_ADDRESS') ?? manifest.contracts.MultiMillionaireDepositVault);
const manifestDepositVaultAddress = Address.parse(manifest.contracts.MultiMillionaireDepositVault);
const manifestDepositVaultJettonWalletAddress = Address.parse(manifest.contracts.MultiMillionaireDepositVaultJettonWallet);
assertAddress('DepositVault env/manifest', depositVaultAddress, manifestDepositVaultAddress);

const client = createClient(endpoint);
const TestJetton72H = await loadGeneratedContract<OpenedTestJetton>('build/tact/TestJetton72H/TestJetton72H_TestJetton72H.ts', 'TestJetton72H');
const TestJetton72HWallet = await loadGeneratedContract<OpenedTestJettonWallet>(
  'build/tact/TestJetton72H/TestJetton72H_TestJetton72HWallet.ts',
  'TestJetton72HWallet',
);
const MultiMillionaireDepositVault = await loadGeneratedContract<OpenedDepositVault>(
  'build/tact/MultiMillionaireDepositVault/MultiMillionaireDepositVault_MultiMillionaireDepositVault.ts',
  'MultiMillionaireDepositVault',
);

const testJetton = client.open(TestJetton72H.fromAddress(testJettonAddress)) as OpenedTestJetton;
const depositVault = client.open(MultiMillionaireDepositVault.fromAddress(depositVaultAddress)) as OpenedDepositVault;
const userJettonWalletAddress = await withRpcRetry('user jetton wallet address', () => testJetton.getGetWalletAddress(rehearsalWalletAddress));
const depositVaultJettonWalletFromMaster = await withRpcRetry('deposit vault jetton wallet from master', () =>
  testJetton.getGetWalletAddress(depositVaultAddress),
);
assertAddress('DepositVault Jetton wallet manifest', depositVaultJettonWalletFromMaster, manifestDepositVaultJettonWalletAddress);

const userJettonWallet = client.open(TestJetton72HWallet.fromAddress(userJettonWalletAddress)) as OpenedTestJettonWallet;
const depositVaultJettonWallet = client.open(TestJetton72HWallet.fromAddress(depositVaultJettonWalletFromMaster)) as OpenedTestJettonWallet;
const userWalletState = await getContractState(client, userJettonWalletAddress);
const depositVaultState = await getContractState(client, depositVaultAddress);
const depositVaultJettonWalletState = await getContractState(client, depositVaultJettonWalletFromMaster);
if (depositVaultState.state !== 'active') {
  throw new Error(`DepositVault is not active. state=${depositVaultState.state}.`);
}

const vaultState = await withRpcRetry('DepositVault vaultState', () => depositVault.getVaultState());
assertAddress('DepositVault configured Jetton wallet', vaultState.vaultJettonWallet, depositVaultJettonWalletFromMaster);
const supportedTarget = await withRpcRetry('DepositVault supportedTarget', () => depositVault.getSupportedTarget(targetUsd9));
if (!supportedTarget) {
  throw new Error(`DepositVault does not support targetUsd9=${targetUsd9.toString()}.`);
}
const beforeUserState = await withRpcRetry('DepositVault userState before', () => depositVault.getUserState(rehearsalWalletAddress));
if (beforeUserState.targetUsd9 !== 0n && beforeUserState.targetUsd9 !== targetUsd9) {
  throw new Error(`Rehearsal wallet already has targetUsd9=${beforeUserState.targetUsd9.toString()}, cannot canary with ${targetUsd9.toString()}.`);
}

const beforeTotalSupply = await withRpcRetry('test jetton total supply before', () => testJetton.getGetTotalSupply72H());
const beforeUserJettonBalance =
  userWalletState.state === 'active'
    ? await withRpcRetry('user jetton balance before', () => userJettonWallet.getGetBalance())
    : 0n;
const beforeDepositVaultJettonBalance =
  depositVaultJettonWalletState.state === 'active'
    ? await withRpcRetry('deposit vault jetton balance before', () => depositVaultJettonWallet.getGetBalance())
    : 0n;
const beforeDepositKey = await withRpcRetry('DepositVault derivedDepositKey before', () =>
  depositVault.getDerivedDepositKey(rehearsalWalletAddress, queryId),
);
const mint = createMintTest72HMessageCell({ to: rehearsalWalletAddress, amount72H });
const transferBody = createTargetDepositTransferMessageCell({
  amount72H,
  depositVault: depositVaultAddress,
  responseDestination: rehearsalWalletAddress,
  queryId,
  seasonId,
  waveId,
  targetUsd9,
});

console.log('Multi-millionaire target deposit testnet canary');
console.log(`Mode: ${shouldSend ? 'send enabled' : 'dry-run'}`);
console.log(`Loaded env files: ${loadedEnvFiles.length > 0 ? loadedEnvFiles.join(', ') : 'none'}`);
console.log(`RPC URL: ${maskValue(endpoint)}`);
console.log(`Deployer: ${formatAddress(configuredDeployerAddress)}`);
console.log(`Rehearsal wallet: ${formatAddress(rehearsalWalletAddress)}`);
console.log(`TestJetton72H: ${formatAddress(testJettonAddress)}`);
console.log(`DepositVault: ${formatAddress(depositVaultAddress)} | state=${depositVaultState.state} | balance=${fromNano(depositVaultState.balance)} TON`);
console.log(`User Jetton wallet: ${formatAddress(userJettonWalletAddress)} | state=${userWalletState.state} | balance=${beforeUserJettonBalance.toString()}`);
console.log(`DepositVault Jetton wallet: ${formatAddress(depositVaultJettonWalletFromMaster)} | state=${depositVaultJettonWalletState.state} | balance=${beforeDepositVaultJettonBalance.toString()}`);
console.log(`Amount: ${amount72H.toString()} 72H (${amountAtomic.toString()} atomic units)`);
console.log(`TargetUsd9: ${targetUsd9.toString()} (${targetUsd9 / (1_000_000_000n)} USD)`);
console.log(`Season/Wave: ${seasonId}/${waveId}`);
console.log(`QueryId: ${queryId.toString()}`);
console.log(`DerivedDepositKey: ${beforeDepositKey.toString()}`);
console.log(`Before userState: activeRaw=${beforeUserState.activeRaw.toString()} targetUsd9=${beforeUserState.targetUsd9.toString()} season=${beforeUserState.seasonId.toString()} wave=${beforeUserState.waveId.toString()}`);
console.log(`Mint payload: ${mint.payloadBase64}`);
console.log(`Jetton transfer payload: ${transferBody.toBoc({ idx: false }).toString('base64')}`);

const baseEvidence = {
  evidence_type: 'multi-millionaire-v3-testnet-canary',
  generated_at: new Date().toISOString(),
  mode: shouldSend ? 'send' : 'dry-run',
  loaded_env: loadedEnvFiles,
  endpoint: maskValue(endpoint),
  deployer: formatAddress(configuredDeployerAddress),
  rehearsal_wallet: formatAddress(rehearsalWalletAddress),
  test_jetton_master: formatAddress(testJettonAddress),
  deposit_vault: formatAddress(depositVaultAddress),
  user_jetton_wallet: formatAddress(userJettonWalletAddress),
  user_jetton_wallet_state_before: userWalletState.state,
  deposit_vault_contract_state: depositVaultState.state,
  deposit_vault_jetton_wallet: formatAddress(depositVaultJettonWalletFromMaster),
  deposit_vault_jetton_wallet_state_before: depositVaultJettonWalletState.state,
  amount_72h: amount72H.toString(),
  amount_raw: amountAtomic.toString(),
  target_usd9: targetUsd9.toString(),
  season_id: seasonId,
  wave_id: waveId,
  query_id: queryId.toString(),
  derived_deposit_key: beforeDepositKey.toString(),
  supported_target: supportedTarget,
  before: {
    total_supply_raw: beforeTotalSupply.toString(),
    user_jetton_balance_raw: beforeUserJettonBalance.toString(),
    vault_jetton_balance_raw: beforeDepositVaultJettonBalance.toString(),
    user_state: {
      active_raw: beforeUserState.activeRaw.toString(),
      target_usd9: beforeUserState.targetUsd9.toString(),
      season_id: beforeUserState.seasonId.toString(),
      wave_id: beforeUserState.waveId.toString(),
      goal_reached: beforeUserState.goalReached,
      pending_withdrawal: beforeUserState.pendingWithdrawal,
    },
    vault_state: {
      total_deposited_raw: vaultState.totalDepositedRaw.toString(),
      deposit_count: vaultState.depositCount.toString(),
      last_depositor: formatAddress(vaultState.lastDepositor),
      last_season_id: vaultState.lastSeasonId.toString(),
      last_wave_id: vaultState.lastWaveId.toString(),
      last_amount_raw: vaultState.lastAmountRaw.toString(),
      last_target_usd9: vaultState.lastTargetUsd9.toString(),
    },
  },
  planned_messages: {
    mint_payload_base64: mint.payloadBase64,
    jetton_transfer_payload_base64: transferBody.toBoc({ idx: false }).toString('base64'),
  },
};

if (!shouldSend) {
  const evidence = {
    ...baseEvidence,
    status: 'pass',
    canary_sent: false,
    real_canary_complete: depositVaultJettonWalletState.state === 'active' && beforeUserState.activeRaw > 0n,
    note: 'No transactions sent. This dry-run only verifies state, addresses, supported target, derived key, and planned payloads.',
  };
  const evidencePaths = writeEvidence(evidence, 'dry-run');
  console.log('');
  console.log('No transactions sent. Dry-run checks completed: active DepositVault, configured Jetton wallet, supported target, derived key, balances, and planned mint/transfer payloads.');
  console.log(`Evidence written: ${evidencePaths.path}`);
  console.log('To send the testnet canary, set TON_TESTNET_ALLOW_MULTI_MILLIONAIRE_DEPOSIT_CANARY_SEND=true and run npm run canary:multi-millionaire-deposit:testnet:send.');
  process.exit(0);
}

const mnemonic = requireEnv('TON_TESTNET_DEPLOYER_MNEMONIC').split(/\s+/).filter(Boolean);
const keyPair = await mnemonicToPrivateKey(mnemonic);
const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
if (!wallet.address.equals(configuredDeployerAddress)) {
  throw new Error(`Configured deployer ${formatAddress(configuredDeployerAddress)} differs from derived Wallet V4 ${formatAddress(wallet.address)}.`);
}
if (!wallet.address.equals(rehearsalWalletAddress)) {
  throw new Error('Send mode requires TON_TESTNET_REHEARSAL_WALLET_ADDRESS to match the deployer Wallet V4.');
}

const mintSeqno = await sendInternalMessage(client, wallet, 'TestJetton72H.mintTest72H', {
  to: testJettonAddress,
  value: MINT_MESSAGE_VALUE,
  bounce: true,
  secretKey: keyPair.secretKey,
  body: mint.body,
});
await waitForCondition('minted user Jetton balance', async () => {
  const balance = await withRpcRetry('user jetton balance after mint', () => userJettonWallet.getGetBalance());
  return balance >= beforeUserJettonBalance + amountAtomic;
});
await waitForCondition('minted total supply', async () => {
  const totalSupply = await withRpcRetry('test jetton total supply after mint', () => testJetton.getGetTotalSupply72H());
  return totalSupply >= beforeTotalSupply + amountAtomic;
});

const transferSeqno = await sendInternalMessage(client, wallet, 'Jetton transfer to MultiMillionaireDepositVault', {
  to: userJettonWalletAddress,
  value: JETTON_TRANSFER_MESSAGE_VALUE,
  bounce: true,
  secretKey: keyPair.secretKey,
  body: transferBody,
});
await waitForCondition('DepositVault userState update', async () => {
  const userState = await withRpcRetry('DepositVault userState after transfer', () => depositVault.getUserState(rehearsalWalletAddress));
  return userState.activeRaw >= beforeUserState.activeRaw + amountAtomic && userState.targetUsd9 === targetUsd9;
});

const afterUserState = await withRpcRetry('DepositVault userState final', () => depositVault.getUserState(rehearsalWalletAddress));
const afterVaultState = await withRpcRetry('DepositVault vaultState final', () => depositVault.getVaultState());
const afterUserJettonBalance = await withRpcRetry('user jetton balance final', () => userJettonWallet.getGetBalance());
const afterDepositVaultJettonBalance = await withRpcRetry('deposit vault jetton balance final', () => depositVaultJettonWallet.getGetBalance());
const afterTotalSupply = await withRpcRetry('test jetton total supply final', () => testJetton.getGetTotalSupply72H());

if (afterUserState.activeRaw < beforeUserState.activeRaw + amountAtomic) {
  throw new Error(`DepositVault activeRaw did not increase enough: before=${beforeUserState.activeRaw.toString()} after=${afterUserState.activeRaw.toString()}.`);
}
if (afterUserState.targetUsd9 !== targetUsd9 || afterUserState.seasonId !== BigInt(seasonId) || afterUserState.waveId !== BigInt(waveId)) {
  throw new Error('DepositVault user state metadata mismatch after canary.');
}
if (afterDepositVaultJettonBalance < beforeDepositVaultJettonBalance + amountAtomic) {
  throw new Error('DepositVault Jetton wallet balance did not increase by canary amount.');
}
if (afterVaultState.lastAmountRaw !== amountAtomic || !afterVaultState.lastDepositor.equals(rehearsalWalletAddress)) {
  throw new Error('DepositVault vaultState last deposit mismatch after canary.');
}

console.log('');
console.log('Target deposit canary sent and verified.');
console.log(`Deposit key: ${beforeDepositKey.toString()}`);
console.log(`User activeRaw: ${afterUserState.activeRaw.toString()} (${afterUserState.activeRaw / H72H_JETTON_SCALE} 72H)`);
console.log(`User targetUsd9: ${afterUserState.targetUsd9.toString()}`);
console.log(`User season/wave: ${afterUserState.seasonId.toString()}/${afterUserState.waveId.toString()}`);
console.log(`DepositVault depositCount: ${afterVaultState.depositCount.toString()}`);
console.log(`DepositVault totalDepositedRaw: ${afterVaultState.totalDepositedRaw.toString()}`);
console.log(`User Jetton balance: ${afterUserJettonBalance.toString()}`);
console.log(`DepositVault Jetton balance: ${afterDepositVaultJettonBalance.toString()}`);
console.log(`TestJetton total supply: ${afterTotalSupply.toString()}`);

const sendEvidence = {
  ...baseEvidence,
  status: 'pass',
  canary_sent: true,
  real_canary_complete: true,
  wallet_seqno: {
    mint: mintSeqno,
    transfer: transferSeqno,
  },
  after: {
    total_supply_raw: afterTotalSupply.toString(),
    user_jetton_balance_raw: afterUserJettonBalance.toString(),
    vault_jetton_balance_raw: afterDepositVaultJettonBalance.toString(),
    user_state: {
      active_raw: afterUserState.activeRaw.toString(),
      target_usd9: afterUserState.targetUsd9.toString(),
      season_id: afterUserState.seasonId.toString(),
      wave_id: afterUserState.waveId.toString(),
      goal_reached: afterUserState.goalReached,
      pending_withdrawal: afterUserState.pendingWithdrawal,
    },
    vault_state: {
      vault_jetton_wallet: formatAddress(afterVaultState.vaultJettonWallet),
      total_deposited_raw: afterVaultState.totalDepositedRaw.toString(),
      deposit_count: afterVaultState.depositCount.toString(),
      last_depositor: formatAddress(afterVaultState.lastDepositor),
      last_season_id: afterVaultState.lastSeasonId.toString(),
      last_wave_id: afterVaultState.lastWaveId.toString(),
      last_amount_raw: afterVaultState.lastAmountRaw.toString(),
      last_target_usd9: afterVaultState.lastTargetUsd9.toString(),
    },
  },
};
const sendEvidencePaths = writeEvidence(sendEvidence, 'send');
console.log(`Evidence written: ${sendEvidencePaths.path}`);
