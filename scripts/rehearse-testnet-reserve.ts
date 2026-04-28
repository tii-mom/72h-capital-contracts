import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, fromNano, internal, type Cell, type Contract } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, type TonClientParameters, WalletContractV4 } from '@ton/ton';
import {
  createMintTest72HMessageCell,
  createReserveJettonTransferMessageCell,
  to72HJettonUnits,
} from '../src/encoding/tactMessageCells.js';
import type { CapitalAppSlug } from '../src/types/domain.js';

type GeneratedContractInstance = Contract & {
  readonly address: Address;
};

type GeneratedContractClass<TContract extends GeneratedContractInstance> = {
  fromAddress: (address: Address) => TContract;
};

type ChainStateName = 'active' | 'uninitialized' | 'frozen' | 'unknown';

type Manifest = {
  readonly contracts: {
    readonly TestJetton72H: string;
    readonly CapitalRegistry: string;
    readonly ReserveVaults: Record<CapitalAppSlug, string>;
    readonly ReserveVaultJettonWallets?: Partial<Record<CapitalAppSlug, string>>;
  };
};

type OpenedCapitalRegistry = GeneratedContractInstance & {
  getGetReserveSeatByOwner: (owner: Address) => Promise<bigint>;
};

type OpenedReserveVault = GeneratedContractInstance & {
  getGetAppId: () => Promise<bigint>;
  getGetJettonWalletAddress: () => Promise<Address>;
  getGetMinimumAllocation72H: () => Promise<bigint>;
  getGetNextLotId: () => Promise<bigint>;
  getGetNextSeatNumber: () => Promise<bigint>;
  getGetSeatByOwner: (owner: Address) => Promise<bigint>;
  getGetOwnerBySeat: (seatNumber: bigint) => Promise<Address>;
  getGetPrincipalBySeat: (seatNumber: bigint) => Promise<bigint>;
  getGetLotOwner: (lotId: bigint) => Promise<Address>;
  getGetLotSeat: (lotId: bigint) => Promise<bigint>;
  getGetLotAmount: (lotId: bigint) => Promise<bigint>;
  getGetTotalPrincipal72H: () => Promise<bigint>;
};

type OpenedTestJetton = GeneratedContractInstance & {
  getGetWalletAddress: (owner: Address) => Promise<Address>;
  getGetTotalSupply72H: () => Promise<bigint>;
};

type OpenedTestJettonWallet = GeneratedContractInstance & {
  getGetBalance: () => Promise<bigint>;
};

const CAPITAL_APP_IDS: Readonly<Record<CapitalAppSlug, bigint>> = {
  '72hours': 1n,
  wan: 2n,
  'multi-millionaire': 3n,
};

const DEFAULT_APP: CapitalAppSlug = '72hours';
const DEFAULT_AMOUNT_72H = 720n;
const MINT_MESSAGE_VALUE = 80_000_000n;
const JETTON_TRANSFER_MESSAGE_VALUE = 90_000_000n;
const POLL_INTERVAL_MS = 2_500;
const POLL_ATTEMPTS = 40;

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

async function withRpcRetry<T>(label: string, operation: () => Promise<T>, attempts = 6) {
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

async function loadGeneratedContract<TContract extends GeneratedContractInstance>(
  relativePath: string,
  exportName: string,
) {
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

function readManifest(): Manifest {
  const path = resolve(process.cwd(), 'deployments/testnet.latest.json');
  if (!existsSync(path)) {
    throw new Error('Missing deployments/testnet.latest.json. Run npm run deploy:testnet first.');
  }

  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

function createClient(endpoint: string) {
  const apiKey = optionalEnv('TON_TESTNET_RPC_API_KEY') ?? optionalEnv('TON_TESTNET_API_KEY') ?? optionalEnv('TONCENTER_API_KEY');
  const parameters: TonClientParameters = { endpoint, timeout: 20_000 };
  if (apiKey) {
    parameters.apiKey = apiKey;
  }
  return new TonClient(parameters);
}

function parseApp(value: string | undefined): CapitalAppSlug {
  const app = value?.trim() || DEFAULT_APP;
  if (app !== '72hours' && app !== 'wan' && app !== 'multi-millionaire') {
    throw new Error(`Unsupported TON_TESTNET_REHEARSAL_APP=${app}.`);
  }
  return app;
}

function parseWhole72HAmount(value: string | undefined) {
  const amount = value?.trim() || DEFAULT_AMOUNT_72H.toString();
  if (!/^[1-9]\d*$/.test(amount)) {
    throw new Error(`TON_TESTNET_REHEARSAL_AMOUNT_72H must be a positive whole 72H amount. Got ${amount}.`);
  }
  return BigInt(amount);
}

async function getWalletSeqno(client: TonClient, wallet: WalletContractV4) {
  return withRpcRetry('wallet seqno', () => wallet.getSeqno(client.provider(wallet.address, wallet.init)));
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

async function getContractState(client: TonClient, address: Address) {
  try {
    const state = await withRpcRetry(`contract state ${formatAddress(address)}`, () => client.getContractState(address));
    return {
      state: state.state,
      balance: state.balance,
    };
  } catch (error) {
    console.warn(`Unable to read ${formatAddress(address)} state: ${getErrorMessage(error)}`);
    return {
      state: 'unknown' as ChainStateName,
      balance: 0n,
    };
  }
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
    readonly body: Cell;
  },
) {
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

async function waitForCondition(label: string, predicate: () => Promise<boolean>) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    if (await predicate()) {
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`${label} was not observed before timeout.`);
}

function assertAddress(label: string, actual: Address, expected: Address) {
  if (!actual.equals(expected)) {
    throw new Error(`${label} mismatch: expected ${formatAddress(expected)}, got ${formatAddress(actual)}.`);
  }
}

const loadedEnvFiles = loadLocalEnv();
const manifest = readManifest();
const shouldSend = process.argv.includes('--send');

if (shouldSend && process.env.TON_TESTNET_ALLOW_REHEARSAL_SEND !== 'true') {
  throw new Error('Refusing to send. Set TON_TESTNET_ALLOW_REHEARSAL_SEND=true and pass --send.');
}

const endpoint = requireEnv('TON_TESTNET_RPC_URL');
const configuredDeployerAddress = Address.parse(requireEnv('TON_TESTNET_DEPLOYER_ADDRESS'));
const rehearsalWalletAddress = Address.parse(optionalEnv('TON_TESTNET_REHEARSAL_WALLET_ADDRESS') ?? formatAddress(configuredDeployerAddress));
const app = parseApp(optionalEnv('TON_TESTNET_REHEARSAL_APP'));
const amount72H = parseWhole72HAmount(optionalEnv('TON_TESTNET_REHEARSAL_AMOUNT_72H'));
const amountAtomic = to72HJettonUnits(amount72H);
const reserveVaultAddress = Address.parse(manifest.contracts.ReserveVaults[app]);
const testJettonAddress = Address.parse(manifest.contracts.TestJetton72H);
const registryAddress = Address.parse(manifest.contracts.CapitalRegistry);
const manifestReserveJettonWalletAddress = manifest.contracts.ReserveVaultJettonWallets?.[app]
  ? Address.parse(manifest.contracts.ReserveVaultJettonWallets[app])
  : undefined;
const client = createClient(endpoint);

const TestJetton72H = await loadGeneratedContract<GeneratedContractInstance>(
  'build/tact/TestJetton72H/TestJetton72H_TestJetton72H.ts',
  'TestJetton72H',
);
const TestJetton72HWallet = await loadGeneratedContract<GeneratedContractInstance>(
  'build/tact/TestJetton72H/TestJetton72H_TestJetton72HWallet.ts',
  'TestJetton72HWallet',
);
const CapitalRegistry = await loadGeneratedContract<GeneratedContractInstance>(
  'build/tact/CapitalRegistry/CapitalRegistry_CapitalRegistry.ts',
  'CapitalRegistry',
);
const ReserveVault = await loadGeneratedContract<GeneratedContractInstance>(
  'build/tact/ReserveVault/ReserveVault_ReserveVault.ts',
  'ReserveVault',
);

const testJetton = client.open(TestJetton72H.fromAddress(testJettonAddress)) as OpenedTestJetton;
const registry = client.open(CapitalRegistry.fromAddress(registryAddress)) as OpenedCapitalRegistry;
const reserveVault = client.open(ReserveVault.fromAddress(reserveVaultAddress)) as OpenedReserveVault;
const userJettonWalletAddress = await withRpcRetry('user jetton wallet address', () =>
  testJetton.getGetWalletAddress(rehearsalWalletAddress),
);
const reserveJettonWalletFromMaster = await withRpcRetry('reserve jetton wallet address from master', () =>
  testJetton.getGetWalletAddress(reserveVaultAddress),
);
const reserveJettonWalletFromVault = await withRpcRetry('reserve jetton wallet address from vault', () =>
  reserveVault.getGetJettonWalletAddress(),
);
assertAddress('reserve Jetton wallet getter', reserveJettonWalletFromVault, reserveJettonWalletFromMaster);
if (manifestReserveJettonWalletAddress) {
  assertAddress('manifest reserve Jetton wallet', manifestReserveJettonWalletAddress, reserveJettonWalletFromVault);
}
const userJettonWallet = client.open(TestJetton72HWallet.fromAddress(userJettonWalletAddress)) as OpenedTestJettonWallet;
const reserveJettonWallet = client.open(
  TestJetton72HWallet.fromAddress(reserveJettonWalletFromVault),
) as OpenedTestJettonWallet;

const reserveTransfer = createReserveJettonTransferMessageCell({
  app,
  userJettonWallet: userJettonWalletAddress,
  reserveVault: reserveVaultAddress,
  responseDestination: rehearsalWalletAddress,
  amount72H,
  queryId: BigInt(Date.now()),
});
const mint = createMintTest72HMessageCell({
  to: rehearsalWalletAddress,
  amount72H,
});

const userWalletState = await getContractState(client, userJettonWalletAddress);
const reserveJettonWalletState = await getContractState(client, reserveJettonWalletFromVault);
const reserveVaultState = await getContractState(client, reserveVaultAddress);
const beforeTotalSupply = await withRpcRetry('test jetton total supply before', () =>
  testJetton.getGetTotalSupply72H(),
);
const beforeRegistrySeat = await withRpcRetry('registry reserve seat before', () =>
  registry.getGetReserveSeatByOwner(rehearsalWalletAddress),
);
const beforeVaultSeat = await withRpcRetry('vault reserve seat before', () =>
  reserveVault.getGetSeatByOwner(rehearsalWalletAddress),
);
const beforeNextSeat = await withRpcRetry('vault next seat before', () => reserveVault.getGetNextSeatNumber());
const beforeNextLotId = await withRpcRetry('vault next lot before', () => reserveVault.getGetNextLotId());
const beforeTotalPrincipal = await withRpcRetry('vault total principal before', () =>
  reserveVault.getGetTotalPrincipal72H(),
);
const beforeUserJettonBalance =
  userWalletState.state === 'active'
    ? await withRpcRetry('user jetton balance before', () => userJettonWallet.getGetBalance())
    : 0n;
const beforeReserveJettonBalance =
  reserveJettonWalletState.state === 'active'
    ? await withRpcRetry('reserve jetton balance before', () => reserveJettonWallet.getGetBalance())
    : 0n;

console.log('72H Capital testnet Reserve rehearsal');
console.log(`Mode: ${shouldSend ? 'send enabled' : 'dry-run'}`);
console.log(`Loaded env files: ${loadedEnvFiles.length > 0 ? loadedEnvFiles.join(', ') : 'none'}`);
console.log(`RPC URL: ${maskValue(endpoint)}`);
console.log(`App: ${app} (appId=${CAPITAL_APP_IDS[app].toString()})`);
console.log(`Amount: ${amount72H.toString()} 72H (${amountAtomic.toString()} atomic units)`);
console.log(`Deployer: ${formatAddress(configuredDeployerAddress)}`);
console.log(`Rehearsal wallet: ${formatAddress(rehearsalWalletAddress)}`);
console.log(`TestJetton72H: ${formatAddress(testJettonAddress)}`);
console.log(`TestJetton total supply: ${beforeTotalSupply.toString()}`);
console.log(`User Jetton wallet: ${formatAddress(userJettonWalletAddress)} | state=${userWalletState.state} | balance=${beforeUserJettonBalance.toString()}`);
console.log(`Reserve Jetton wallet: ${formatAddress(reserveJettonWalletFromVault)} | state=${reserveJettonWalletState.state} | balance=${beforeReserveJettonBalance.toString()}`);
console.log(`ReserveVault(${app}): ${formatAddress(reserveVaultAddress)} | state=${reserveVaultState.state} | balance=${fromNano(reserveVaultState.balance)} TON`);
console.log(`Registry: ${formatAddress(registryAddress)}`);
console.log(`Before: registrySeat=${beforeRegistrySeat.toString()} vaultSeat=${beforeVaultSeat.toString()} nextSeat=${beforeNextSeat.toString()} nextLotId=${beforeNextLotId.toString()} totalPrincipal=${beforeTotalPrincipal.toString()}`);
console.log(`Mint payload: ${mint.payloadBase64}`);
console.log(`Jetton transfer payload: ${reserveTransfer.payloadBase64}`);

const appId = await withRpcRetry('vault app id', () => reserveVault.getGetAppId());
if (appId !== CAPITAL_APP_IDS[app]) {
  throw new Error(`ReserveVault appId mismatch: expected ${CAPITAL_APP_IDS[app].toString()}, got ${appId.toString()}.`);
}

const minimumAllocation = await withRpcRetry('vault minimum allocation', () =>
  reserveVault.getGetMinimumAllocation72H(),
);
if (beforeVaultSeat === 0n && amountAtomic < minimumAllocation) {
  throw new Error(
    `Amount ${amountAtomic.toString()} is below first-allocation minimum ${minimumAllocation.toString()}.`,
  );
}

if (!shouldSend) {
  console.log('');
  console.log('No transactions sent. Dry-run checks completed: active manifest addresses, derived user/vault Jetton wallets, current balances, vault app/minimum, and planned mint/transfer payloads.');
  console.log('To rehearse on testnet, set TON_TESTNET_ALLOW_REHEARSAL_SEND=true and run npm run rehearse:testnet:reserve:send.');
  process.exit(0);
}

const mnemonic = requireEnv('TON_TESTNET_DEPLOYER_MNEMONIC').split(/\s+/).filter(Boolean);
const keyPair = await mnemonicToPrivateKey(mnemonic);
const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });

if (!wallet.address.equals(configuredDeployerAddress)) {
  throw new Error(
    `Configured deployer ${formatAddress(configuredDeployerAddress)} differs from derived Wallet V4 ${formatAddress(wallet.address)}.`,
  );
}

if (!wallet.address.equals(rehearsalWalletAddress)) {
  throw new Error(
    `Send mode requires TON_TESTNET_REHEARSAL_WALLET_ADDRESS to match the deployer Wallet V4 so the script can sign the user Jetton wallet transfer.`,
  );
}

await sendInternalMessage(client, wallet, 'TestJetton72H.mintTest72H', {
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
  const totalSupply = await withRpcRetry('test jetton total supply after mint', () =>
    testJetton.getGetTotalSupply72H(),
  );
  return totalSupply >= beforeTotalSupply + amountAtomic;
});

await sendInternalMessage(client, wallet, `Jetton transfer to ReserveVault(${app})`, {
  to: reserveTransfer.userJettonWallet,
  value: JETTON_TRANSFER_MESSAGE_VALUE,
  bounce: true,
  secretKey: keyPair.secretKey,
  body: reserveTransfer.body,
});

const expectedVaultSeat = beforeVaultSeat === 0n ? beforeNextSeat : beforeVaultSeat;
await waitForCondition('ReserveVault lot/principal update', async () => {
  const nextLotId = await withRpcRetry('vault next lot after transfer', () => reserveVault.getGetNextLotId());
  const totalPrincipal = await withRpcRetry('vault total principal after transfer', () =>
    reserveVault.getGetTotalPrincipal72H(),
  );
  return nextLotId >= beforeNextLotId + 1n && totalPrincipal >= beforeTotalPrincipal + amountAtomic;
});

const afterVaultSeat = await withRpcRetry('vault reserve seat after', () =>
  reserveVault.getGetSeatByOwner(rehearsalWalletAddress),
);
if (afterVaultSeat !== expectedVaultSeat) {
  throw new Error(`Vault seat mismatch: expected ${expectedVaultSeat.toString()}, got ${afterVaultSeat.toString()}.`);
}

await waitForCondition('Registry seat assignment', async () => {
  const registrySeat = await withRpcRetry('registry reserve seat after', () =>
    registry.getGetReserveSeatByOwner(rehearsalWalletAddress),
  );
  return registrySeat === afterVaultSeat;
});

const afterRegistrySeat = await withRpcRetry('registry reserve seat final', () =>
  registry.getGetReserveSeatByOwner(rehearsalWalletAddress),
);
const afterNextLotId = await withRpcRetry('vault next lot final', () => reserveVault.getGetNextLotId());
const recordedLotId = afterNextLotId - 1n;
const lotOwner = await withRpcRetry('vault lot owner', () => reserveVault.getGetLotOwner(recordedLotId));
const lotSeat = await withRpcRetry('vault lot seat', () => reserveVault.getGetLotSeat(recordedLotId));
const lotAmount = await withRpcRetry('vault lot amount', () => reserveVault.getGetLotAmount(recordedLotId));
const seatOwner = await withRpcRetry('vault owner by seat', () => reserveVault.getGetOwnerBySeat(afterVaultSeat));
const principalBySeat = await withRpcRetry('vault principal by seat', () =>
  reserveVault.getGetPrincipalBySeat(afterVaultSeat),
);
const afterTotalPrincipal = await withRpcRetry('vault total principal final', () =>
  reserveVault.getGetTotalPrincipal72H(),
);
const afterUserJettonBalance = await withRpcRetry('user jetton balance final', () => userJettonWallet.getGetBalance());
const afterReserveJettonBalance = await withRpcRetry('reserve jetton balance final', () =>
  reserveJettonWallet.getGetBalance(),
);
const afterTotalSupply = await withRpcRetry('test jetton total supply final', () => testJetton.getGetTotalSupply72H());

assertAddress('lot owner', lotOwner, rehearsalWalletAddress);
assertAddress('seat owner', seatOwner, rehearsalWalletAddress);
if (lotSeat !== afterVaultSeat) {
  throw new Error(`Lot seat mismatch: expected ${afterVaultSeat.toString()}, got ${lotSeat.toString()}.`);
}
if (lotAmount !== amountAtomic) {
  throw new Error(`Lot amount mismatch: expected ${amountAtomic.toString()}, got ${lotAmount.toString()}.`);
}
if (principalBySeat < amountAtomic) {
  throw new Error(`Principal by seat below rehearsal amount: ${principalBySeat.toString()}.`);
}
if (afterReserveJettonBalance < beforeReserveJettonBalance + amountAtomic) {
  throw new Error(
    `Reserve Jetton balance did not increase by rehearsal amount: before=${beforeReserveJettonBalance.toString()} after=${afterReserveJettonBalance.toString()}.`,
  );
}
if (afterTotalSupply < beforeTotalSupply + amountAtomic) {
  throw new Error(
    `TestJetton total supply did not increase by minted amount: before=${beforeTotalSupply.toString()} after=${afterTotalSupply.toString()}.`,
  );
}

console.log('');
console.log('Rehearsal sent and verified.');
console.log(`Registry seat: ${afterRegistrySeat.toString()}`);
console.log(`ReserveVault seat: ${afterVaultSeat.toString()}`);
console.log(`Recorded lot: ${recordedLotId.toString()} amount=${lotAmount.toString()}`);
console.log(`Principal by seat: ${principalBySeat.toString()}`);
console.log(`Total principal: ${afterTotalPrincipal.toString()}`);
console.log(`User Jetton balance: ${afterUserJettonBalance.toString()}`);
console.log(`Reserve Jetton balance: ${afterReserveJettonBalance.toString()}`);
console.log(`TestJetton total supply: ${afterTotalSupply.toString()}`);
