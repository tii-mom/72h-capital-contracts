import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, beginCell, storeStateInit, toNano, type Cell, type Contract } from '@ton/core';
import {
  createBindReserveVaultMessageCell,
  createRegisterAppMessageCell,
} from '../src/encoding/tactMessageCells.js';
import type { CapitalAppSlug } from '../src/types/domain.js';

type GeneratedContractInstance = Contract & {
  readonly address: Address;
  readonly init?: { readonly code: Cell; readonly data: Cell };
};

type GeneratedContractClass<TArgs extends readonly unknown[]> = {
  fromInit: (...args: TArgs) => Promise<GeneratedContractInstance>;
};

type TonConnectMessage = {
  address: string;
  amount: string;
  stateInit?: string;
  payload?: string;
};

const CAPITAL_APPS: readonly CapitalAppSlug[] = ['72hours', 'wan', 'multi-millionaire'];
const CAPITAL_APP_IDS: Readonly<Record<CapitalAppSlug, bigint>> = {
  '72hours': 1n,
  wan: 2n,
  'multi-millionaire': 3n,
};
const APPROVED_72H_JETTON_MASTER = 'EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg';
// Deprecated / not active V2: EQDvE0ffdwvOhILjRJKFd2bIU9t5H9bG3-SKRidqavZjRsw8
const DEPLOY_VALUE = toNano('0.05').toString();
const REGISTRY_MESSAGE_VALUE = toNano('0.03').toString();

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

function formatAddress(address: Address) {
  return address.toString({ testOnly: false });
}

function stateInitBase64(contract: GeneratedContractInstance) {
  if (!contract.init) throw new Error(`Missing StateInit for ${formatAddress(contract.address)}.`);
  return beginCell().store(storeStateInit(contract.init)).endCell().toBoc().toString('base64');
}

function codeHashHex(contract: GeneratedContractInstance) {
  if (!contract.init) throw new Error(`Missing StateInit for ${formatAddress(contract.address)}.`);
  return contract.init.code.hash().toString('hex');
}

function dataHashHex(contract: GeneratedContractInstance) {
  if (!contract.init) throw new Error(`Missing StateInit for ${formatAddress(contract.address)}.`);
  return contract.init.data.hash().toString('hex');
}

function payloadBase64(cell: Cell) {
  return cell.toBoc().toString('base64');
}

function deployMessage(contract: GeneratedContractInstance): TonConnectMessage {
  return {
    address: formatAddress(contract.address),
    amount: DEPLOY_VALUE,
    stateInit: stateInitBase64(contract),
  };
}

function writeDeployHtml(input: {
  readonly path: string;
  readonly expectedWallet: string;
  readonly transactions: readonly { readonly id: string; readonly label: string; readonly request: unknown }[];
}) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>72H Capital Mainnet Deploy</title>
  <script src="https://unpkg.com/@tonconnect/ui@latest/dist/tonconnect-ui.min.js"></script>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #10100e; color: #f4ead3; }
    main { max-width: 900px; margin: 0 auto; padding: 32px 20px; }
    section { border: 1px solid rgba(244,234,211,.18); border-radius: 18px; padding: 20px; margin: 16px 0; background: rgba(255,255,255,.04); }
    button { border: 0; border-radius: 999px; padding: 11px 16px; background: #d7a84f; color: #15120a; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    code { color: #ffe0a3; overflow-wrap: anywhere; }
    .muted { color: rgba(244,234,211,.7); }
  </style>
</head>
<body>
  <main>
    <h1>72H Capital Mainnet Deploy</h1>
    <p class="muted">Connect only the administrator wallet. Each batch requires a wallet confirmation.</p>
    <p>Expected admin wallet: <code>${input.expectedWallet}</code></p>
    <div id="ton-connect"></div>
    <section>
      <h2>Deploy Batches</h2>
      <div id="batches"></div>
    </section>
    <pre id="log" class="muted"></pre>
  </main>
  <script>
    const expectedWallet = ${JSON.stringify(input.expectedWallet)};
    const transactions = ${JSON.stringify(input.transactions)};
    const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: 'https://72h.lol/tonconnect-manifest.json',
      buttonRootId: 'ton-connect'
    });
    const log = document.getElementById('log');
    function write(message) { log.textContent += message + '\\n'; }
    const batches = document.getElementById('batches');
    for (const tx of transactions) {
      const section = document.createElement('section');
      const title = document.createElement('h3');
      title.textContent = tx.label;
      const meta = document.createElement('p');
      meta.className = 'muted';
      meta.textContent = tx.request.messages.length + ' message(s)';
      const button = document.createElement('button');
      button.textContent = 'Send batch to wallet';
      button.onclick = async () => {
        button.disabled = true;
        try {
          const wallet = tonConnectUI.wallet;
          if (!wallet) throw new Error('Connect wallet first.');
          write('Sending ' + tx.label + ' ...');
          const result = await tonConnectUI.sendTransaction(tx.request);
          write('Submitted ' + tx.id + ': ' + JSON.stringify(result));
        } catch (error) {
          write('Failed ' + tx.id + ': ' + (error && error.message ? error.message : String(error)));
          button.disabled = false;
        }
      };
      section.append(title, meta, button);
      batches.append(section);
    }
  </script>
</body>
</html>`;
  writeFileSync(input.path, html);
}

const loadedEnvFiles = loadLocalEnv();
const adminAddress = Address.parse(requireEnv('TON_MAINNET_ADMIN_ADDRESS'));
const jettonMaster = Address.parse(requireEnv('TON_MAINNET_72H_JETTON_MASTER_ADDRESS'));
if (formatAddress(jettonMaster) !== APPROVED_72H_JETTON_MASTER) {
  throw new Error(`TON_MAINNET_72H_JETTON_MASTER_ADDRESS must be ${APPROVED_72H_JETTON_MASTER}.`);
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
const AppRewardPool = await loadGeneratedContract<[Address, Address, Address, Address, bigint]>(
  'build/tact/AppRewardPool/AppRewardPool_AppRewardPool.ts',
  'AppRewardPool',
);
const AlphaVault = await loadGeneratedContract<[Address, Address, Address, bigint]>(
  'build/tact/AlphaVault/AlphaVault_AlphaVault.ts',
  'AlphaVault',
);

const adminAuthority = await AdminMultisig.fromInit(adminAddress);
const capitalRegistry = await CapitalRegistry.fromInit(adminAddress);
const rewardPools = await Promise.all(
  CAPITAL_APPS.map(async (app) => ({
    app,
    appId: CAPITAL_APP_IDS[app],
    contract: await AppRewardPool.fromInit(adminAddress, capitalRegistry.address, jettonMaster, adminAddress, CAPITAL_APP_IDS[app]),
  })),
);
const reserveVaults = await Promise.all(
  CAPITAL_APPS.map(async (app) => ({
    app,
    appId: CAPITAL_APP_IDS[app],
    contract: await ReserveVault.fromInit(adminAddress, capitalRegistry.address, jettonMaster, adminAddress, CAPITAL_APP_IDS[app]),
  })),
);
const alphaVaults = await Promise.all(
  CAPITAL_APPS.map(async (app) => ({
    app,
    appId: CAPITAL_APP_IDS[app],
    contract: await AlphaVault.fromInit(
      adminAddress,
      rewardPools.find((pool) => pool.app === app)!.contract.address,
      jettonMaster,
      CAPITAL_APP_IDS[app],
    ),
  })),
);

const now = Math.floor(Date.now() / 1000);
const batches = [
  {
    id: 'deploy-core',
    label: 'Deploy core: AdminAuthority, CapitalRegistry',
    request: {
      validUntil: now + 30 * 60,
      network: '-239',
      messages: [deployMessage(adminAuthority), deployMessage(capitalRegistry)],
    },
  },
  {
    id: 'deploy-app-reward-pools',
    label: 'Deploy AppRewardPools',
    request: {
      validUntil: now + 30 * 60,
      network: '-239',
      messages: rewardPools.map((pool) => deployMessage(pool.contract)),
    },
  },
  {
    id: 'deploy-reserve-vaults',
    label: 'Deploy ReserveVaults',
    request: {
      validUntil: now + 30 * 60,
      network: '-239',
      messages: reserveVaults.map((vault) => deployMessage(vault.contract)),
    },
  },
  {
    id: 'deploy-alpha-vaults',
    label: 'Deploy AlphaVaults',
    request: {
      validUntil: now + 30 * 60,
      network: '-239',
      messages: alphaVaults.map((vault) => deployMessage(vault.contract)),
    },
  },
  {
    id: 'registry-register-apps',
    label: 'Registry: register first-batch apps',
    request: {
      validUntil: now + 30 * 60,
      network: '-239',
      messages: reserveVaults.map((vault) => ({
        address: formatAddress(capitalRegistry.address),
        amount: REGISTRY_MESSAGE_VALUE,
        payload: payloadBase64(createRegisterAppMessageCell(vault.app).body),
      })),
    },
  },
  {
    id: 'registry-bind-reserve-vaults',
    label: 'Registry: bind ReserveVaults',
    request: {
      validUntil: now + 30 * 60,
      network: '-239',
      messages: reserveVaults.map((vault) => ({
        address: formatAddress(capitalRegistry.address),
        amount: REGISTRY_MESSAGE_VALUE,
        payload: payloadBase64(createBindReserveVaultMessageCell({ app: vault.app, vault: vault.contract.address }).body),
      })),
    },
  },
];

const apiEnv = {
  H72H_CAPITAL_NETWORK_MODE: 'mainnet',
  H72H_ENABLE_MAINNET_TACT_MESSAGES: 'false',
  H72H_MAINNET_72H_JETTON_MASTER_ADDRESS: formatAddress(jettonMaster),
  H72H_MAINNET_ADMIN_MULTISIG_ADDRESS: formatAddress(adminAuthority.address),
  H72H_MAINNET_APP_REWARD_POOL_72HOURS_ADDRESS: formatAddress(rewardPools.find((pool) => pool.app === '72hours')!.contract.address),
  H72H_MAINNET_APP_REWARD_POOL_WAN_ADDRESS: formatAddress(rewardPools.find((pool) => pool.app === 'wan')!.contract.address),
  H72H_MAINNET_APP_REWARD_POOL_MULTI_MILLIONAIRE_ADDRESS: formatAddress(rewardPools.find((pool) => pool.app === 'multi-millionaire')!.contract.address),
  H72H_MAINNET_RESERVE_VAULT_72HOURS_ADDRESS: formatAddress(reserveVaults.find((vault) => vault.app === '72hours')!.contract.address),
  H72H_MAINNET_RESERVE_VAULT_WAN_ADDRESS: formatAddress(reserveVaults.find((vault) => vault.app === 'wan')!.contract.address),
  H72H_MAINNET_RESERVE_VAULT_MULTI_MILLIONAIRE_ADDRESS: formatAddress(reserveVaults.find((vault) => vault.app === 'multi-millionaire')!.contract.address),
  H72H_MAINNET_ALPHA_VAULT_72HOURS_ADDRESS: formatAddress(alphaVaults.find((vault) => vault.app === '72hours')!.contract.address),
  H72H_MAINNET_ALPHA_VAULT_WAN_ADDRESS: formatAddress(alphaVaults.find((vault) => vault.app === 'wan')!.contract.address),
  H72H_MAINNET_ALPHA_VAULT_MULTI_MILLIONAIRE_ADDRESS: formatAddress(alphaVaults.find((vault) => vault.app === 'multi-millionaire')!.contract.address),
};

const productionGateEnv = {
  TON_MAINNET_72H_JETTON_MASTER_ADDRESS: formatAddress(jettonMaster),
  TON_MAINNET_ADMIN_ADDRESS: formatAddress(adminAddress),
  ...Object.fromEntries(
    reserveVaults.flatMap((vault) => {
      const suffix = vault.app.toUpperCase().replace('-', '_');
      return [
        [`TON_MAINNET_RESERVE_VAULT_ADDRESS_${suffix}`, formatAddress(vault.contract.address)],
        [`TON_MAINNET_RESERVE_VAULT_JETTON_WALLET_ADDRESS_${suffix}`, 'REQUIRES_OFFICIAL_JETTON_MASTER_GET_WALLET_ADDRESS_AFTER_DEPLOY'],
      ];
    }),
  ),
  ...Object.fromEntries(
    rewardPools.flatMap((pool) => {
      const suffix = pool.app.toUpperCase().replace('-', '_');
      return [
        [`TON_MAINNET_APP_REWARD_POOL_ADDRESS_${suffix}`, formatAddress(pool.contract.address)],
        [`TON_MAINNET_APP_REWARD_POOL_JETTON_WALLET_ADDRESS_${suffix}`, 'REQUIRES_OFFICIAL_JETTON_MASTER_GET_WALLET_ADDRESS_AFTER_DEPLOY'],
      ];
    }),
  ),
  ...Object.fromEntries(
    alphaVaults.map((vault) => [`TON_MAINNET_ALPHA_VAULT_ADDRESS_${vault.app.toUpperCase().replace('-', '_')}`, formatAddress(vault.contract.address)]),
  ),
};

const contractEvidence = {
  AdminAuthority: {
    address: formatAddress(adminAuthority.address),
    codeHash: codeHashHex(adminAuthority),
    dataHash: dataHashHex(adminAuthority),
    initParams: {
      owner: formatAddress(adminAddress),
    },
  },
  CapitalRegistry: {
    address: formatAddress(capitalRegistry.address),
    codeHash: codeHashHex(capitalRegistry),
    dataHash: dataHashHex(capitalRegistry),
    initParams: {
      owner: formatAddress(adminAddress),
    },
  },
  ReserveVaults: Object.fromEntries(
    reserveVaults.map((vault) => [
      vault.app,
      {
        address: formatAddress(vault.contract.address),
        codeHash: codeHashHex(vault.contract),
        dataHash: dataHashHex(vault.contract),
        initParams: {
          owner: formatAddress(adminAddress),
          registry: formatAddress(capitalRegistry.address),
          jettonMaster: formatAddress(jettonMaster),
          initialJettonWallet: formatAddress(adminAddress),
          appId: vault.appId.toString(),
        },
        postDeployRequiredGetterEvidence: {
          official72hJettonWallet: `Call get_wallet_address(${formatAddress(vault.contract.address)}) on ${formatAddress(jettonMaster)}.`,
          reserveVaultGetterSnapshot: 'Attach owner, registry, app id, jetton master, official vault wallet, pause state, and redemption getter evidence.',
        },
      },
    ]),
  ),
  AppRewardPools: Object.fromEntries(
    rewardPools.map((pool) => [
      pool.app,
      {
        address: formatAddress(pool.contract.address),
        codeHash: codeHashHex(pool.contract),
        dataHash: dataHashHex(pool.contract),
        initParams: {
          owner: formatAddress(adminAddress),
          registry: formatAddress(capitalRegistry.address),
          jettonMaster: formatAddress(jettonMaster),
          initialJettonWallet: formatAddress(adminAddress),
          appId: pool.appId.toString(),
        },
        postDeployRequiredGetterEvidence: {
          official72hJettonWallet: `Call get_wallet_address(${formatAddress(pool.contract.address)}) on ${formatAddress(jettonMaster)}.`,
          appRewardPoolGetterSnapshot: 'Attach owner, registry, app id, jetton master, official pool wallet, total funded, total claimed, available rewards, and pause state.',
        },
      },
    ]),
  ),
  AlphaVaults: Object.fromEntries(
    alphaVaults.map((vault) => [
      vault.app,
      {
        address: formatAddress(vault.contract.address),
        codeHash: codeHashHex(vault.contract),
        dataHash: dataHashHex(vault.contract),
        initParams: {
          owner: formatAddress(adminAddress),
          rewardPool: formatAddress(rewardPools.find((pool) => pool.app === vault.app)!.contract.address),
          jettonMaster: formatAddress(jettonMaster),
          appId: vault.appId.toString(),
        },
      },
    ]),
  ),
};

const manifest = {
  network: 'mainnet',
  createdAt: new Date().toISOString(),
  loadedEnvFiles,
  adminWallet: formatAddress(adminAddress),
  jettonMaster: formatAddress(jettonMaster),
  contracts: {
    AdminAuthority: formatAddress(adminAuthority.address),
    CapitalRegistry: formatAddress(capitalRegistry.address),
    AppRewardPools: Object.fromEntries(rewardPools.map((pool) => [pool.app, formatAddress(pool.contract.address)])),
    ReserveVaults: Object.fromEntries(reserveVaults.map((vault) => [vault.app, formatAddress(vault.contract.address)])),
    AlphaVaults: Object.fromEntries(alphaVaults.map((vault) => [vault.app, formatAddress(vault.contract.address)])),
  },
  contractEvidence,
  apiEnv,
  productionGateEnv,
  postDeployBlockers: [
    'Deploy every batch from the listed admin wallet and record tx hashes.',
    'For each ReserveVault and AppRewardPool, call the official 72H Jetton master get_wallet_address getter and write the result into productionGateEnv.',
    'Send SetVaultJettonWallet / SetPoolJettonWallet transactions where required by the audited contracts and attach tx evidence.',
    'Run getter snapshots for Registry, ReserveVault, AppRewardPool, and AlphaVault before enabling any mainnet signing.',
    'Keep H72H_ENABLE_MAINNET_TACT_MESSAGES=false until external audit, legal approval, full testnet rehearsal, production gate, and internal mainnet rehearsal pass.',
  ],
  batches,
};

const directory = resolve(process.cwd(), 'deployments');
mkdirSync(directory, { recursive: true });
const jsonPath = resolve(directory, 'mainnet.tonconnect.json');
const htmlPath = resolve(directory, 'mainnet-deploy.html');
writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`);
writeDeployHtml({ path: htmlPath, expectedWallet: formatAddress(adminAddress), transactions: batches });

console.log('72H Capital mainnet TonConnect deployment package generated.');
console.log(`Admin wallet: ${formatAddress(adminAddress)}`);
console.log(`72H Jetton master: ${formatAddress(jettonMaster)}`);
console.log(`Manifest: ${jsonPath}`);
console.log(`Wallet confirmation page: ${htmlPath}`);
console.log('H72H_ENABLE_MAINNET_TACT_MESSAGES remains false until deployment is verified.');
