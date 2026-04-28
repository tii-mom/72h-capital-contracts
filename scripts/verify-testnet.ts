import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, type Contract } from '@ton/core';
import { TonClient, type TonClientParameters } from '@ton/ton';
import type { CapitalAppSlug } from '../src/types/domain.js';

type GeneratedContractInstance = Contract & {
  readonly address: Address;
};

type GeneratedContractClass<TContract extends GeneratedContractInstance> = {
  fromAddress: (address: Address) => TContract;
};

type Manifest = {
  readonly governance?: {
    readonly signerSource?: string;
    readonly signers?: readonly string[];
  };
  readonly contracts: {
    readonly TestJetton72H: string;
    readonly AdminMultisig?: string;
    readonly CapitalRegistry: string;
    readonly Treasury?: string;
    readonly ReserveVaults: Record<CapitalAppSlug, string>;
    readonly ReserveVaultJettonWallets?: Record<CapitalAppSlug, string>;
    readonly AppRewardPools?: Record<CapitalAppSlug, string>;
    readonly AppRewardPoolJettonWallets?: Record<CapitalAppSlug, string>;
    readonly AlphaVaults?: Record<CapitalAppSlug, string>;
    readonly AlphaVaultJettonWallets?: Record<CapitalAppSlug, string>;
  };
};

type OpenedCapitalRegistry = GeneratedContractInstance & {
  getGetOwner: () => Promise<Address>;
  getGetReserveSeatCap: () => Promise<bigint>;
  getGetAlphaSeatCap: () => Promise<bigint>;
  getGetNextReserveSeat: (appId: bigint) => Promise<bigint>;
  getGetReserveVaultByApp: (appId: bigint) => Promise<Address>;
};

type OpenedReserveVault = GeneratedContractInstance & {
  getGetOwner: () => Promise<Address>;
  getGetRegistry: () => Promise<Address>;
  getGetJettonMaster: () => Promise<Address>;
  getGetJettonWalletAddress: () => Promise<Address>;
  getGetAppId: () => Promise<bigint>;
  getGetMinimumAllocation72H: () => Promise<bigint>;
  getGetNextSeatNumber: () => Promise<bigint>;
  getGetNextLotId: () => Promise<bigint>;
  getGetTotalPrincipal72H: () => Promise<bigint>;
};

type OpenedAppRewardPool = GeneratedContractInstance & {
  getGetOwner: () => Promise<Address>;
  getGetJettonMaster: () => Promise<Address>;
  getGetJettonWalletAddress: () => Promise<Address>;
  getGetAppId: () => Promise<bigint>;
  getGetAvailableRewards72H: () => Promise<bigint>;
  getGetTotalFunded72H: () => Promise<bigint>;
  getGetTotalClaimed72H: () => Promise<bigint>;
  getGetCumulativeRewardPerWeightScaled: () => Promise<bigint>;
  getGetTotalRewardWeight: () => Promise<bigint>;
};

type OpenedTestJetton = GeneratedContractInstance & {
  getGetOwner: () => Promise<Address>;
  getGetDecimals: () => Promise<bigint>;
  getGetTotalSupply72H: () => Promise<bigint>;
  getGetWalletAddress: (owner: Address) => Promise<Address>;
};

type OpenedAdminMultisig = GeneratedContractInstance & {
  getGetSignerCount: () => Promise<bigint>;
  getGetThreshold: () => Promise<bigint>;
  getIsSigner: (account: Address) => Promise<boolean>;
};

type OpenedTreasury = GeneratedContractInstance & {
  getGetOwner: () => Promise<Address>;
  getGetAvailableBalance72H: () => Promise<bigint>;
  getGetReserveClaimIntervalSeconds: () => Promise<bigint>;
  getGetAlphaSettlementIntervalSeconds: () => Promise<bigint>;
};

type OpenedAlphaVault = GeneratedContractInstance & {
  getGetOwner: () => Promise<Address>;
  getGetTreasury: () => Promise<Address>;
  getGetJettonMaster: () => Promise<Address>;
  getGetJettonWalletAddress: () => Promise<Address>;
  getGetAppId: () => Promise<bigint>;
  getGetSeatCap: () => Promise<bigint>;
  getGetThreshold72H: () => Promise<bigint>;
  getGetCycleDurationSeconds: () => Promise<bigint>;
  getGetSettlementIntervalSeconds: () => Promise<bigint>;
  getGetNextSeatNumber: () => Promise<bigint>;
  getGetTotalPrincipal72H: () => Promise<bigint>;
};

const CAPITAL_APPS: readonly CapitalAppSlug[] = ['72hours', 'wan', 'multi-millionaire'];
const CAPITAL_APP_IDS: Readonly<Record<CapitalAppSlug, bigint>> = {
  '72hours': 1n,
  wan: 2n,
  'multi-millionaire': 3n,
};

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
  }
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

async function withRpcRetry<T>(label: string, operation: () => Promise<T>) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableRpcError(error) || attempt === 6) {
        break;
      }

      const delayMs = attempt * 5_000;
      console.warn(`${label} failed (${getErrorMessage(error)}). Retrying in ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function formatAddress(address: Address) {
  return address.toString({ testOnly: true });
}

async function getChainState(client: TonClient, address: Address) {
  return withRpcRetry(`contract state ${formatAddress(address)}`, () => client.getContractState(address));
}

async function isActive(client: TonClient, label: string, address: Address) {
  const state = await getChainState(client, address);
  if (state.state !== 'active') {
    console.log(`Skipping ${label} getter verification: ${formatAddress(address)} is ${state.state}.`);
    return false;
  }
  return true;
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

function assertAddress(label: string, actual: Address, expected: Address) {
  if (!actual.equals(expected)) {
    throw new Error(`${label} mismatch: expected ${formatAddress(expected)}, got ${formatAddress(actual)}.`);
  }
}

function assertBigint(label: string, actual: bigint, expected: bigint) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected.toString()}, got ${actual.toString()}.`);
  }
}

function assertBigintAtLeast(label: string, actual: bigint, minimum: bigint) {
  if (actual < minimum) {
    throw new Error(`${label} is below minimum: expected at least ${minimum.toString()}, got ${actual.toString()}.`);
  }
}

function assertBigintAtMost(label: string, actual: bigint, maximum: bigint) {
  if (actual > maximum) {
    throw new Error(`${label} is above maximum: expected at most ${maximum.toString()}, got ${actual.toString()}.`);
  }
}

loadLocalEnv();

const manifest = readManifest();
const client = createClient(requireEnv('TON_TESTNET_RPC_URL'));
const expectedOwner = Address.parse(requireEnv('TON_TESTNET_DEPLOYER_ADDRESS'));

const TestJetton72H = await loadGeneratedContract<GeneratedContractInstance>(
  'build/tact/TestJetton72H/TestJetton72H_TestJetton72H.ts',
  'TestJetton72H',
);
const AdminMultisig = await loadGeneratedContract<GeneratedContractInstance>(
  'build/tact/AdminMultisig/AdminMultisig_AdminMultisig.ts',
  'AdminMultisig',
);
const CapitalRegistry = await loadGeneratedContract<GeneratedContractInstance>(
  'build/tact/CapitalRegistry/CapitalRegistry_CapitalRegistry.ts',
  'CapitalRegistry',
);
const ReserveVault = await loadGeneratedContract<GeneratedContractInstance>(
  'build/tact/ReserveVault/ReserveVault_ReserveVault.ts',
  'ReserveVault',
);
const Treasury = await loadGeneratedContract<GeneratedContractInstance>(
  'build/tact/Treasury/Treasury_Treasury.ts',
  'Treasury',
);
const AlphaVault = await loadGeneratedContract<GeneratedContractInstance>(
  'build/tact/AlphaVault/AlphaVault_AlphaVault.ts',
  'AlphaVault',
);
const AppRewardPool = await loadGeneratedContract<GeneratedContractInstance>(
  'build/tact/AppRewardPool/AppRewardPool_AppRewardPool.ts',
  'AppRewardPool',
);

const testJetton = client.open(TestJetton72H.fromAddress(Address.parse(manifest.contracts.TestJetton72H))) as OpenedTestJetton;
const registryAddress = Address.parse(manifest.contracts.CapitalRegistry);
const registry = client.open(CapitalRegistry.fromAddress(registryAddress)) as OpenedCapitalRegistry;
const adminMultisigAddress = manifest.contracts.AdminMultisig
  ? Address.parse(manifest.contracts.AdminMultisig)
  : undefined;
const treasuryAddress = manifest.contracts.Treasury
  ? Address.parse(manifest.contracts.Treasury)
  : undefined;

console.log('72H Capital testnet verification');
console.log(`Registry: ${formatAddress(registryAddress)}`);

assertAddress('TestJetton owner', await withRpcRetry('TestJetton owner', () => testJetton.getGetOwner()), expectedOwner);
assertBigint('TestJetton decimals', await withRpcRetry('TestJetton decimals', () => testJetton.getGetDecimals()), 9n);
console.log(`TestJetton totalSupply72H=${(await withRpcRetry('TestJetton supply', () => testJetton.getGetTotalSupply72H())).toString()}`);

assertAddress('Registry owner', await withRpcRetry('Registry owner', () => registry.getGetOwner()), expectedOwner);
assertBigint('Registry reserve cap', await withRpcRetry('Registry reserve cap', () => registry.getGetReserveSeatCap()), 72n);
assertBigint('Registry alpha cap', await withRpcRetry('Registry alpha cap', () => registry.getGetAlphaSeatCap()), 9n);

if (adminMultisigAddress) {
  if (!(await isActive(client, 'AdminMultisig', adminMultisigAddress))) {
    console.log(`Planned AdminMultisig: ${formatAddress(adminMultisigAddress)}`);
  } else {
  const adminMultisig = client.open(AdminMultisig.fromAddress(adminMultisigAddress)) as OpenedAdminMultisig;
  assertBigint('Admin authority signer count', await withRpcRetry('Admin authority signer count', () => adminMultisig.getGetSignerCount()), 1n);
  assertBigint('Admin authority threshold', await withRpcRetry('Admin authority threshold', () => adminMultisig.getGetThreshold()), 1n);

  if (manifest.governance?.signers) {
    for (const [index, signer] of manifest.governance.signers.entries()) {
      const signerAddress = Address.parse(signer);
      const isSigner = await withRpcRetry(`AdminMultisig signer ${index + 1}`, () => adminMultisig.getIsSigner(signerAddress));
      if (!isSigner) {
        throw new Error(`AdminMultisig signer ${index + 1} is not registered: ${formatAddress(signerAddress)}.`);
      }
    }
  }
  console.log(`Verified AdminMultisig: ${formatAddress(adminMultisigAddress)}`);
  }
}

if (treasuryAddress) {
  if (!(await isActive(client, 'Treasury', treasuryAddress))) {
    console.log(`Planned Treasury: ${formatAddress(treasuryAddress)}`);
  } else {
  const treasury = client.open(Treasury.fromAddress(treasuryAddress)) as OpenedTreasury;
  const expectedTreasuryOwner = expectedOwner;
  assertAddress('Treasury owner', await withRpcRetry('Treasury owner', () => treasury.getGetOwner()), expectedTreasuryOwner);
  assertBigintAtLeast('Treasury balance accounting', await withRpcRetry('Treasury balance accounting', () => treasury.getGetAvailableBalance72H()), 0n);
  assertBigint('Treasury reserve interval', await withRpcRetry('Treasury reserve interval', () => treasury.getGetReserveClaimIntervalSeconds()), 604800n);
  assertBigint('Treasury alpha interval', await withRpcRetry('Treasury alpha interval', () => treasury.getGetAlphaSettlementIntervalSeconds()), 4233600n);
  console.log(`Verified Treasury: ${formatAddress(treasuryAddress)}`);
  }
}

for (const app of CAPITAL_APPS) {
  const appId = CAPITAL_APP_IDS[app];
  const vaultAddress = Address.parse(manifest.contracts.ReserveVaults[app]);
  const manifestJettonWalletAddress = manifest.contracts.ReserveVaultJettonWallets?.[app]
    ? Address.parse(manifest.contracts.ReserveVaultJettonWallets[app])
    : undefined;
  const boundVault = await withRpcRetry(`Registry vault ${app}`, () => registry.getGetReserveVaultByApp(appId));
  assertAddress(`Registry vault ${app}`, boundVault, vaultAddress);
  const registryNextSeat = await withRpcRetry(`Registry next reserve seat ${app}`, () => registry.getGetNextReserveSeat(appId));
  assertBigintAtLeast(`Registry next reserve seat ${app}`, registryNextSeat, 1n);
  assertBigintAtMost(`Registry next reserve seat ${app}`, registryNextSeat, 73n);

  const vault = client.open(ReserveVault.fromAddress(vaultAddress)) as OpenedReserveVault;
  assertAddress(`ReserveVault ${app} owner`, await withRpcRetry(`ReserveVault ${app} owner`, () => vault.getGetOwner()), expectedOwner);
  assertAddress(`ReserveVault ${app} registry`, await withRpcRetry(`ReserveVault ${app} registry`, () => vault.getGetRegistry()), registryAddress);
  assertAddress(
    `ReserveVault ${app} jetton master`,
    await withRpcRetry(`ReserveVault ${app} jetton master`, () => vault.getGetJettonMaster()),
    Address.parse(manifest.contracts.TestJetton72H),
  );
  const vaultJettonWallet = await withRpcRetry(`ReserveVault ${app} jetton wallet`, () => vault.getGetJettonWalletAddress());
  const masterDerivedVaultWallet = await withRpcRetry(`TestJetton wallet address ${app}`, () => testJetton.getGetWalletAddress(vaultAddress));
  assertAddress(`ReserveVault ${app} jetton wallet`, vaultJettonWallet, masterDerivedVaultWallet);
  if (manifestJettonWalletAddress) {
    assertAddress(`Manifest ReserveVault ${app} jetton wallet`, vaultJettonWallet, manifestJettonWalletAddress);
  }
  assertBigint(`ReserveVault ${app} appId`, await withRpcRetry(`ReserveVault ${app} appId`, () => vault.getGetAppId()), appId);
  assertBigint(
    `ReserveVault ${app} minimum`,
    await withRpcRetry(`ReserveVault ${app} minimum`, () => vault.getGetMinimumAllocation72H()),
    720_000_000_000n,
  );
  const vaultNextSeat = await withRpcRetry(`ReserveVault ${app} next seat`, () => vault.getGetNextSeatNumber());
  const vaultNextLot = await withRpcRetry(`ReserveVault ${app} next lot`, () => vault.getGetNextLotId());
  const totalPrincipal = await withRpcRetry(`ReserveVault ${app} total principal`, () => vault.getGetTotalPrincipal72H());
  assertBigint(`ReserveVault ${app} next seat equals registry`, vaultNextSeat, registryNextSeat);
  assertBigintAtLeast(`ReserveVault ${app} next lot`, vaultNextLot, 1n);
  assertBigintAtLeast(`ReserveVault ${app} total principal`, totalPrincipal, 0n);
  console.log(`Verified ${app}: ${formatAddress(vaultAddress)} nextSeat=${vaultNextSeat} nextLot=${vaultNextLot} principal=${totalPrincipal}`);
}

if (manifest.contracts.AppRewardPools) {
  for (const app of CAPITAL_APPS) {
    const poolAddressValue = manifest.contracts.AppRewardPools[app];
    if (!poolAddressValue) {
      throw new Error(`Manifest missing AppRewardPools.${app}.`);
    }

    const appId = CAPITAL_APP_IDS[app];
    const poolAddress = Address.parse(poolAddressValue);
    const manifestJettonWalletAddress = manifest.contracts.AppRewardPoolJettonWallets?.[app]
      ? Address.parse(manifest.contracts.AppRewardPoolJettonWallets[app])
      : undefined;
    if (!(await isActive(client, `AppRewardPool ${app}`, poolAddress))) {
      console.log(`Planned AppRewardPool ${app}: ${formatAddress(poolAddress)}`);
      continue;
    }

    const pool = client.open(AppRewardPool.fromAddress(poolAddress)) as OpenedAppRewardPool;
    assertAddress(`AppRewardPool ${app} owner`, await withRpcRetry(`AppRewardPool ${app} owner`, () => pool.getGetOwner()), expectedOwner);
    assertAddress(
      `AppRewardPool ${app} jetton master`,
      await withRpcRetry(`AppRewardPool ${app} jetton master`, () => pool.getGetJettonMaster()),
      Address.parse(manifest.contracts.TestJetton72H),
    );
    const poolJettonWallet = await withRpcRetry(`AppRewardPool ${app} jetton wallet`, () => pool.getGetJettonWalletAddress());
    const masterDerivedPoolWallet = await withRpcRetry(`TestJetton reward pool wallet address ${app}`, () => testJetton.getGetWalletAddress(poolAddress));
    assertAddress(`AppRewardPool ${app} jetton wallet`, poolJettonWallet, masterDerivedPoolWallet);
    if (manifestJettonWalletAddress) {
      assertAddress(`Manifest AppRewardPool ${app} jetton wallet`, poolJettonWallet, manifestJettonWalletAddress);
    }
    assertBigint(`AppRewardPool ${app} appId`, await withRpcRetry(`AppRewardPool ${app} appId`, () => pool.getGetAppId()), appId);
    assertBigintAtLeast(`AppRewardPool ${app} available rewards`, await withRpcRetry(`AppRewardPool ${app} available rewards`, () => pool.getGetAvailableRewards72H()), 0n);
    assertBigintAtLeast(`AppRewardPool ${app} total funded`, await withRpcRetry(`AppRewardPool ${app} total funded`, () => pool.getGetTotalFunded72H()), 0n);
    assertBigintAtLeast(`AppRewardPool ${app} total claimed`, await withRpcRetry(`AppRewardPool ${app} total claimed`, () => pool.getGetTotalClaimed72H()), 0n);
    assertBigintAtLeast(
      `AppRewardPool ${app} reward per weight`,
      await withRpcRetry(`AppRewardPool ${app} reward per weight`, () => pool.getGetCumulativeRewardPerWeightScaled()),
      0n,
    );
    assertBigintAtLeast(`AppRewardPool ${app} total weight`, await withRpcRetry(`AppRewardPool ${app} total weight`, () => pool.getGetTotalRewardWeight()), 0n);
    console.log(`Verified AppRewardPool ${app}: ${formatAddress(poolAddress)}`);
  }
}

if (manifest.contracts.AlphaVaults) {
  if (!treasuryAddress || !adminMultisigAddress) {
    throw new Error('Manifest contains AlphaVaults but is missing AdminMultisig or Treasury.');
  }

  for (const app of CAPITAL_APPS) {
    const alphaAddressValue = manifest.contracts.AlphaVaults[app];
    if (!alphaAddressValue) {
      throw new Error(`Manifest missing AlphaVaults.${app}.`);
    }

    const appId = CAPITAL_APP_IDS[app];
    const alphaVaultAddress = Address.parse(alphaAddressValue);
    const manifestJettonWalletAddress = manifest.contracts.AlphaVaultJettonWallets?.[app]
      ? Address.parse(manifest.contracts.AlphaVaultJettonWallets[app])
      : undefined;
    if (!(await isActive(client, `AlphaVault ${app}`, alphaVaultAddress))) {
      console.log(`Planned AlphaVault ${app}: ${formatAddress(alphaVaultAddress)}`);
      continue;
    }

    const alphaVault = client.open(AlphaVault.fromAddress(alphaVaultAddress)) as OpenedAlphaVault;

    assertAddress(`AlphaVault ${app} owner`, await withRpcRetry(`AlphaVault ${app} owner`, () => alphaVault.getGetOwner()), expectedOwner);
    assertAddress(`AlphaVault ${app} treasury`, await withRpcRetry(`AlphaVault ${app} treasury`, () => alphaVault.getGetTreasury()), treasuryAddress);
    assertAddress(
      `AlphaVault ${app} jetton master`,
      await withRpcRetry(`AlphaVault ${app} jetton master`, () => alphaVault.getGetJettonMaster()),
      Address.parse(manifest.contracts.TestJetton72H),
    );
    const alphaJettonWallet = await withRpcRetry(`AlphaVault ${app} jetton wallet`, () => alphaVault.getGetJettonWalletAddress());
    const masterDerivedAlphaWallet = await withRpcRetry(`TestJetton alpha wallet address ${app}`, () => testJetton.getGetWalletAddress(alphaVaultAddress));
    assertAddress(`AlphaVault ${app} jetton wallet`, alphaJettonWallet, masterDerivedAlphaWallet);
    if (manifestJettonWalletAddress) {
      assertAddress(`Manifest AlphaVault ${app} jetton wallet`, alphaJettonWallet, manifestJettonWalletAddress);
    }
    assertBigint(`AlphaVault ${app} appId`, await withRpcRetry(`AlphaVault ${app} appId`, () => alphaVault.getGetAppId()), appId);
    assertBigint(`AlphaVault ${app} seat cap`, await withRpcRetry(`AlphaVault ${app} seat cap`, () => alphaVault.getGetSeatCap()), 9n);
    assertBigint(
      `AlphaVault ${app} threshold`,
      await withRpcRetry(`AlphaVault ${app} threshold`, () => alphaVault.getGetThreshold72H()),
      app === 'multi-millionaire' ? 720_000_000_000_000n : 72_000_000_000_000n,
    );
    assertBigint(`AlphaVault ${app} duration`, await withRpcRetry(`AlphaVault ${app} duration`, () => alphaVault.getGetCycleDurationSeconds()), 43_545_600n);
    assertBigint(`AlphaVault ${app} settlement`, await withRpcRetry(`AlphaVault ${app} settlement`, () => alphaVault.getGetSettlementIntervalSeconds()), 4_233_600n);
    assertBigint('AlphaVault next seat', await withRpcRetry(`AlphaVault ${app} next seat`, () => alphaVault.getGetNextSeatNumber()), 1n);
    assertBigintAtLeast(`AlphaVault ${app} total principal`, await withRpcRetry(`AlphaVault ${app} total principal`, () => alphaVault.getGetTotalPrincipal72H()), 0n);
    console.log(`Verified AlphaVault ${app}: ${formatAddress(alphaVaultAddress)}`);
  }
}

console.log('Testnet verification passed.');
