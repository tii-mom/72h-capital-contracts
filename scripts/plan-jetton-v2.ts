import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Address, beginCell, storeStateInit, toNano } from '@ton/core';
import {
  compileJettonV2,
  H72H_V2_METADATA_URI_PLACEHOLDER,
  H72H_V2_TOTAL_SUPPLY,
  JettonMinterV2,
} from '../src/jetton-v2/index.js';

type PlanNetwork = 'testnet' | 'mainnet';

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

function networkAdminEnv(network: PlanNetwork) {
  return network === 'testnet' ? 'TON_TESTNET_DEPLOYER_ADDRESS' : 'TON_MAINNET_DEPLOYER_ADDRESS';
}

function toStateInitBase64(contract: JettonMinterV2) {
  if (!contract.init) throw new Error('Missing V2 minter StateInit.');
  return beginCell().store(storeStateInit(contract.init)).endCell().toBoc().toString('base64');
}

const network = process.argv[2] as PlanNetwork | undefined;
if (network !== 'testnet' && network !== 'mainnet') {
  console.error('Usage: tsx scripts/plan-jetton-v2.ts <testnet|mainnet>');
  process.exit(1);
}

const loadedEnvFiles = loadLocalEnv();
const metadataUri = optionalEnv('TON_V2_METADATA_URI') ?? H72H_V2_METADATA_URI_PLACEHOLDER;
if (network === 'mainnet' && metadataUri === H72H_V2_METADATA_URI_PLACEHOLDER) {
  throw new Error('TON_V2_METADATA_URI must be finalized before mainnet V2 planning.');
}

const admin = Address.parse(optionalEnv('TON_V2_ADMIN_ADDRESS') ?? requireEnv(networkAdminEnv(network)));
const initialSupplyOwner = Address.parse(optionalEnv('TON_V2_INITIAL_SUPPLY_OWNER_ADDRESS') ?? admin.toString());
const workchain = Number(optionalEnv('TON_V2_WORKCHAIN') ?? '0');

const compiled = await compileJettonV2();
const minter = JettonMinterV2.createFromConfig(
  {
    admin,
    walletCode: compiled.wallet.code,
    metadataUri,
  },
  compiled.minter.code,
  workchain,
);

const mintBody = JettonMinterV2.mintMessage({
  to: initialSupplyOwner,
  jettonAmount: H72H_V2_TOTAL_SUPPLY,
  from: admin,
  responseAddress: admin,
  totalTonAmount: toNano('0.3'),
});
const dropAdminBody = JettonMinterV2.dropAdminMessage();
const deployBody = JettonMinterV2.topUpMessage();

const plan = {
  generatedAt: new Date().toISOString(),
  network,
  loadedEnvFiles,
  source: {
    upstream: 'https://github.com/ton-blockchain/jetton-contract',
    localDirectory: 'contracts/jetton-v2',
  },
  compiler: {
    package: '@ton-community/func-js',
    funcVersion: compiled.funcVersion,
  },
  token: {
    name: '72H',
    symbol: '72H',
    decimals: 9,
    totalSupplyRaw: H72H_V2_TOTAL_SUPPLY.toString(),
    metadataUri,
  },
  addresses: {
    admin: admin.toString({ testOnly: network === 'testnet' }),
    initialSupplyOwner: initialSupplyOwner.toString({ testOnly: network === 'testnet' }),
    jettonMinter: minter.address.toString({ testOnly: network === 'testnet' }),
  },
  codeHashes: {
    minterHex: compiled.minter.codeHashHex,
    minterBase64: compiled.minter.codeHashBase64,
    walletHex: compiled.wallet.codeHashHex,
    walletBase64: compiled.wallet.codeHashBase64,
  },
  messages: {
    deploy: {
      to: minter.address.toString({ testOnly: network === 'testnet' }),
      valueNano: toNano('0.05').toString(),
      stateInit: toStateInitBase64(minter),
      payload: deployBody.toBoc().toString('base64'),
    },
    mintTotalSupply: {
      to: minter.address.toString({ testOnly: network === 'testnet' }),
      valueNano: toNano('0.35').toString(),
      payload: mintBody.toBoc().toString('base64'),
    },
    dropAdmin: {
      to: minter.address.toString({ testOnly: network === 'testnet' }),
      valueNano: toNano('0.05').toString(),
      payload: dropAdminBody.toBoc().toString('base64'),
    },
  },
  expectedFinalGetter: {
    totalSupplyRaw: H72H_V2_TOTAL_SUPPLY.toString(),
    mintable: false,
    adminAddress: null,
    walletCodeHashHex: compiled.wallet.codeHashHex,
  },
};

const outputDir = resolve(process.cwd(), 'deployments');
mkdirSync(outputDir, { recursive: true });
const outputPath = resolve(outputDir, `jetton-v2.${network}.plan.json`);
writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);

console.log(`72H V2 ${network} deployment plan generated.`);
console.log(`V2 Jetton master: ${plan.addresses.jettonMinter}`);
console.log(`Minter code hash: ${compiled.minter.codeHashHex}`);
console.log(`Wallet code hash: ${compiled.wallet.codeHashHex}`);
console.log(`Plan: ${outputPath}`);
