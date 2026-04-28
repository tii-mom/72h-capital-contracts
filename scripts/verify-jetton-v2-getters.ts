import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Address } from '@ton/core';
import { TonClient } from '@ton/ton';
import {
  compileJettonV2,
  H72H_V2_TOTAL_SUPPLY,
  JettonMinterV2,
} from '../src/jetton-v2/index.js';

type VerifyNetwork = 'testnet' | 'mainnet';

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

function networkRpcEnv(network: VerifyNetwork) {
  return network === 'testnet' ? 'TON_TESTNET_RPC_URL' : 'TON_MAINNET_RPC_URL';
}

function networkMasterEnv(network: VerifyNetwork) {
  return network === 'testnet' ? 'TON_TESTNET_72H_V2_JETTON_MASTER_ADDRESS' : 'TON_MAINNET_72H_V2_JETTON_MASTER_ADDRESS';
}

const network = process.argv[2] as VerifyNetwork | undefined;
if (network !== 'testnet' && network !== 'mainnet') {
  console.error('Usage: tsx scripts/verify-jetton-v2-getters.ts <testnet|mainnet> [--expect-final]');
  process.exit(1);
}

const expectFinal = process.argv.includes('--expect-final');
const loadedEnvFiles = loadLocalEnv();
const endpoint = requireEnv(networkRpcEnv(network));
const masterAddress = Address.parse(optionalEnv('TON_V2_JETTON_MASTER_ADDRESS') ?? requireEnv(networkMasterEnv(network)));
const client = new TonClient({ endpoint });
const compiled = await compileJettonV2();
const minter = client.open(JettonMinterV2.createFromAddress(masterAddress));
const data = await minter.getJettonData();
const walletCodeHashHex = data.walletCode.hash().toString('hex');

const result = {
  checkedAt: new Date().toISOString(),
  network,
  loadedEnvFiles,
  master: masterAddress.toString({ testOnly: network === 'testnet' }),
  getter: {
    totalSupplyRaw: data.totalSupply.toString(),
    mintable: data.mintable,
    adminAddress: data.adminAddress?.toString({ testOnly: network === 'testnet' }) ?? null,
    walletCodeHashHex,
  },
  expected: {
    totalSupplyRaw: H72H_V2_TOTAL_SUPPLY.toString(),
    mintable: false,
    adminAddress: null,
    walletCodeHashHex: compiled.wallet.codeHashHex,
  },
};

if (expectFinal) {
  const failures: string[] = [];
  if (result.getter.totalSupplyRaw !== result.expected.totalSupplyRaw) {
    failures.push(`totalSupplyRaw expected ${result.expected.totalSupplyRaw}, got ${result.getter.totalSupplyRaw}`);
  }
  if (result.getter.mintable !== false) {
    failures.push(`mintable expected false, got ${String(result.getter.mintable)}`);
  }
  if (result.getter.adminAddress !== null) {
    failures.push(`adminAddress expected null, got ${result.getter.adminAddress}`);
  }
  if (result.getter.walletCodeHashHex !== result.expected.walletCodeHashHex) {
    failures.push(`walletCodeHashHex expected ${result.expected.walletCodeHashHex}, got ${result.getter.walletCodeHashHex}`);
  }
  if (failures.length > 0) {
    console.error(JSON.stringify(result, null, 2));
    throw new Error(`V2 final getter verification failed: ${failures.join('; ')}`);
  }
}

console.log(JSON.stringify(result, null, 2));
