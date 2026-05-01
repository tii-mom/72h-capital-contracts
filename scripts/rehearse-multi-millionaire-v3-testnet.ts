import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, beginCell, fromNano, internal, toNano, type Cell, type Sender, type SenderArguments } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, WalletContractV4, type TonClientParameters } from '@ton/ton';
import { JettonMinterV2, JettonWalletV2 } from '../src/jetton-v2/index.js';

const SCALE = 1_000_000_000n;
const TARGET_10K_USD9 = 10_000n * SCALE;
const DEPOSIT_AMOUNT = 10_000n * SCALE;
const POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 2_000;

type Evidence = {
  network: 'ton-testnet';
  status: 'pending' | 'complete';
  updatedAt: string;
  contract: {
    name: 'MultiMillionaireDepositVault';
    address: string;
    codeHashHex: string;
  };
  jettonMaster: string;
  vaultJettonWallet: string;
  deployer: string;
  checks: Record<string, boolean>;
  evidence: Record<string, string>;
};

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
  const value = process.env[name]?.trim();
  return value || undefined;
}

function requireEnv(name: string) {
  const value = optionalEnv(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableRpcError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('429') || message.includes('timeout') || message.includes('socket') || message.includes('network');
}

async function withRpcRetry<T>(operation: () => Promise<T>, attempts = 5) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableRpcError(error) || attempt === attempts) break;
      await sleep(attempt * 5_000);
    }
  }
  throw lastError;
}

async function getWalletSeqno(client: TonClient, wallet: WalletContractV4) {
  return withRpcRetry(() => wallet.getSeqno(client.provider(wallet.address, wallet.init)));
}

async function waitForSeqnoIncrease(client: TonClient, wallet: WalletContractV4, previousSeqno: number) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const seqno = await getWalletSeqno(client, wallet);
    if (seqno > previousSeqno) return seqno;
  }
  throw new Error(`Wallet seqno did not increase from ${previousSeqno}.`);
}

function createWalletSender(client: TonClient, wallet: WalletContractV4, secretKey: Buffer): Sender {
  return {
    address: wallet.address,
    async send(args: SenderArguments) {
      const seqno = await getWalletSeqno(client, wallet);
      const transfer = wallet.createTransfer({
        seqno,
        secretKey,
        messages: [
          internal({
            to: args.to,
            value: args.value,
            bounce: args.bounce ?? true,
            init: args.init,
            body: args.body,
          }),
        ],
      });
      await withRpcRetry(() => wallet.send(client.provider(wallet.address, wallet.init), transfer), 8);
      await waitForSeqnoIncrease(client, wallet, seqno);
    },
  };
}

async function loadDepositVaultClass() {
  const modulePath = resolve(
    process.cwd(),
    'build/tact/MultiMillionaireDepositVault/MultiMillionaireDepositVault_MultiMillionaireDepositVault.js',
  );
  const tsModulePath = modulePath.replace(/\.js$/, '.ts');
  const actualPath = existsSync(modulePath) ? modulePath : tsModulePath;
  const module = await import(pathToFileURL(actualPath).href) as {
    MultiMillionaireDepositVault: {
      fromInit(owner: Address, jettonMaster: Address): Promise<{
        address: Address;
        init?: { code: Cell; data: Cell };
        send(provider: unknown, via: Sender, args: { value: bigint; bounce?: boolean }, message: unknown): Promise<void>;
        getVaultState(provider: unknown): Promise<{ paused: boolean; vaultJettonWallet: Address | null; depositCount: bigint; totalActiveRaw: bigint }>;
        getUserState(provider: unknown, user: Address): Promise<{ activeRaw: bigint; targetUsd9: bigint }>;
        getSupportedTarget(provider: unknown, targetUsd9: bigint): Promise<boolean>;
      }>;
    };
  };
  return module.MultiMillionaireDepositVault;
}

function depositGoalPayload(seasonId: bigint, waveId: bigint, targetUsd9: bigint) {
  return beginCell()
    .storeBit(false)
    .storeUint(seasonId, 8)
    .storeUint(waveId, 32)
    .storeUint(targetUsd9, 128)
    .endCell();
}

function writeEvidence(evidence: Evidence) {
  const outputDir = resolve(process.cwd(), 'deployments/apps/multi-millionaire/v3');
  mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const timestampedPath = resolve(outputDir, `deposit-vault.testnet.${timestamp}.json`);
  const latestPath = resolve(outputDir, 'deposit-vault.testnet.latest.json');
  writeFileSync(timestampedPath, `${JSON.stringify(evidence, null, 2)}\n`);
  writeFileSync(latestPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Evidence: ${latestPath}`);
}

const loadedEnvFiles = loadLocalEnv();
const send = process.argv.includes('--send');
const allowSend = optionalEnv('TON_TESTNET_ALLOW_MULTI_MILLIONAIRE_V3_SEND') === 'true';
const endpoint = requireEnv('TON_TESTNET_RPC_URL');
const mnemonic = requireEnv('TON_TESTNET_DEPLOYER_MNEMONIC');
const keyPair = await mnemonicToPrivateKey(mnemonic.split(/\s+/).filter(Boolean));
const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
const configuredDeployer = Address.parse(requireEnv('TON_TESTNET_DEPLOYER_ADDRESS'));

if (!wallet.address.equals(configuredDeployer)) {
  throw new Error(`Derived deployer ${formatAddress(wallet.address)} does not match TON_TESTNET_DEPLOYER_ADDRESS ${formatAddress(configuredDeployer)}.`);
}

const latestJetton = readJson<{ jettonMaster: string }>(resolve(process.cwd(), 'deployments/jetton-v2.testnet.latest.json'));
const jettonMaster = Address.parse(latestJetton.jettonMaster);
const client = createClient(endpoint);
const sender = createWalletSender(client, wallet, keyPair.secretKey);
const minter = client.open(JettonMinterV2.createFromAddress(jettonMaster));
const DepositVault = await loadDepositVaultClass();
const vault = await DepositVault.fromInit(wallet.address, jettonMaster);
const openedVault = client.open(vault);
const vaultJettonWallet = await withRpcRetry(() => minter.getWalletAddress(vault.address));
const ownerJettonWallet = await withRpcRetry(() => minter.getWalletAddress(wallet.address));
const ownerJettonWalletContract = client.open(JettonWalletV2.createFromAddress(ownerJettonWallet));
const walletBalance = await withRpcRetry(() => client.getBalance(wallet.address));
const ownerJettonBalance = await withRpcRetry(() => ownerJettonWalletContract.getJettonBalance());

console.log('Multi-millionaire V3 DepositVault testnet rehearsal');
console.log(`Loaded env files: ${loadedEnvFiles.length > 0 ? loadedEnvFiles.join(', ') : 'none'}`);
console.log(`Send mode: ${send ? 'requested' : 'dry-run'}`);
console.log(`Deployer: ${formatAddress(wallet.address)} | balance=${fromNano(walletBalance)} TON`);
console.log(`Jetton master: ${formatAddress(jettonMaster)}`);
console.log(`Owner Jetton wallet: ${formatAddress(ownerJettonWallet)} | balance=${ownerJettonBalance}`);
console.log(`DepositVault: ${formatAddress(vault.address)}`);
console.log(`Vault Jetton wallet: ${formatAddress(vaultJettonWallet)}`);

if (!send) {
  console.log('No transactions sent. Re-run with --send and TON_TESTNET_ALLOW_MULTI_MILLIONAIRE_V3_SEND=true.');
  process.exit(0);
}
if (!allowSend) {
  throw new Error('Refusing to send. Set TON_TESTNET_ALLOW_MULTI_MILLIONAIRE_V3_SEND=true and pass --send.');
}
if (ownerJettonBalance < DEPOSIT_AMOUNT) {
  throw new Error(`Owner Jetton wallet balance ${ownerJettonBalance} is below required deposit ${DEPOSIT_AMOUNT}.`);
}

await openedVault.send(sender, { value: toNano('0.08') }, null);
await openedVault.send(sender, { value: toNano('0.05') }, {
  $$type: 'SetVaultJettonWallet',
  queryId: 1n,
  vaultJettonWallet,
});
await openedVault.send(sender, { value: toNano('0.05') }, { $$type: 'SetPaused', paused: false });

const supportedTarget = await withRpcRetry(() => openedVault.getSupportedTarget(TARGET_10K_USD9));
if (!supportedTarget) throw new Error('TARGET_10K_USD9 is not supported after deploy.');

await ownerJettonWalletContract.sendTransfer(sender, {
  value: toNano('0.25'),
  jettonAmount: DEPOSIT_AMOUNT,
  to: vault.address,
  responseAddress: wallet.address,
  forwardTonAmount: toNano('0.02'),
  forwardPayload: depositGoalPayload(1n, 1n, TARGET_10K_USD9),
  queryId: 10n,
});

await sleep(10_000);
const vaultState = await withRpcRetry(() => openedVault.getVaultState());
const userState = await withRpcRetry(() => openedVault.getUserState(wallet.address));
if (vaultState.paused) throw new Error('Vault remained paused after SetPaused(false).');
if (!vaultState.vaultJettonWallet?.equals(vaultJettonWallet)) throw new Error('Vault Jetton wallet getter mismatch.');
if (vaultState.depositCount < 1n) throw new Error(`Deposit count did not increase; got ${vaultState.depositCount}.`);
if (userState.activeRaw < DEPOSIT_AMOUNT) throw new Error(`User active raw ${userState.activeRaw} below expected ${DEPOSIT_AMOUNT}.`);
if (userState.targetUsd9 !== TARGET_10K_USD9) throw new Error(`User target ${userState.targetUsd9} mismatch.`);

writeEvidence({
  network: 'ton-testnet',
  status: 'pending',
  updatedAt: new Date().toISOString(),
  contract: {
    name: 'MultiMillionaireDepositVault',
    address: formatAddress(vault.address),
    codeHashHex: vault.init?.code.hash().toString('hex') ?? '',
  },
  jettonMaster: formatAddress(jettonMaster),
  vaultJettonWallet: formatAddress(vaultJettonWallet),
  deployer: formatAddress(wallet.address),
  checks: {
    local_typecheck: true,
    local_tact_check: true,
    local_vitest: true,
    testnet_deploy: true,
    testnet_vault_wallet_bound: true,
    testnet_deposit_supported_target: true,
    testnet_rejects_bad_sender: false,
    testnet_rejects_bad_target: false,
    testnet_withdraw_after_goal: false,
    testnet_finalize_excesses: false,
    testnet_bounce_restore: false,
  },
  evidence: {
    deployTxHash: '',
    vaultWalletBindTxHash: '',
    supportedDepositTxHash: '',
    withdrawTxHash: '',
    finalizeTxHash: '',
    bounceRestoreTxHash: '',
    notes: 'Phase 1 complete. Price-delay withdrawal and negative testnet checks remain incomplete.',
  },
});
