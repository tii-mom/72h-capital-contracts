import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, beginCell, storeStateInit, toNano, type Cell } from '@ton/core';
import { compileJettonV2, JettonWalletV2 } from '../src/jetton-v2/index.js';

const OFFICIAL_V3_MASTER = 'EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3';

type GeneratedContract = {
  readonly address: Address;
  readonly init?: { readonly code: Cell; readonly data: Cell };
};

type GeneratedContractClass = {
  fromInit(owner: Address, jettonMaster: Address, vaultJettonWallet: Address): Promise<GeneratedContract>;
};

type V3PostDeployEvidence = {
  readonly network?: string;
  readonly adminWallet?: string;
  readonly jettonMaster?: { readonly address?: string };
};

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
  return process.env[name]?.trim() || undefined;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as T;
}

async function loadDepositVaultClass() {
  const path = resolve(process.cwd(), 'build/tact/MultiMillionaireDepositVault/MultiMillionaireDepositVault_MultiMillionaireDepositVault.ts');
  if (!existsSync(path)) {
    throw new Error('Missing generated MultiMillionaireDepositVault wrapper. Run npm run tact:build first.');
  }
  const module = (await import(pathToFileURL(path).href)) as { MultiMillionaireDepositVault?: GeneratedContractClass };
  if (!module.MultiMillionaireDepositVault?.fromInit) {
    throw new Error('Generated MultiMillionaireDepositVault wrapper does not export fromInit.');
  }
  return module.MultiMillionaireDepositVault;
}

function formatAddress(address: Address) {
  return address.toString({ testOnly: false });
}

function stateInitBase64(contract: GeneratedContract) {
  if (!contract.init) throw new Error(`Missing StateInit for ${formatAddress(contract.address)}.`);
  return beginCell().store(storeStateInit(contract.init)).endCell().toBoc().toString('base64');
}

function rejectTestnetAddress(label: string, raw: string) {
  if (/^(kQ|0Q)/.test(raw)) {
    throw new Error(`${label} looks like a testnet user-friendly address. Mainnet plan requires mainnet addresses only.`);
  }
}

const loadedEnvFiles = loadLocalEnv();
const chainId = optionalEnv('CHAIN_ID') ?? 'ton-mainnet';
if (chainId !== 'ton-mainnet') {
  throw new Error(`CHAIN_ID must be ton-mainnet for mainnet DepositVault planning. got=${chainId}`);
}

const evidence = readJson<V3PostDeployEvidence>('deployments/v3-mainnet/72h-v3-mainnet.postdeploy.latest.json');
if (evidence.network !== 'mainnet' || !evidence.jettonMaster?.address || !evidence.adminWallet) {
  throw new Error('Missing usable V3 mainnet postdeploy evidence with adminWallet and jettonMaster.address.');
}
if (evidence.jettonMaster.address !== OFFICIAL_V3_MASTER) {
  throw new Error(`V3 postdeploy evidence Jetton master must be ${OFFICIAL_V3_MASTER}. got=${evidence.jettonMaster.address}`);
}

for (const envName of ['TON_MAINNET_72H_V3_JETTON_MASTER_ADDRESS', 'TON_MAINNET_72H_JETTON_MASTER_ADDRESS']) {
  const value = optionalEnv(envName);
  if (value && value !== OFFICIAL_V3_MASTER) {
    throw new Error(`${envName} must be the official V3 master ${OFFICIAL_V3_MASTER}. got=${value}`);
  }
}

const ownerRaw = optionalEnv('TON_MAINNET_MULTI_MILLIONAIRE_DEPOSIT_VAULT_OWNER_ADDRESS') ?? evidence.adminWallet;
const operatorRaw = optionalEnv('TON_MAINNET_OPERATOR_ADDRESS') ?? evidence.adminWallet;
const jettonMasterRaw =
  optionalEnv('TON_MAINNET_72H_V3_JETTON_MASTER_ADDRESS')
  ?? optionalEnv('TON_MAINNET_72H_JETTON_MASTER_ADDRESS')
  ?? evidence.jettonMaster.address;
rejectTestnetAddress('owner', ownerRaw);
rejectTestnetAddress('operator', operatorRaw);
rejectTestnetAddress('72H Jetton master', jettonMasterRaw);

const owner = Address.parse(ownerRaw);
const operator = Address.parse(operatorRaw);
if (!operator.equals(owner)) {
  throw new Error(`Operator ${formatAddress(operator)} must match planned DepositVault owner ${formatAddress(owner)} for this preflight.`);
}

const jettonMaster = Address.parse(jettonMasterRaw);
const DepositVault = await loadDepositVaultClass();
const initialVault = await DepositVault.fromInit(owner, jettonMaster, owner);
const compiledJetton = await compileJettonV2();
const vaultJettonWallet = JettonWalletV2.createFromConfig(
  { ownerAddress: initialVault.address, jettonMasterAddress: jettonMaster },
  compiledJetton.wallet.code,
);
const setVaultJettonWalletPayload = beginCell()
  .storeUint(0x720d0001, 32)
  .storeAddress(vaultJettonWallet.address)
  .endCell();

const generatedAt = new Date().toISOString();
const plan = {
  generatedAt,
  network: 'mainnet',
  app: 'multi-millionaire',
  contract: 'MultiMillionaireDepositVault',
  mode: 'dry-run',
  deployable: false,
  loadedEnvFiles,
  source: 'contracts/apps/multi-millionaire/v3/MultiMillionaireDepositVault.tact',
  owner: formatAddress(owner),
  operator: formatAddress(operator),
  jettonMaster: formatAddress(jettonMaster),
  addresses: {
    depositVaultInitialAddress: formatAddress(initialVault.address),
    vaultJettonWallet: formatAddress(vaultJettonWallet.address),
  },
  messages: {
    deployDepositVault: {
      to: formatAddress(initialVault.address),
      valueNano: toNano('0.1').toString(),
      stateInit: stateInitBase64(initialVault),
      payload: null,
      send: false,
    },
    setDepositVaultJettonWallet: {
      to: formatAddress(initialVault.address),
      valueNano: toNano('0.05').toString(),
      payload: setVaultJettonWalletPayload.toBoc({ idx: false }).toString('base64'),
      send: false,
    },
  },
  canary: {
    maxAmountRaw: optionalEnv('TON_MAINNET_MULTI_MILLIONAIRE_CANARY_MAX_AMOUNT_RAW') ?? null,
    window: optionalEnv('TON_MAINNET_MULTI_MILLIONAIRE_CANARY_WINDOW') ?? null,
    allowlist: optionalEnv('TON_MAINNET_MULTI_MILLIONAIRE_CANARY_ALLOWLIST') ?? null,
  },
  rollback: {
    pauseDeposits: 'Keep CHAIN_MAINLINE_WRITES_ENABLED=false; app production writes remain disabled until separately approved.',
    contractPause: 'No production pause transaction is generated by this plan.',
  },
  approvals: {
    externalAuditRequired: true,
    externalAuditApproved: optionalEnv('CONTRACTS_EXTERNAL_AUDIT_APPROVED') === 'true',
    operatorApprovalRequired: true,
    operatorApprovalRecord: optionalEnv('TON_MAINNET_MULTI_MILLIONAIRE_OPERATOR_APPROVAL_RECORD') ?? null,
  },
  gates: {
    CHAIN_ID: chainId,
    operatorMatchesOwner: true,
    officialV3Master: OFFICIAL_V3_MASTER,
    jettonMasterIsOfficialV3: formatAddress(jettonMaster) === OFFICIAL_V3_MASTER,
    MAINNET_DEPLOYMENT_EVIDENCE_RECORDED: false,
    CHAIN_MAINLINE_WRITES_ENABLED: false,
    deployable: false,
  },
  nextRequiredEvidence: [
    'external audit or operator security review covering MultiMillionaireDepositVault',
    'testnet DepositVault canary evidence with active vault Jetton wallet and userState update',
    'backend receipt apply evidence against the same testnet canary receipt',
    'named mainnet canary window, amount cap, operator, and rollback owner',
  ],
};

const directory = resolve(process.cwd(), 'deployments');
mkdirSync(directory, { recursive: true });
const outputPath = resolve(directory, 'multi-millionaire-deposit-vault.mainnet.plan.json');
writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({ status: 'pass', plan: outputPath, deployable: false }, null, 2));
