import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NETWORKS } from '../src/config/networks.js';
import { CAPITAL_APP_SLUGS } from '../src/config/capital.constants.js';

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

function maskValue(value: string | undefined) {
  if (!value) {
    return 'missing';
  }

  if (value.length <= 12) {
    return 'configured';
  }

  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function secretStatus(value: string | undefined) {
  return value ? 'configured (hidden)' : 'missing';
}

function getMnemonicWordCount(value: string | undefined) {
  return value?.trim().split(/\s+/).filter(Boolean).length ?? 0;
}

function pushMissing(missing: string[], label: string, value: string | undefined) {
  if (!value?.trim()) {
    missing.push(label);
  }
}

const loadedEnvFiles = loadLocalEnv();
const network = process.argv[2] as keyof typeof NETWORKS | undefined;

if (!network || !(network in NETWORKS)) {
  console.error('Usage: npm run plan:testnet | npm run plan:mainnet');
  process.exit(1);
}

const config = NETWORKS[network];
const mnemonic = process.env[config.deployerMnemonicEnv];
const jettonMode = config.jetton.modeEnv ? process.env[config.jetton.modeEnv]?.trim() : undefined;
const jettonMasterAddress = process.env[config.jetton.masterAddressEnv]?.trim();
const usingTestnetMockJetton = config.network === 'testnet' && config.jetton.testnetMockAllowed && jettonMode === 'mock';
const missingRequired: string[] = [];

pushMissing(missingRequired, config.rpcUrlEnv, process.env[config.rpcUrlEnv]);
pushMissing(missingRequired, config.deployerAddressEnv, process.env[config.deployerAddressEnv]);
pushMissing(missingRequired, config.deployerMnemonicEnv, mnemonic);
if (config.jetton.mainnetMasterRequired) {
  pushMissing(missingRequired, config.jetton.masterAddressEnv, jettonMasterAddress);
}
if (config.network === 'testnet' && !usingTestnetMockJetton) {
  pushMissing(missingRequired, config.jetton.masterAddressEnv, jettonMasterAddress);
}

console.log(`72H Capital deployment plan for ${config.network}`);
console.log(`Loaded env files: ${loadedEnvFiles.length > 0 ? loadedEnvFiles.join(', ') : 'none'}`);
console.log(`RPC URL env: ${config.rpcUrlEnv}`);
console.log(`RPC URL: ${maskValue(process.env[config.rpcUrlEnv])}`);
console.log(`Deployer address env: ${config.deployerAddressEnv}`);
console.log(`Deployer address: ${maskValue(process.env[config.deployerAddressEnv])}`);
console.log(`Mnemonic env: ${config.deployerMnemonicEnv}`);
console.log(`Mnemonic: ${secretStatus(mnemonic)} (${getMnemonicWordCount(mnemonic)} words)`);
console.log(`72H Jetton master env: ${config.jetton.masterAddressEnv}`);
console.log(`72H Jetton master: ${maskValue(jettonMasterAddress)}`);
if (config.jetton.modeEnv) {
  console.log(`72H Jetton mode env: ${config.jetton.modeEnv}`);
  console.log(`72H Jetton mode: ${jettonMode || 'missing'}`);
}
if (usingTestnetMockJetton) {
  console.log('Testnet 72H Jetton: mock placeholder enabled; deploy/use a test-only 72H Jetton before live test flows.');
}
if (config.jetton.mainnetMasterRequired && !jettonMasterAddress) {
  console.log('Mainnet readiness: blocked until the official 72H Jetton master address is configured.');
}
console.log(`Readiness: ${missingRequired.length === 0 ? 'ready for planning' : 'blocked'}`);
if (missingRequired.length > 0) {
  console.log(`Missing required env: ${missingRequired.join(', ')}`);
}
console.log('');
console.log('Deployment phases:');
let phase = 1;
if (usingTestnetMockJetton) {
  console.log(`${phase}. Deploy or attach the 72H Test Jetton placeholder for testnet-only flows.`);
  phase += 1;
}
console.log(`${phase}. Deploy AdminAuthority and capture the governed signer.`);
phase += 1;
console.log(`${phase}. Deploy CapitalRegistry and register each application binding.`);
phase += 1;
console.log(`${phase}. Bind vault and reward-pool metadata per application.`);
phase += 1;
console.log(`${phase}. Deploy AppRewardPool instances and wire app reward bindings.`);
phase += 1;
for (const app of CAPITAL_APP_SLUGS) {
  console.log(`${phase}. Deploy ReserveVault for ${app} and bind it in the registry.`);
  phase += 1;
}
for (const app of CAPITAL_APP_SLUGS) {
  console.log(`${phase}. Deploy AlphaVault for ${app} and bind it in the registry.`);
  phase += 1;
}

console.log('');
console.log('Post-deploy registry steps:');
for (const app of CAPITAL_APP_SLUGS) {
  console.log(`- registerApp(${app})`);
  console.log(`- bindVaults(${app}, reserveVault, alphaVault, appRewardPool, adminAuthority)`);
}

console.log('');
console.log('Current configured addresses:');
console.log(JSON.stringify(config.contracts, null, 2));
