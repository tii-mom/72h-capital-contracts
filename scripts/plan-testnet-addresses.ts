import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';
import type { CapitalAppSlug } from '../src/types/domain.js';

type GeneratedContractClass = {
  fromInit: (...args: unknown[]) => Promise<{ address: Address }>;
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

function parseAddressEnv(name: string) {
  const value = optionalEnv(name);
  return value ? Address.parse(value) : undefined;
}

function maskAddress(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

async function loadGeneratedContract<TContract extends GeneratedContractClass>(
  relativePath: string,
  exportName: string,
) {
  const absolutePath = resolve(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing generated wrapper ${relativePath}. Run npm run tact:build first.`);
  }

  const module = await import(pathToFileURL(absolutePath).href) as Record<string, unknown>;
  const contract = module[exportName] as TContract | undefined;
  if (!contract?.fromInit) {
    throw new Error(`Generated wrapper ${relativePath} does not export ${exportName}.`);
  }

  return contract;
}

loadLocalEnv();

const mnemonic = requireEnv('TON_TESTNET_DEPLOYER_MNEMONIC').split(/\s+/).filter(Boolean);
const configuredAddress = Address.parse(requireEnv('TON_TESTNET_DEPLOYER_ADDRESS'));
const keyPair = await mnemonicToPrivateKey(mnemonic);
const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
const adminSigner = configuredAddress;
const adminSignerSource = 'single-admin deployer address';

const AdminMultisig = await loadGeneratedContract<GeneratedContractClass>(
  'build/tact/AdminMultisig/AdminMultisig_AdminMultisig.ts',
  'AdminMultisig',
);
const CapitalRegistry = await loadGeneratedContract<GeneratedContractClass>(
  'build/tact/CapitalRegistry/CapitalRegistry_CapitalRegistry.ts',
  'CapitalRegistry',
);
const ReserveVault = await loadGeneratedContract<GeneratedContractClass>(
  'build/tact/ReserveVault/ReserveVault_ReserveVault.ts',
  'ReserveVault',
);
const TestJetton72H = await loadGeneratedContract<GeneratedContractClass>(
  'build/tact/TestJetton72H/TestJetton72H_TestJetton72H.ts',
  'TestJetton72H',
);
const TestJetton72HWallet = await loadGeneratedContract<GeneratedContractClass>(
  'build/tact/TestJetton72H/TestJetton72H_TestJetton72HWallet.ts',
  'TestJetton72HWallet',
);
const Treasury = await loadGeneratedContract<GeneratedContractClass>(
  'build/tact/Treasury/Treasury_Treasury.ts',
  'Treasury',
);
const AlphaVault = await loadGeneratedContract<GeneratedContractClass>(
  'build/tact/AlphaVault/AlphaVault_AlphaVault.ts',
  'AlphaVault',
);

const adminAuthority = await AdminMultisig.fromInit(adminSigner);
const testJetton = await TestJetton72H.fromInit(configuredAddress);
const capitalRegistry = await CapitalRegistry.fromInit(configuredAddress);
const treasury = await Treasury.fromInit(configuredAddress);
const reserveVaults = await Promise.all(
  CAPITAL_APPS.map(async (app) => {
    const vault = await ReserveVault.fromInit(
      configuredAddress,
      capitalRegistry.address,
      testJetton.address,
      configuredAddress,
      CAPITAL_APP_IDS[app],
    );
    const jettonWallet = await TestJetton72HWallet.fromInit(testJetton.address, vault.address);
    return {
      app,
      address: vault.address,
      jettonWalletAddress: jettonWallet.address,
    };
  }),
);
const alphaVaults = await Promise.all(
  CAPITAL_APPS.map(async (app) => {
    const vault = await AlphaVault.fromInit(configuredAddress, treasury.address, testJetton.address, CAPITAL_APP_IDS[app]);
    const jettonWallet = await TestJetton72HWallet.fromInit(testJetton.address, vault.address);
    return {
      app,
      address: vault.address,
      jettonWalletAddress: jettonWallet.address,
    };
  }),
);

console.log('72H Capital testnet deterministic address plan');
console.log(`Configured deployer: ${maskAddress(configuredAddress.toString({ testOnly: true }))}`);
console.log(`Derived Wallet V4:   ${maskAddress(wallet.address.toString({ testOnly: true }))}`);
console.log(
  `Wallet check:       ${wallet.address.equals(configuredAddress) ? 'matches configured address' : 'configured address differs from derived Wallet V4'}`,
);
console.log(`Admin signer source: ${adminSignerSource}`);
console.log('');
console.log('Predicted contracts');
console.log(`AdminAuthority:      ${adminAuthority.address.toString({ testOnly: true })}`);
console.log(`TestJetton72H:       ${testJetton.address.toString({ testOnly: true })}`);
console.log(`CapitalRegistry:     ${capitalRegistry.address.toString({ testOnly: true })}`);
console.log(`Treasury:            ${treasury.address.toString({ testOnly: true })}`);
for (const vault of reserveVaults) {
  console.log(`ReserveVault ${vault.app}: ${vault.address.toString({ testOnly: true })}`);
  console.log(`ReserveVault ${vault.app} JettonWallet: ${vault.jettonWalletAddress.toString({ testOnly: true })}`);
}
for (const vault of alphaVaults) {
  console.log(`AlphaVault ${vault.app}: ${vault.address.toString({ testOnly: true })}`);
  console.log(`AlphaVault ${vault.app} JettonWallet: ${vault.jettonWalletAddress.toString({ testOnly: true })}`);
}
console.log('');
console.log('API env after ReserveVault deployment');
console.log(`H72H_TESTNET_ADMIN_AUTHORITY_ADDRESS="${adminAuthority.address.toString({ testOnly: true })}"`);
console.log(`H72H_TESTNET_TREASURY_ADDRESS="${treasury.address.toString({ testOnly: true })}"`);
console.log(`H72H_TESTNET_72H_JETTON_MASTER_ADDRESS="${testJetton.address.toString({ testOnly: true })}"`);
for (const vault of reserveVaults) {
  const envName = `H72H_TESTNET_RESERVE_VAULT_${vault.app.toUpperCase().replaceAll('-', '_')}_ADDRESS`;
  console.log(`${envName}="${vault.address.toString({ testOnly: true })}"`);
}
for (const vault of alphaVaults) {
  const envName = `H72H_TESTNET_ALPHA_VAULT_${vault.app.toUpperCase().replaceAll('-', '_')}_ADDRESS`;
  console.log(`${envName}="${vault.address.toString({ testOnly: true })}"`);
}
