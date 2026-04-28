import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Address, fromNano, internal, toNano, type Cell } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, TonClient4, WalletContractV4, type TonClientParameters } from '@ton/ton';
import {
  compileJettonV2,
  H72H_V2_METADATA_URI_PLACEHOLDER,
  H72H_V2_TOTAL_SUPPLY,
  JettonMinterV2,
} from '../src/jetton-v2/index.js';

const POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 2_000;

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
  return value ? value : undefined;
}

function requireEnv(name: string) {
  const value = optionalEnv(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optionalIntegerEnv(name: string) {
  const value = optionalEnv(name);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffffffff) {
    throw new Error(`${name} must be a uint32 integer.`);
  }
  return parsed;
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function formatAddress(address: Address) {
  return address.toString({ testOnly: true });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableRpcError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('429') || message.includes('timeout') || message.includes('socket') || message.includes('network');
}

async function withRpcRetry<T>(label: string, operation: () => Promise<T>, attempts = 5) {
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

function createClient(endpoint: string) {
  const useV4 = optionalEnv('TON_TESTNET_USE_V4_RPC') !== 'false';
  const v4Endpoint = useV4 ? optionalEnv('TON_TESTNET_RPC_V4_URL') ?? 'https://testnet-v4.tonhubapi.com' : undefined;
  if (v4Endpoint) {
    return new TonClient4({ endpoint: v4Endpoint, timeout: 20_000 });
  }
  const apiKey = optionalEnv('TON_TESTNET_RPC_API_KEY') ?? optionalEnv('TON_TESTNET_API_KEY') ?? optionalEnv('TONCENTER_API_KEY');
  const parameters: TonClientParameters = { endpoint, timeout: 20_000 };
  if (apiKey) parameters.apiKey = apiKey;
  return new TonClient(parameters);
}

async function getWalletSeqno(client: TonClient | TonClient4, wallet: WalletContractV4) {
  return withRpcRetry('wallet seqno', () => wallet.getSeqno(client.provider(wallet.address, wallet.init)));
}

async function waitForSeqnoIncrease(client: TonClient | TonClient4, wallet: WalletContractV4, previousSeqno: number) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const seqno = await getWalletSeqno(client, wallet);
    if (seqno > previousSeqno) return seqno;
  }
  throw new Error(`Wallet seqno did not increase from ${previousSeqno}.`);
}

async function sendInternalMessage(
  client: TonClient | TonClient4,
  wallet: WalletContractV4,
  label: string,
  input: {
    readonly to: Address;
    readonly value: bigint;
    readonly secretKey: Buffer;
    readonly init?: { readonly code: Cell; readonly data: Cell } | undefined;
    readonly body: Cell;
  },
) {
  const seqno = await getWalletSeqno(client, wallet);
  console.log(`Sending ${label}; seqno=${seqno}`);
  const transfer = wallet.createTransfer({
    seqno,
    secretKey: input.secretKey,
    messages: [
      internal({
        to: input.to,
        value: input.value,
        bounce: true,
        init: input.init,
        body: input.body,
      }),
    ],
  });

  try {
    await withRpcRetry(label, () => wallet.send(client.provider(wallet.address, wallet.init), transfer), 8);
  } catch (error) {
    const currentSeqno = await getWalletSeqno(client, wallet);
    if (currentSeqno <= seqno) throw error;
    console.log(`${label} send response failed but seqno advanced to ${currentSeqno}: ${getErrorMessage(error)}`);
    return;
  }

  const nextSeqno = await waitForSeqnoIncrease(client, wallet, seqno);
  console.log(`Confirmed ${label}; seqno=${nextSeqno}`);
}

async function getBalance(client: TonClient | TonClient4, address: Address) {
  if (client instanceof TonClient) {
    return client.getBalance(address);
  }
  const lastBlock = await client.getLastBlock();
  const account = await client.getAccount(lastBlock.last.seqno, address);
  return BigInt(account.account.balance.coins);
}

const loadedEnvFiles = loadLocalEnv();
const send = process.argv.includes('--send');
const allowSend = optionalEnv('TON_TESTNET_ALLOW_JETTON_V2_DEPLOY_SEND') === 'true';
const endpoint = requireEnv('TON_TESTNET_RPC_URL');
const mnemonic = requireEnv('TON_TESTNET_DEPLOYER_MNEMONIC');
const metadataUri = optionalEnv('TON_V2_METADATA_URI') ?? H72H_V2_METADATA_URI_PLACEHOLDER;
const keyPair = await mnemonicToPrivateKey(mnemonic.split(/\s+/).filter(Boolean));
const walletId = optionalIntegerEnv('TON_TESTNET_DEPLOYER_WALLET_ID');
const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0, walletId });
const configuredDeployer = optionalEnv('TON_TESTNET_DEPLOYER_ADDRESS')
  ? Address.parse(requireEnv('TON_TESTNET_DEPLOYER_ADDRESS'))
  : wallet.address;

if (!wallet.address.equals(configuredDeployer)) {
  throw new Error(`Derived Wallet V4 ${formatAddress(wallet.address)} does not match TON_TESTNET_DEPLOYER_ADDRESS ${formatAddress(configuredDeployer)}.`);
}

const initialSupplyOwner = Address.parse(optionalEnv('TON_V2_INITIAL_SUPPLY_OWNER_ADDRESS') ?? wallet.address.toString());
const compiled = await compileJettonV2();
const minter = JettonMinterV2.createFromConfig(
  {
    admin: wallet.address,
    walletCode: compiled.wallet.code,
    metadataUri,
  },
  compiled.minter.code,
);
const client = createClient(endpoint);
const walletBalance = await withRpcRetry('wallet balance', () => getBalance(client, wallet.address));
const deployBody = JettonMinterV2.topUpMessage();
const mintBody = JettonMinterV2.mintMessage({
  to: initialSupplyOwner,
  jettonAmount: H72H_V2_TOTAL_SUPPLY,
  from: wallet.address,
  responseAddress: wallet.address,
  totalTonAmount: toNano('0.3'),
});
const dropAdminBody = JettonMinterV2.dropAdminMessage();

console.log('72H V2 testnet deployment');
console.log(`Loaded env files: ${loadedEnvFiles.length > 0 ? loadedEnvFiles.join(', ') : 'none'}`);
console.log(`Deployer: ${formatAddress(wallet.address)} | walletId=${wallet.walletId} | balance=${fromNano(walletBalance)} TON`);
console.log(`Initial supply owner: ${formatAddress(initialSupplyOwner)}`);
console.log(`V2 Jetton master: ${formatAddress(minter.address)}`);
console.log(`Minter code hash: ${compiled.minter.codeHashHex}`);
console.log(`Wallet code hash: ${compiled.wallet.codeHashHex}`);
console.log(`Send mode: ${send ? 'requested' : 'dry-run'}`);

if (!send) {
  console.log('No transactions sent. Re-run with --send and TON_TESTNET_ALLOW_JETTON_V2_DEPLOY_SEND=true to deploy on testnet.');
  process.exit(0);
}

if (!allowSend) {
  throw new Error('Refusing to send. Set TON_TESTNET_ALLOW_JETTON_V2_DEPLOY_SEND=true and pass --send.');
}

await sendInternalMessage(client, wallet, 'deploy V2 minter', {
  to: minter.address,
  value: toNano('0.05'),
  secretKey: keyPair.secretKey,
  init: minter.init,
  body: deployBody,
});
await sendInternalMessage(client, wallet, 'mint V2 total supply', {
  to: minter.address,
  value: toNano('0.35'),
  secretKey: keyPair.secretKey,
  body: mintBody,
});
await sendInternalMessage(client, wallet, 'drop V2 admin', {
  to: minter.address,
  value: toNano('0.05'),
  secretKey: keyPair.secretKey,
  body: dropAdminBody,
});

const openedMinter = client.open(JettonMinterV2.createFromAddress(minter.address));
const finalData = await withRpcRetry('final V2 getter', () => openedMinter.getJettonData(), 8);
const manifest = {
  network: 'testnet',
  sentAt: new Date().toISOString(),
  loadedEnvFiles,
  deployer: formatAddress(wallet.address),
  initialSupplyOwner: formatAddress(initialSupplyOwner),
  jettonMaster: formatAddress(minter.address),
  metadataUri,
  codeHashes: {
    minterHex: compiled.minter.codeHashHex,
    walletHex: compiled.wallet.codeHashHex,
  },
  finalGetter: {
    totalSupplyRaw: finalData.totalSupply.toString(),
    mintable: finalData.mintable,
    adminAddress: finalData.adminAddress?.toString({ testOnly: true }) ?? null,
    walletCodeHashHex: finalData.walletCode.hash().toString('hex'),
  },
};

const outputDir = resolve(process.cwd(), 'deployments');
mkdirSync(outputDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const timestampedPath = resolve(outputDir, `jetton-v2.testnet.${timestamp}.json`);
const latestPath = resolve(outputDir, 'jetton-v2.testnet.latest.json');
writeFileSync(timestampedPath, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(latestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Final total supply: ${manifest.finalGetter.totalSupplyRaw}`);
console.log(`Final mintable: ${manifest.finalGetter.mintable}`);
console.log(`Final admin: ${manifest.finalGetter.adminAddress}`);
console.log(`Manifest: ${timestampedPath}`);
