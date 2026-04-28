import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, fromNano, internal, toNano, type Cell, type Contract } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, type TonClientParameters, WalletContractV4 } from '@ton/ton';
import {
  createBindReserveVaultMessageCell,
  createRegisterAppMessageCell,
  createSetPoolJettonWalletMessageCell,
  createSetVaultJettonWalletMessageCell,
} from '../src/encoding/tactMessageCells.js';
import type { CapitalAppSlug } from '../src/types/domain.js';

type GeneratedContractInstance = Contract & {
  readonly address: Address;
  readonly init?: { readonly code: Cell; readonly data: Cell };
};

type GeneratedContractClass<TArgs extends readonly unknown[]> = {
  fromInit: (...args: TArgs) => Promise<GeneratedContractInstance>;
};

type ChainStateName = 'active' | 'uninitialized' | 'frozen' | 'unknown';

interface PlannedContract {
  readonly label: string;
  readonly contract: GeneratedContractInstance;
  readonly deployValue: bigint;
}

interface PlannedState {
  readonly label: string;
  readonly address: string;
  readonly state: ChainStateName;
  readonly balanceTon: string;
}

interface ReserveVaultPlan {
  readonly app: CapitalAppSlug;
  readonly appId: bigint;
  readonly contract: GeneratedContractInstance;
  readonly jettonWalletAddress: Address;
}

interface AlphaVaultPlan {
  readonly app: CapitalAppSlug;
  readonly appId: bigint;
  readonly contract: GeneratedContractInstance;
  readonly jettonWalletAddress: Address;
}

interface AppRewardPoolPlan {
  readonly app: CapitalAppSlug;
  readonly appId: bigint;
  readonly contract: GeneratedContractInstance;
  readonly jettonWalletAddress: Address;
}

interface MultisigSignerPlan {
  readonly signers: readonly Address[];
  readonly explicit: boolean;
}

const CAPITAL_APPS: readonly CapitalAppSlug[] = ['72hours', 'wan', 'multi-millionaire'];
const CAPITAL_APP_IDS: Readonly<Record<CapitalAppSlug, bigint>> = {
  '72hours': 1n,
  wan: 2n,
  'multi-millionaire': 3n,
};

const DEPLOY_VALUE = toNano('0.05');
const REGISTRY_MESSAGE_VALUE = toNano('0.03');
const POLL_INTERVAL_MS = 2_000;
const POLL_ATTEMPTS = 30;
const BETWEEN_SENDS_MS = 2_500;

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return undefined;
  }

  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex <= 0) {
    return undefined;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadLocalEnv() {
  const loaded: string[] = [];
  for (const filename of ['.env.local', '.env']) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) {
      continue;
    }

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
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function parseAddressEnv(name: string) {
  const value = optionalEnv(name);
  return value ? Address.parse(value) : undefined;
}

function maskValue(value: string | undefined) {
  if (!value) {
    return 'missing';
  }

  if (value.length <= 12) {
    return 'configured';
  }

  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function formatAddress(address: Address) {
  return address.toString({ testOnly: true });
}

function loadMultisigSigners(configuredAddress: Address): MultisigSignerPlan {
  return {
    signers: [configuredAddress],
    explicit: true,
  };
}

function assertExplicitMultisigSigners(plan: MultisigSignerPlan) {
  const unique = new Set(plan.signers.map((signer) => formatAddress(signer)));
  if (unique.size !== plan.signers.length) {
    throw new Error('Refusing to send Admin authority with duplicate signer addresses.');
  }
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableRpcError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('429') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('socket hang up') ||
    message.includes('network')
  );
}

async function withRpcRetry<T>(label: string, operation: () => Promise<T>, attempts = 5) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableRpcError(error) || attempt === attempts) {
        break;
      }

      const delayMs = attempt * 5_000;
      console.warn(`${label} failed (${getErrorMessage(error)}). Retrying in ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function loadGeneratedContract<TArgs extends readonly unknown[]>(
  relativePath: string,
  exportName: string,
) {
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

function createClient(endpoint: string) {
  const apiKey = optionalEnv('TON_TESTNET_RPC_API_KEY') ?? optionalEnv('TON_TESTNET_API_KEY') ?? optionalEnv('TONCENTER_API_KEY');
  const parameters: TonClientParameters = { endpoint, timeout: 20_000 };
  if (apiKey) {
    parameters.apiKey = apiKey;
  }
  return new TonClient(parameters);
}

async function getWalletSeqno(client: TonClient, wallet: WalletContractV4) {
  return withRpcRetry('wallet seqno', () => wallet.getSeqno(client.provider(wallet.address, wallet.init)));
}

async function getContractState(client: TonClient, contract: GeneratedContractInstance) {
  try {
    const state = await withRpcRetry(`contract state ${formatAddress(contract.address)}`, () =>
      client.getContractState(contract.address),
    );
    return {
      state: state.state,
      balance: state.balance,
      lastTransaction: state.lastTransaction,
    };
  } catch (error) {
    console.warn(`Unable to read ${formatAddress(contract.address)} state: ${getErrorMessage(error)}`);
    return {
      state: 'unknown' as const,
      balance: 0n,
      lastTransaction: null,
    };
  }
}

function printState(label: string, address: Address, state: Awaited<ReturnType<typeof getContractState>>) {
  console.log(
    `${label}: ${formatAddress(address)} | state=${state.state} | balance=${fromNano(state.balance)} TON`,
  );
}

async function waitForSeqnoIncrease(client: TonClient, wallet: WalletContractV4, previousSeqno: number) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const nextSeqno = await getWalletSeqno(client, wallet);
    if (nextSeqno > previousSeqno) {
      return nextSeqno;
    }
  }

  throw new Error(`Wallet seqno did not increase from ${previousSeqno} before timeout.`);
}

async function waitForContractActive(
  client: TonClient,
  label: string,
  contract: GeneratedContractInstance,
) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const state = await getContractState(client, contract);
    if (state.state === 'active') {
      return state;
    }
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
    await withRpcRetry(
      `${label} send`,
      () => wallet.send(client.provider(wallet.address, wallet.init), transfer),
      8,
    );
  } catch (error) {
    let currentSeqno = beforeSeqno;
    try {
      currentSeqno = await getWalletSeqno(client, wallet);
    } catch (seqnoError) {
      throw new Error(
        `${label} send failed and seqno confirmation also failed: ${getErrorMessage(error)}; ${getErrorMessage(seqnoError)}`,
      );
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

function buildManifest(input: {
  readonly sent: boolean;
  readonly loadedEnvFiles: readonly string[];
  readonly endpoint: string;
  readonly configuredAddress: Address;
  readonly walletAddress: Address;
  readonly walletBalance: bigint;
  readonly plannedStates: readonly PlannedState[];
  readonly reserveVaults: readonly ReserveVaultPlan[];
  readonly alphaVaults: readonly AlphaVaultPlan[];
  readonly appRewardPools: readonly AppRewardPoolPlan[];
  readonly testJetton: GeneratedContractInstance;
  readonly treasury: GeneratedContractInstance;
  readonly adminMultisig: GeneratedContractInstance;
  readonly multisigSigners: MultisigSignerPlan;
}) {
  const reserveVaultAddresses = Object.fromEntries(
    input.reserveVaults.map((vault) => [vault.app, formatAddress(vault.contract.address)]),
  ) as Record<CapitalAppSlug, string>;
  const reserveVaultJettonWalletAddresses = Object.fromEntries(
    input.reserveVaults.map((vault) => [vault.app, formatAddress(vault.jettonWalletAddress)]),
  ) as Record<CapitalAppSlug, string>;
  const alphaVaultAddresses = Object.fromEntries(
    input.alphaVaults.map((vault) => [vault.app, formatAddress(vault.contract.address)]),
  ) as Record<CapitalAppSlug, string>;
  const alphaVaultJettonWalletAddresses = Object.fromEntries(
    input.alphaVaults.map((vault) => [vault.app, formatAddress(vault.jettonWalletAddress)]),
  ) as Record<CapitalAppSlug, string>;
  const appRewardPoolAddresses = Object.fromEntries(
    input.appRewardPools.map((pool) => [pool.app, formatAddress(pool.contract.address)]),
  ) as Record<CapitalAppSlug, string>;
  const appRewardPoolJettonWalletAddresses = Object.fromEntries(
    input.appRewardPools.map((pool) => [pool.app, formatAddress(pool.jettonWalletAddress)]),
  ) as Record<CapitalAppSlug, string>;

  return {
    network: 'testnet',
    createdAt: new Date().toISOString(),
    sent: input.sent,
    loadedEnvFiles: input.loadedEnvFiles,
    rpcUrl: maskValue(input.endpoint),
    deployer: {
      configuredAddress: formatAddress(input.configuredAddress),
      derivedWalletV4: formatAddress(input.walletAddress),
      walletMatchesConfigured: input.walletAddress.equals(input.configuredAddress),
      balanceTon: fromNano(input.walletBalance),
    },
    governance: {
      signerSource: 'single-admin',
      signers: input.multisigSigners.signers.map((signer) => formatAddress(signer)),
    },
    contracts: {
      TestJetton72H: input.plannedStates.find((item) => item.label === 'TestJetton72H')?.address,
      AdminAuthority: input.plannedStates.find((item) => item.label === 'AdminAuthority')?.address,
      AdminMultisig: input.plannedStates.find((item) => item.label === 'AdminAuthority')?.address,
      CapitalRegistry: input.plannedStates.find((item) => item.label === 'CapitalRegistry')?.address,
      Treasury: input.plannedStates.find((item) => item.label === 'Treasury')?.address,
      ReserveVaults: reserveVaultAddresses,
      ReserveVaultJettonWallets: reserveVaultJettonWalletAddresses,
      AppRewardPools: appRewardPoolAddresses,
      AppRewardPoolJettonWallets: appRewardPoolJettonWalletAddresses,
      AlphaVaults: alphaVaultAddresses,
      AlphaVaultJettonWallets: alphaVaultJettonWalletAddresses,
    },
    states: Object.fromEntries(input.plannedStates.map((item) => [item.label, item])),
    apiEnv: {
      H72H_CAPITAL_NETWORK_MODE: 'testnet',
      H72H_ENABLE_TESTNET_TACT_MESSAGES: input.sent ? 'true' : 'false',
      H72H_TESTNET_RPC_URL: input.endpoint,
      H72H_TESTNET_72H_JETTON_MASTER_ADDRESS: formatAddress(input.testJetton.address),
      H72H_TESTNET_ADMIN_AUTHORITY_ADDRESS: formatAddress(input.adminMultisig.address),
      H72H_TESTNET_TREASURY_ADDRESS: formatAddress(input.treasury.address),
      H72H_TESTNET_RESERVE_VAULT_72HOURS_ADDRESS: reserveVaultAddresses['72hours'],
      H72H_TESTNET_RESERVE_VAULT_WAN_ADDRESS: reserveVaultAddresses.wan,
      H72H_TESTNET_RESERVE_VAULT_MULTI_MILLIONAIRE_ADDRESS: reserveVaultAddresses['multi-millionaire'],
      H72H_TESTNET_APP_REWARD_POOL_72HOURS_ADDRESS: appRewardPoolAddresses['72hours'],
      H72H_TESTNET_APP_REWARD_POOL_WAN_ADDRESS: appRewardPoolAddresses.wan,
      H72H_TESTNET_APP_REWARD_POOL_MULTI_MILLIONAIRE_ADDRESS: appRewardPoolAddresses['multi-millionaire'],
      H72H_TESTNET_ALPHA_VAULT_72HOURS_ADDRESS: alphaVaultAddresses['72hours'],
      H72H_TESTNET_ALPHA_VAULT_WAN_ADDRESS: alphaVaultAddresses.wan,
      H72H_TESTNET_ALPHA_VAULT_MULTI_MILLIONAIRE_ADDRESS: alphaVaultAddresses['multi-millionaire'],
    },
  };
}

function writeManifest(manifest: unknown, sent: boolean) {
  const directory = resolve(process.cwd(), 'deployments');
  mkdirSync(directory, { recursive: true });

  const latestPath = resolve(directory, 'testnet.latest.json');
  writeFileSync(latestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  if (sent) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    writeFileSync(resolve(directory, `testnet.${timestamp}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  return latestPath;
}

const loadedEnvFiles = loadLocalEnv();
const shouldSend = process.argv.includes('--send');
const shouldWriteManifest = !process.argv.includes('--no-write-manifest');

if (shouldSend && process.env.TON_TESTNET_ALLOW_DEPLOY_SEND !== 'true') {
  throw new Error('Refusing to send. Set TON_TESTNET_ALLOW_DEPLOY_SEND=true and pass --send.');
}

const endpoint = requireEnv('TON_TESTNET_RPC_URL');
const configuredAddress = Address.parse(requireEnv('TON_TESTNET_DEPLOYER_ADDRESS'));
const mnemonic = requireEnv('TON_TESTNET_DEPLOYER_MNEMONIC').split(/\s+/).filter(Boolean);
const keyPair = await mnemonicToPrivateKey(mnemonic);
const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });

if (!wallet.address.equals(configuredAddress)) {
  throw new Error(
    `Configured deployer ${formatAddress(configuredAddress)} differs from derived Wallet V4 ${formatAddress(wallet.address)}.`,
  );
}

const client = createClient(endpoint);
const multisigSigners = loadMultisigSigners(configuredAddress);
if (shouldSend) {
  assertExplicitMultisigSigners(multisigSigners);
}

const AdminMultisig = await loadGeneratedContract<[Address]>(
  'build/tact/AdminMultisig/AdminMultisig_AdminMultisig.ts',
  'AdminMultisig',
);
const CapitalRegistry = await loadGeneratedContract<[Address]>(
  'build/tact/CapitalRegistry/CapitalRegistry_CapitalRegistry.ts',
  'CapitalRegistry',
);
const ReserveVault = await loadGeneratedContract<[Address, Address, Address, Address, bigint]>(
  'build/tact/ReserveVault/ReserveVault_ReserveVault.ts',
  'ReserveVault',
);
const TestJetton72H = await loadGeneratedContract<[Address]>(
  'build/tact/TestJetton72H/TestJetton72H_TestJetton72H.ts',
  'TestJetton72H',
);
const TestJetton72HWallet = await loadGeneratedContract<[Address, Address]>(
  'build/tact/TestJetton72H/TestJetton72H_TestJetton72HWallet.ts',
  'TestJetton72HWallet',
);
const Treasury = await loadGeneratedContract<[Address]>(
  'build/tact/Treasury/Treasury_Treasury.ts',
  'Treasury',
);
const AlphaVault = await loadGeneratedContract<[Address, Address, Address, bigint]>(
  'build/tact/AlphaVault/AlphaVault_AlphaVault.ts',
  'AlphaVault',
);
const AppRewardPool = await loadGeneratedContract<[Address, Address, Address, Address, bigint]>(
  'build/tact/AppRewardPool/AppRewardPool_AppRewardPool.ts',
  'AppRewardPool',
);

const adminMultisig = await AdminMultisig.fromInit(multisigSigners.signers[0]!);
const testJetton = await TestJetton72H.fromInit(configuredAddress);
const capitalRegistry = await CapitalRegistry.fromInit(configuredAddress);
const treasury = await Treasury.fromInit(configuredAddress);
const reserveVaults: ReserveVaultPlan[] = [];
const alphaVaults: AlphaVaultPlan[] = [];
const appRewardPools: AppRewardPoolPlan[] = [];
for (const app of CAPITAL_APPS) {
  const reserveVault = await ReserveVault.fromInit(
    configuredAddress,
    capitalRegistry.address,
    testJetton.address,
    configuredAddress,
    CAPITAL_APP_IDS[app],
  );
  const reserveVaultJettonWallet = await TestJetton72HWallet.fromInit(testJetton.address, reserveVault.address);
  reserveVaults.push({
    app,
    appId: CAPITAL_APP_IDS[app],
    contract: reserveVault,
    jettonWalletAddress: reserveVaultJettonWallet.address,
  });

  const alphaVault = await AlphaVault.fromInit(configuredAddress, treasury.address, testJetton.address, CAPITAL_APP_IDS[app]);
  const alphaVaultJettonWallet = await TestJetton72HWallet.fromInit(testJetton.address, alphaVault.address);
  alphaVaults.push({
    app,
    appId: CAPITAL_APP_IDS[app],
    contract: alphaVault,
    jettonWalletAddress: alphaVaultJettonWallet.address,
  });

  const appRewardPool = await AppRewardPool.fromInit(
    configuredAddress,
    capitalRegistry.address,
    testJetton.address,
    configuredAddress,
    CAPITAL_APP_IDS[app],
  );
  const appRewardPoolJettonWallet = await TestJetton72HWallet.fromInit(testJetton.address, appRewardPool.address);
  appRewardPools.push({
    app,
    appId: CAPITAL_APP_IDS[app],
    contract: appRewardPool,
    jettonWalletAddress: appRewardPoolJettonWallet.address,
  });
}

const plannedContracts: PlannedContract[] = [
  { label: 'AdminAuthority', contract: adminMultisig, deployValue: DEPLOY_VALUE },
  { label: 'TestJetton72H', contract: testJetton, deployValue: DEPLOY_VALUE },
  { label: 'CapitalRegistry', contract: capitalRegistry, deployValue: DEPLOY_VALUE },
  { label: 'Treasury', contract: treasury, deployValue: DEPLOY_VALUE },
  ...reserveVaults.map((vault) => ({
    label: `ReserveVault(${vault.app})`,
    contract: vault.contract,
    deployValue: DEPLOY_VALUE,
  })),
  ...appRewardPools.map((pool) => ({
    label: `AppRewardPool(${pool.app})`,
    contract: pool.contract,
    deployValue: DEPLOY_VALUE,
  })),
  ...alphaVaults.map((vault) => ({
    label: `AlphaVault(${vault.app})`,
    contract: vault.contract,
    deployValue: DEPLOY_VALUE,
  })),
];

const walletBalance = await withRpcRetry('wallet balance', () => client.getBalance(wallet.address));

console.log('72H Capital testnet deploy runner');
console.log(`Mode: ${shouldSend ? 'send enabled' : 'dry-run'}`);
console.log(`Loaded env files: ${loadedEnvFiles.length > 0 ? loadedEnvFiles.join(', ') : 'none'}`);
console.log(`RPC URL: ${maskValue(endpoint)}`);
console.log(`Deployer: ${formatAddress(configuredAddress)}`);
console.log('Admin authority signer source: single-admin deployer address');
console.log(`Wallet balance: ${fromNano(walletBalance)} TON`);
console.log(`Wallet seqno: ${await getWalletSeqno(client, wallet)}`);
console.log('');

const states = new Map<string, Awaited<ReturnType<typeof getContractState>>>();
for (const planned of plannedContracts) {
  const state = await getContractState(client, planned.contract);
  states.set(planned.label, state);
  printState(planned.label, planned.contract.address, state);
}

console.log('');
console.log('API env after ReserveVault deployment');
console.log(`H72H_TESTNET_ADMIN_AUTHORITY_ADDRESS="${formatAddress(adminMultisig.address)}"`);
console.log(`H72H_TESTNET_TREASURY_ADDRESS="${formatAddress(treasury.address)}"`);
for (const vault of reserveVaults) {
  const envName = `H72H_TESTNET_RESERVE_VAULT_${vault.app.toUpperCase().replaceAll('-', '_')}_ADDRESS`;
  console.log(`${envName}="${formatAddress(vault.contract.address)}"`);
  console.log(`${envName.replace('_ADDRESS', '_JETTON_WALLET_ADDRESS')}="${formatAddress(vault.jettonWalletAddress)}"`);
}
for (const pool of appRewardPools) {
  const envName = `H72H_TESTNET_APP_REWARD_POOL_${pool.app.toUpperCase().replaceAll('-', '_')}_ADDRESS`;
  console.log(`${envName}="${formatAddress(pool.contract.address)}"`);
  console.log(`${envName.replace('_ADDRESS', '_JETTON_WALLET_ADDRESS')}="${formatAddress(pool.jettonWalletAddress)}"`);
}
for (const vault of alphaVaults) {
  const envName = `H72H_TESTNET_ALPHA_VAULT_${vault.app.toUpperCase().replaceAll('-', '_')}_ADDRESS`;
  console.log(`${envName}="${formatAddress(vault.contract.address)}"`);
  console.log(`${envName.replace('_ADDRESS', '_JETTON_WALLET_ADDRESS')}="${formatAddress(vault.jettonWalletAddress)}"`);
}

if (!shouldSend) {
  console.log('');
  console.log('No transactions sent. To deploy, set TON_TESTNET_ALLOW_DEPLOY_SEND=true and run npm run deploy:testnet:send.');
} else {
  for (const planned of plannedContracts) {
    const state = states.get(planned.label);
    if (state?.state === 'active') {
      console.log(`${planned.label} already active; skipping deploy.`);
      continue;
    }

    await sendInternalMessage(
      client,
      wallet,
      `deploy ${planned.label}`,
      {
        to: planned.contract.address,
        value: planned.deployValue,
        bounce: false,
        secretKey: keyPair.secretKey,
        init: planned.contract.init,
      },
    );
    await waitForContractActive(client, planned.label, planned.contract);
    await sleep(BETWEEN_SENDS_MS);
  }

  for (const vault of reserveVaults) {
    await sendInternalMessage(
      client,
      wallet,
      `CapitalRegistry.registerApp(${vault.app})`,
      {
        to: capitalRegistry.address,
        value: REGISTRY_MESSAGE_VALUE,
        bounce: true,
        secretKey: keyPair.secretKey,
        body: createRegisterAppMessageCell(vault.app).body,
      },
    );
    await sleep(BETWEEN_SENDS_MS);
  }

  for (const vault of reserveVaults) {
    await sendInternalMessage(
      client,
      wallet,
      `CapitalRegistry.bindReserveVault(${vault.app})`,
      {
        to: capitalRegistry.address,
        value: REGISTRY_MESSAGE_VALUE,
        bounce: true,
        secretKey: keyPair.secretKey,
        body: createBindReserveVaultMessageCell({
          app: vault.app,
          vault: vault.contract.address,
        }).body,
      },
    );
    await sleep(BETWEEN_SENDS_MS);
  }

  for (const vault of reserveVaults) {
    await sendInternalMessage(
      client,
      wallet,
      `ReserveVault.setVaultJettonWallet(${vault.app})`,
      {
        to: vault.contract.address,
        value: REGISTRY_MESSAGE_VALUE,
        bounce: true,
        secretKey: keyPair.secretKey,
        body: createSetVaultJettonWalletMessageCell({ wallet: vault.jettonWalletAddress }).body,
      },
    );
    await sleep(BETWEEN_SENDS_MS);
  }

  for (const pool of appRewardPools) {
    await sendInternalMessage(
      client,
      wallet,
      `AppRewardPool.setPoolJettonWallet(${pool.app})`,
      {
        to: pool.contract.address,
        value: REGISTRY_MESSAGE_VALUE,
        bounce: true,
        secretKey: keyPair.secretKey,
        body: createSetPoolJettonWalletMessageCell({ wallet: pool.jettonWalletAddress }).body,
      },
    );
    await sleep(BETWEEN_SENDS_MS);
  }

  console.log('');
  console.log('Testnet deployment flow submitted and bootstrap messages sent.');
}

const finalStates: PlannedState[] = [];
for (const planned of plannedContracts) {
  const state = await getContractState(client, planned.contract);
  finalStates.push({
    label: planned.label,
    address: formatAddress(planned.contract.address),
    state: state.state,
    balanceTon: fromNano(state.balance),
  });
}

const manifest = buildManifest({
  sent: shouldSend,
  loadedEnvFiles,
  endpoint,
  configuredAddress,
  walletAddress: wallet.address,
  walletBalance,
  plannedStates: finalStates,
  reserveVaults,
  alphaVaults,
  appRewardPools,
  testJetton,
  treasury,
  adminMultisig,
  multisigSigners,
});

if (shouldWriteManifest) {
  const manifestPath = writeManifest(manifest, shouldSend);
  console.log('');
  console.log(`Deployment manifest written: ${manifestPath}`);
}
