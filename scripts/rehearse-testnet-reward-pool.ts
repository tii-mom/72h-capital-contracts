import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, fromNano, internal, type Cell, type Contract } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, type TonClientParameters, WalletContractV4 } from '@ton/ton';
import {
  createMintTest72HMessageCell,
  createRegisterRewardSeatMessageCell,
  createReserveJettonTransferMessageCell,
  createRewardClaimMessageCell,
  to72HJettonUnits,
} from '../src/encoding/tactMessageCells.js';
import type { CapitalAppSlug } from '../src/types/domain.js';

type GeneratedContractInstance = Contract & { readonly address: Address };
type GeneratedContractClass<TContract extends GeneratedContractInstance> = {
  fromAddress: (address: Address) => TContract;
};
type Manifest = {
  readonly contracts: {
    readonly TestJetton72H: string;
    readonly AppRewardPools: Record<CapitalAppSlug, string>;
  };
};
type OpenedAppRewardPool = GeneratedContractInstance & {
  getGetJettonWalletAddress: () => Promise<Address>;
  getGetAvailableRewards72H: () => Promise<bigint>;
  getGetTotalFunded72H: () => Promise<bigint>;
  getGetTotalClaimed72H: () => Promise<bigint>;
  getGetTotalRewardWeight: () => Promise<bigint>;
  getGetSeatOwner: (seatType: bigint, seatNumber: bigint) => Promise<Address>;
  getGetPendingClaimQuery: (seatType: bigint, seatNumber: bigint) => Promise<bigint>;
};
type OpenedTestJetton = GeneratedContractInstance & {
  getGetWalletAddress: (owner: Address) => Promise<Address>;
};
type OpenedTestJettonWallet = GeneratedContractInstance & {
  getGetBalance: () => Promise<bigint>;
};

const DEFAULT_APP: CapitalAppSlug = '72hours';
const DEFAULT_REWARD_AMOUNT_72H = 72n;
const MESSAGE_VALUE = 90_000_000n;
const ADMIN_MESSAGE_VALUE = 30_000_000n;
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
  for (const filename of ['.env.local', '.env']) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (parsed && process.env[parsed.key] === undefined) process.env[parsed.key] = parsed.value;
    }
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optionalEnv(name: string) {
  return process.env[name]?.trim() || undefined;
}

function formatAddress(address: Address) {
  return address.toString({ testOnly: true });
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableRpcError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('429') || message.includes('timeout') || message.includes('socket hang up') || message.includes('network');
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
  const module = (await import(pathToFileURL(absolutePath).href)) as Record<string, unknown>;
  const contract = module[exportName] as GeneratedContractClass<TContract> | undefined;
  if (!contract?.fromAddress) throw new Error(`Generated wrapper ${relativePath} does not export ${exportName}.`);
  return contract;
}

function readManifest(): Manifest {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'deployments/testnet.latest.json'), 'utf8')) as Manifest;
}

function createClient(endpoint: string) {
  const apiKey = optionalEnv('TON_TESTNET_RPC_API_KEY') ?? optionalEnv('TON_TESTNET_API_KEY') ?? optionalEnv('TONCENTER_API_KEY');
  const parameters: TonClientParameters = { endpoint, timeout: 20_000 };
  if (apiKey) parameters.apiKey = apiKey;
  return new TonClient(parameters);
}

function parseApp(value: string | undefined): CapitalAppSlug {
  const app = value?.trim() || DEFAULT_APP;
  if (app !== '72hours' && app !== 'wan' && app !== 'multi-millionaire') throw new Error(`Unsupported app ${app}.`);
  return app;
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
  throw new Error(`Wallet seqno did not increase from ${previousSeqno}.`);
}

async function sendInternalMessage(client: TonClient, wallet: WalletContractV4, label: string, input: {
  readonly to: Address;
  readonly value: bigint;
  readonly bounce: boolean;
  readonly secretKey: Buffer;
  readonly body: Cell;
}) {
  const beforeSeqno = await getWalletSeqno(client, wallet);
  console.log(`Sending ${label}; wallet seqno=${beforeSeqno}`);
  const transfer = wallet.createTransfer({
    seqno: beforeSeqno,
    secretKey: input.secretKey,
    messages: [internal({ to: input.to, value: input.value, bounce: input.bounce, body: input.body })],
  });
  try {
    await withRpcRetry(`${label} send`, () => wallet.send(client.provider(wallet.address, wallet.init), transfer), 8);
  } catch (error) {
    const currentSeqno = await getWalletSeqno(client, wallet);
    if (currentSeqno <= beforeSeqno) throw error;
  }
  const afterSeqno = await waitForSeqnoIncrease(client, wallet, beforeSeqno);
  console.log(`Confirmed wallet seqno=${afterSeqno}`);
}

async function waitForPoolFunded(pool: OpenedAppRewardPool, minimum: bigint) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const available = await withRpcRetry('reward pool available', () => pool.getGetAvailableRewards72H());
    if (available >= minimum) return available;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('Reward pool funding did not appear before timeout.');
}

async function getJettonWalletBalanceOrZero(label: string, wallet: OpenedTestJettonWallet) {
  try {
    return await withRpcRetry(label, () => wallet.getGetBalance());
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes('exit_code: -13') || message.toLowerCase().includes('uninitialized')) {
      return 0n;
    }
    throw error;
  }
}

loadLocalEnv();
const shouldSend = process.argv.includes('--send');
if (shouldSend && process.env.TON_TESTNET_ALLOW_REWARD_REHEARSAL_SEND !== 'true') {
  throw new Error('Refusing to send. Set TON_TESTNET_ALLOW_REWARD_REHEARSAL_SEND=true and pass --send.');
}

const app = parseApp(process.env.TON_TESTNET_REHEARSAL_APP);
const rewardAmount72H = BigInt(process.env.TON_TESTNET_REWARD_AMOUNT_72H?.trim() || DEFAULT_REWARD_AMOUNT_72H.toString());
const rewardAmountAtomic = to72HJettonUnits(rewardAmount72H);
const manifest = readManifest();
const client = createClient(requireEnv('TON_TESTNET_RPC_URL'));
const configuredAddress = Address.parse(requireEnv('TON_TESTNET_DEPLOYER_ADDRESS'));
const keyPair = await mnemonicToPrivateKey(requireEnv('TON_TESTNET_DEPLOYER_MNEMONIC').split(/\s+/).filter(Boolean));
const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
if (!wallet.address.equals(configuredAddress)) throw new Error('Configured deployer does not match derived wallet.');

const TestJetton72H = await loadGeneratedContract<GeneratedContractInstance>('build/tact/TestJetton72H/TestJetton72H_TestJetton72H.ts', 'TestJetton72H');
const TestJetton72HWallet = await loadGeneratedContract<GeneratedContractInstance>('build/tact/TestJetton72H/TestJetton72H_TestJetton72HWallet.ts', 'TestJetton72HWallet');
const AppRewardPool = await loadGeneratedContract<GeneratedContractInstance>('build/tact/AppRewardPool/AppRewardPool_AppRewardPool.ts', 'AppRewardPool');

const testJetton = client.open(TestJetton72H.fromAddress(Address.parse(manifest.contracts.TestJetton72H))) as OpenedTestJetton;
const poolAddress = Address.parse(manifest.contracts.AppRewardPools[app]);
const pool = client.open(AppRewardPool.fromAddress(poolAddress)) as OpenedAppRewardPool;
const userJettonWalletAddress = await withRpcRetry('user jetton wallet address', () => testJetton.getGetWalletAddress(wallet.address));
const poolJettonWalletAddress = await withRpcRetry('pool jetton wallet address', () => pool.getGetJettonWalletAddress());
const userJettonWallet = client.open(TestJetton72HWallet.fromAddress(userJettonWalletAddress)) as OpenedTestJettonWallet;
const poolJettonWallet = client.open(TestJetton72HWallet.fromAddress(poolJettonWalletAddress)) as OpenedTestJettonWallet;

console.log('72H Capital testnet RewardPool rehearsal');
console.log(`Mode: ${shouldSend ? 'send enabled' : 'dry-run'}`);
console.log(`App: ${app}`);
console.log(`Reward amount: ${rewardAmount72H} 72H`);
console.log(`AppRewardPool: ${formatAddress(poolAddress)}`);
console.log(`User Jetton wallet: ${formatAddress(userJettonWalletAddress)}`);
console.log(`Pool Jetton wallet: ${formatAddress(poolJettonWalletAddress)}`);
console.log(`Before: user=${(await getJettonWalletBalanceOrZero('user balance before', userJettonWallet)).toString()} pool=${(await getJettonWalletBalanceOrZero('pool balance before', poolJettonWallet)).toString()} available=${(await withRpcRetry('pool available before', () => pool.getGetAvailableRewards72H())).toString()} weight=${(await withRpcRetry('pool weight before', () => pool.getGetTotalRewardWeight())).toString()}`);

if (!shouldSend) {
  console.log('No transactions sent. To run, set TON_TESTNET_ALLOW_REWARD_REHEARSAL_SEND=true and use npm run rehearse:testnet:reward:send.');
  process.exit(0);
}

await sendInternalMessage(client, wallet, 'AppRewardPool.registerRewardSeat(reserve #1)', {
  to: poolAddress,
  value: ADMIN_MESSAGE_VALUE,
  bounce: true,
  secretKey: keyPair.secretKey,
  body: createRegisterRewardSeatMessageCell({ seatType: 'reserve', seatNumber: 1, owner: wallet.address }).body,
});

const seatOwner = await withRpcRetry('reward seat owner', () => pool.getGetSeatOwner(1n, 1n));
if (!seatOwner.equals(wallet.address)) throw new Error(`Reward seat owner mismatch: ${formatAddress(seatOwner)}`);

await sendInternalMessage(client, wallet, 'TestJetton72H.mint reward funds', {
  to: Address.parse(manifest.contracts.TestJetton72H),
  value: MESSAGE_VALUE,
  bounce: true,
  secretKey: keyPair.secretKey,
  body: createMintTest72HMessageCell({ to: wallet.address, amount72H: rewardAmount72H }).body,
});

await sendInternalMessage(client, wallet, 'Jetton transfer to AppRewardPool', {
  to: userJettonWalletAddress,
  value: MESSAGE_VALUE,
  bounce: true,
  secretKey: keyPair.secretKey,
  body: createReserveJettonTransferMessageCell({
    app,
    userJettonWallet: userJettonWalletAddress,
    reserveVault: poolAddress,
    responseDestination: wallet.address,
    amount72H: rewardAmount72H,
    queryId: 72_500n,
    forwardTonAmountNanoTon: 10_000_000n,
  }).body,
});

await waitForPoolFunded(pool, rewardAmountAtomic);

await sendInternalMessage(client, wallet, 'AppRewardPool.claimReward(reserve #1)', {
  to: poolAddress,
  value: MESSAGE_VALUE,
  bounce: true,
  secretKey: keyPair.secretKey,
  body: createRewardClaimMessageCell({ seatType: 'reserve', seatNumber: 1 }).body,
});

await sleep(15_000);
const pendingClaimQuery = await withRpcRetry('pending reward claim query', () => pool.getGetPendingClaimQuery(1n, 1n));
if (pendingClaimQuery > 0n) {
  throw new Error(`Reward claim still pending after Jetton wallet success response wait: ${pendingClaimQuery}`);
}
const userBalance = await getJettonWalletBalanceOrZero('user balance final', userJettonWallet);
const poolBalance = await getJettonWalletBalanceOrZero('pool balance final', poolJettonWallet);
const available = await withRpcRetry('pool available final', () => pool.getGetAvailableRewards72H());
const funded = await withRpcRetry('pool funded final', () => pool.getGetTotalFunded72H());
const claimed = await withRpcRetry('pool claimed final', () => pool.getGetTotalClaimed72H());

console.log('');
console.log('RewardPool rehearsal sent and checked.');
console.log(`User Jetton balance: ${userBalance}`);
console.log(`Pool Jetton balance: ${poolBalance}`);
console.log(`Pool available rewards: ${available}`);
console.log(`Pool total funded: ${funded}`);
console.log(`Pool total claimed: ${claimed}`);
console.log(`Pending query after claim: ${pendingClaimQuery}`);
