import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, beginCell, fromNano, internal, toNano, type Cell, type Contract } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, type TonClientParameters, WalletContractV4 } from '@ton/ton';

type GeneratedContractInstance = Contract & {
  readonly address: Address;
  readonly init?: { readonly code: Cell; readonly data: Cell };
};

type GeneratedContractClass<TArgs extends readonly unknown[]> = {
  fromInit: (...args: TArgs) => Promise<GeneratedContractInstance>;
};

type ChainStateName = 'active' | 'uninitialized' | 'frozen' | 'unknown';

const DEPLOY_VALUE = toNano('0.08');
const CONFIGURE_VALUE = toNano('0.03');
const POLL_INTERVAL_MS = 2_000;
const POLL_ATTEMPTS = 30;
const SET_DEPOSIT_VAULT_JETTON_WALLET_OPCODE = 0x720d0001;
const GENERATED_WRAPPER_EXTENSION = `.${'ts'}`;

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

async function withRpcRetry<T>(label: string, operation: () => Promise<T>, attempts = 5) {
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

function createClient(endpoint: string) {
  const apiKey = optionalEnv('TON_TESTNET_RPC_API_KEY') ?? optionalEnv('TON_TESTNET_API_KEY') ?? optionalEnv('TONCENTER_API_KEY');
  const parameters: TonClientParameters = { endpoint, timeout: 20_000 };
  if (apiKey) parameters.apiKey = apiKey;
  return new TonClient(parameters);
}

async function loadGeneratedContract<TArgs extends readonly unknown[]>(relativePath: string, exportName: string) {
  const absolutePath = resolve(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing generated wrapper ${relativePath}. Run npm run tact:build first.`);
  }
  const module = (await import(pathToFileURL(absolutePath).href)) as Record<string, unknown>;
  const contract = module[exportName] as GeneratedContractClass<TArgs> | undefined;
  if (!contract?.fromInit) {
    throw new Error(`Generated wrapper ${relativePath} does not export ${exportName}.`);
  }
  return contract;
}

async function getWalletSeqno(client: TonClient, wallet: WalletContractV4) {
  return withRpcRetry('wallet seqno', () => wallet.getSeqno(client.provider(wallet.address, wallet.init)));
}

async function getAddressState(client: TonClient, address: Address) {
  try {
    const state = await withRpcRetry(`contract state ${formatAddress(address)}`, () => client.getContractState(address));
    return { state: state.state as ChainStateName, balance: state.balance, lastTransaction: state.lastTransaction };
  } catch (error) {
    console.warn(`Unable to read ${formatAddress(address)} state: ${getErrorMessage(error)}`);
    return { state: 'unknown' as const, balance: 0n, lastTransaction: null };
  }
}

function printState(label: string, address: Address, state: Awaited<ReturnType<typeof getAddressState>>) {
  console.log(`${label}: ${formatAddress(address)} | state=${state.state} | balance=${fromNano(state.balance)} TON`);
}

function setDepositVaultJettonWalletBody(wallet: Address) {
  return beginCell().storeUint(SET_DEPOSIT_VAULT_JETTON_WALLET_OPCODE, 32).storeAddress(wallet).endCell();
}

async function waitForSeqnoIncrease(client: TonClient, wallet: WalletContractV4, previousSeqno: number) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const nextSeqno = await getWalletSeqno(client, wallet);
    if (nextSeqno > previousSeqno) return nextSeqno;
  }
  throw new Error(`Wallet seqno did not increase from ${previousSeqno} before timeout.`);
}

async function waitForActive(client: TonClient, label: string, address: Address) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const state = await getAddressState(client, address);
    if (state.state === 'active') return state;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`${label} did not become active before timeout.`);
}

async function sendInternalMessage(
  client: TonClient,
  wallet: WalletContractV4,
  label: string,
  input: {
    readonly to: Address;
    readonly value: bigint;
    readonly bounce: boolean;
    readonly secretKey: Buffer;
    readonly init?: { readonly code: Cell; readonly data: Cell } | undefined;
    readonly body?: Cell | undefined;
  },
) {
  const beforeSeqno = await getWalletSeqno(client, wallet);
  console.log(`Sending ${label}; wallet seqno=${beforeSeqno}`);
  const message = internal({
    to: input.to,
    value: input.value,
    bounce: input.bounce,
    init: input.init,
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
      return;
    }
    throw error;
  }

  const afterSeqno = await waitForSeqnoIncrease(client, wallet, beforeSeqno);
  console.log(`Confirmed wallet seqno=${afterSeqno}`);
}

function writeManifest(manifest: unknown, sent: boolean) {
  const directory = resolve(process.cwd(), 'deployments');
  mkdirSync(directory, { recursive: true });
  const latestPath = resolve(directory, 'multi-millionaire-deposit-vault.testnet.latest.json');
  writeFileSync(latestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  if (sent) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    writeFileSync(resolve(directory, `multi-millionaire-deposit-vault.testnet.${timestamp}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return latestPath;
}

const loadedEnvFiles = loadLocalEnv();
const shouldSend = process.argv.includes('--send');
if (shouldSend && process.env.TON_TESTNET_ALLOW_MULTI_MILLIONAIRE_DEPOSIT_VAULT_DEPLOY_SEND !== 'true') {
  throw new Error('Refusing to send. Set TON_TESTNET_ALLOW_MULTI_MILLIONAIRE_DEPOSIT_VAULT_DEPLOY_SEND=true and pass --send.');
}

const endpoint = requireEnv('TON_TESTNET_RPC_URL');
const configuredAddress = Address.parse(requireEnv('TON_TESTNET_DEPLOYER_ADDRESS'));
const mnemonic = requireEnv('TON_TESTNET_DEPLOYER_MNEMONIC').split(/\s+/).filter(Boolean);
const keyPair = await mnemonicToPrivateKey(mnemonic);
const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
if (!wallet.address.equals(configuredAddress)) {
  throw new Error(`Configured deployer ${formatAddress(configuredAddress)} differs from derived Wallet V4 ${formatAddress(wallet.address)}.`);
}

const client = createClient(endpoint);
const MultiMillionaireDepositVault = await loadGeneratedContract<[Address, Address, Address]>(
  `build/tact/MultiMillionaireDepositVault/MultiMillionaireDepositVault_MultiMillionaireDepositVault${GENERATED_WRAPPER_EXTENSION}`,
  'MultiMillionaireDepositVault',
);
const TestJetton72H = await loadGeneratedContract<[Address]>(
  `build/tact/TestJetton72H/TestJetton72H_TestJetton72H${GENERATED_WRAPPER_EXTENSION}`,
  'TestJetton72H',
);
const TestJetton72HWallet = await loadGeneratedContract<[Address, Address]>(
  `build/tact/TestJetton72H/TestJetton72H_TestJetton72HWallet${GENERATED_WRAPPER_EXTENSION}`,
  'TestJetton72HWallet',
);

const testJetton = await TestJetton72H.fromInit(configuredAddress);
const depositVault = await MultiMillionaireDepositVault.fromInit(configuredAddress, testJetton.address, configuredAddress);
const depositVaultJettonWallet = await TestJetton72HWallet.fromInit(testJetton.address, depositVault.address);
const walletBalance = await withRpcRetry('wallet balance', () => client.getBalance(wallet.address));
const vaultStateBefore = await getAddressState(client, depositVault.address);
const jettonWalletStateBefore = await getAddressState(client, depositVaultJettonWallet.address);

console.log('Multi-millionaire DepositVault testnet deploy runner');
console.log(`Mode: ${shouldSend ? 'send enabled' : 'dry-run'}`);
console.log(`Loaded env files: ${loadedEnvFiles.length > 0 ? loadedEnvFiles.join(', ') : 'none'}`);
console.log(`RPC URL: ${maskValue(endpoint)}`);
console.log(`Deployer: ${formatAddress(configuredAddress)}`);
console.log(`Wallet balance: ${fromNano(walletBalance)} TON`);
console.log(`Wallet seqno: ${await getWalletSeqno(client, wallet)}`);
console.log('');
printState('MultiMillionaireDepositVault', depositVault.address, vaultStateBefore);
printState('MultiMillionaireDepositVault JettonWallet', depositVaultJettonWallet.address, jettonWalletStateBefore);
console.log('');
console.log('API/test env after deployment');
console.log(`TON_TESTNET_MULTI_MILLIONAIRE_DEPOSIT_VAULT_ADDRESS="${formatAddress(depositVault.address)}"`);
console.log(`TON_TESTNET_MULTI_MILLIONAIRE_DEPOSIT_VAULT_JETTON_WALLET_ADDRESS="${formatAddress(depositVaultJettonWallet.address)}"`);

if (!shouldSend) {
  console.log('');
  console.log('No transactions sent. To deploy, set TON_TESTNET_ALLOW_MULTI_MILLIONAIRE_DEPOSIT_VAULT_DEPLOY_SEND=true and run npm run deploy:multi-millionaire-deposit-vault:testnet:send.');
} else {
  if (vaultStateBefore.state !== 'active') {
    await sendInternalMessage(client, wallet, 'deploy MultiMillionaireDepositVault', {
      to: depositVault.address,
      value: DEPLOY_VALUE,
      bounce: false,
      secretKey: keyPair.secretKey,
      init: depositVault.init,
    });
    await waitForActive(client, 'MultiMillionaireDepositVault', depositVault.address);
  } else {
    console.log('MultiMillionaireDepositVault already active; skipping deploy.');
  }

  await sendInternalMessage(client, wallet, 'SetDepositVaultJettonWallet', {
    to: depositVault.address,
    value: CONFIGURE_VALUE,
    bounce: true,
    secretKey: keyPair.secretKey,
    body: setDepositVaultJettonWalletBody(depositVaultJettonWallet.address),
  });
}

const vaultStateAfter = await getAddressState(client, depositVault.address);
const jettonWalletStateAfter = await getAddressState(client, depositVaultJettonWallet.address);
const manifest = {
  network: 'testnet',
  createdAt: new Date().toISOString(),
  sent: shouldSend,
  loadedEnvFiles,
  rpcUrl: maskValue(endpoint),
  deployer: {
    configuredAddress: formatAddress(configuredAddress),
    derivedWalletV4: formatAddress(wallet.address),
    walletMatchesConfigured: wallet.address.equals(configuredAddress),
    balanceTon: fromNano(walletBalance),
  },
  contracts: {
    TestJetton72H: formatAddress(testJetton.address),
    MultiMillionaireDepositVault: formatAddress(depositVault.address),
    MultiMillionaireDepositVaultJettonWallet: formatAddress(depositVaultJettonWallet.address),
  },
  states: {
    MultiMillionaireDepositVault: {
      address: formatAddress(depositVault.address),
      state: vaultStateAfter.state,
      balanceTon: fromNano(vaultStateAfter.balance),
    },
    MultiMillionaireDepositVaultJettonWallet: {
      address: formatAddress(depositVaultJettonWallet.address),
      state: jettonWalletStateAfter.state,
      balanceTon: fromNano(jettonWalletStateAfter.balance),
    },
  },
  apiEnv: {
    TON_TESTNET_MULTI_MILLIONAIRE_DEPOSIT_VAULT_ADDRESS: formatAddress(depositVault.address),
    TON_TESTNET_MULTI_MILLIONAIRE_DEPOSIT_VAULT_JETTON_WALLET_ADDRESS: formatAddress(depositVaultJettonWallet.address),
  },
};

const manifestPath = writeManifest(manifest, shouldSend);
console.log('');
console.log(`DepositVault manifest written: ${manifestPath}`);
