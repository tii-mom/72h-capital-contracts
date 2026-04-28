import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, beginCell, storeStateInit, toNano, type Cell } from '@ton/core';
import {
  compileJettonV2,
  H72H_V2_TOTAL_SUPPLY,
  JettonWalletV2,
} from '../src/jetton-v2/index.js';

const SCALE = 1_000_000_000n;
const SEASON_VAULT_ALLOCATION = 90_000_000_000n * SCALE;
const PRESALE_ALLOCATION = 4_500_000_000n * SCALE;
const ECOSYSTEM_ALLOCATION = 4_500_000_000n * SCALE;
const DEVELOPMENT_FUND_ALLOCATION = 500_000_000n * SCALE;
const TEAM_VESTING_ALLOCATION = 300_000_000n * SCALE;
const EARLY_USERS_ALLOCATION = 200_000_000n * SCALE;
const SETUP_VALUE = toNano('0.12').toString();
const DEPLOY_VALUE = toNano('0.12').toString();
const JETTON_TRANSFER_VALUE = toNano('0.25').toString();
const MAINNET_CHAIN = '-239';

type GeneratedContract = {
  readonly address: Address;
  readonly init?: { readonly code: Cell; readonly data: Cell };
};

type GeneratedContractClass = {
  fromInit: (...args: any[]) => Promise<GeneratedContract>;
};

type GeneratedModule = Record<string, unknown> & {
  fromInit?: (...args: any[]) => Promise<GeneratedContract>;
};

type TonConnectMessage = {
  readonly address: string;
  readonly amount: string;
  readonly stateInit?: string;
  readonly payload?: string;
};

type TonConnectBatch = {
  readonly id: string;
  readonly label: string;
  readonly risk: 'deploy' | 'setup' | 'allocation';
  readonly messages: readonly TonConnectMessage[];
};

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

async function importModule(relativePath: string) {
  const requestedPath = resolve(process.cwd(), relativePath);
  const tsPath = resolve(process.cwd(), relativePath.replace(/\.js$/, '.ts'));
  const absolutePath = existsSync(requestedPath) ? requestedPath : tsPath;
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing generated wrapper ${relativePath}. Run npm run tact:build first.`);
  }
  return (await import(pathToFileURL(absolutePath).href)) as GeneratedModule;
}

async function loadGeneratedContract(relativePath: string, exportName: string) {
  const module = await importModule(relativePath);
  const contract = module[exportName] as GeneratedContractClass | undefined;
  if (!contract?.fromInit) throw new Error(`Generated wrapper ${relativePath} does not export ${exportName}.`);
  return { module, contract };
}

function formatAddress(address: Address) {
  return address.toString({ testOnly: false });
}

function stateInitBase64(contract: GeneratedContract) {
  if (!contract.init) throw new Error(`Missing StateInit for ${formatAddress(contract.address)}.`);
  return beginCell().store(storeStateInit(contract.init)).endCell().toBoc().toString('base64');
}

function codeHashHex(contract: GeneratedContract) {
  if (!contract.init) throw new Error(`Missing StateInit for ${formatAddress(contract.address)}.`);
  return contract.init.code.hash().toString('hex');
}

function payloadBase64(cell: Cell) {
  return cell.toBoc().toString('base64');
}

function tactPayload(module: GeneratedModule, storeName: string, message: Record<string, unknown>) {
  const store = module[storeName] as ((src: Record<string, unknown>) => (builder: any) => void) | undefined;
  if (!store) throw new Error(`Missing generated store function ${storeName}.`);
  return payloadBase64(beginCell().store(store(message)).endCell());
}

function deployMessage(contract: GeneratedContract): TonConnectMessage {
  return {
    address: formatAddress(contract.address),
    amount: DEPLOY_VALUE,
    stateInit: stateInitBase64(contract),
  };
}

function assertEqual(label: string, actual: string, expected: string) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch. expected ${expected}, got ${actual}`);
  }
}

function jettonTransferMessage(input: {
  readonly ownerJettonWallet: Address;
  readonly to: Address;
  readonly responseAddress: Address;
  readonly amount: bigint;
  readonly queryId: bigint;
}): TonConnectMessage {
  return {
    address: formatAddress(input.ownerJettonWallet),
    amount: JETTON_TRANSFER_VALUE,
    payload: payloadBase64(JettonWalletV2.transferMessage({
      queryId: input.queryId,
      jettonAmount: input.amount,
      to: input.to,
      responseAddress: input.responseAddress,
      forwardTonAmount: 0n,
    })),
  };
}

function writeDeployHtml(input: {
  readonly path: string;
  readonly expectedWallet: string;
  readonly batches: readonly TonConnectBatch[];
}) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>72H V2 Mainnet Deploy</title>
  <script src="https://unpkg.com/@tonconnect/ui@latest/dist/tonconnect-ui.min.js"></script>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #10100e; color: #f4ead3; }
    main { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
    section { border: 1px solid rgba(244,234,211,.18); border-radius: 12px; padding: 18px; margin: 14px 0; background: rgba(255,255,255,.04); }
    button { border: 0; border-radius: 8px; padding: 10px 14px; background: #d7a84f; color: #15120a; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    code { color: #ffe0a3; overflow-wrap: anywhere; }
    .muted { color: rgba(244,234,211,.72); }
    .warn { color: #ffd07a; }
  </style>
</head>
<body>
  <main>
    <h1>72H V2 Mainnet Deploy</h1>
    <p class="warn">Use only after final audit sign-off and explicit owner approval. This page does not open presale.</p>
    <p>Expected admin wallet: <code>${input.expectedWallet}</code></p>
    <div id="ton-connect"></div>
    <section>
      <h2>Batches</h2>
      <div id="batches"></div>
    </section>
    <pre id="log" class="muted"></pre>
  </main>
  <script>
    const expectedWallet = ${JSON.stringify(input.expectedWallet)};
    const batches = ${JSON.stringify(input.batches)};
    const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: 'https://72h.lol/tonconnect-manifest.json',
      buttonRootId: 'ton-connect'
    });
    const log = document.getElementById('log');
    function write(message) { log.textContent += message + '\\n'; }
    const root = document.getElementById('batches');
    for (const batch of batches) {
      const section = document.createElement('section');
      const title = document.createElement('h3');
      title.textContent = batch.label;
      const meta = document.createElement('p');
      meta.className = 'muted';
      meta.textContent = batch.messages.length + ' message(s), type=' + batch.risk;
      const button = document.createElement('button');
      button.textContent = 'Send batch to wallet';
      button.onclick = async () => {
        button.disabled = true;
        try {
          if (!tonConnectUI.wallet) throw new Error('Connect wallet first.');
          const request = {
            validUntil: Math.floor(Date.now() / 1000) + 30 * 60,
            network: ${JSON.stringify(MAINNET_CHAIN)},
            messages: batch.messages
          };
          write('Sending ' + batch.label + ' ...');
          const result = await tonConnectUI.sendTransaction(request);
          write('Submitted ' + batch.id + ': ' + JSON.stringify(result));
        } catch (error) {
          write('Failed ' + batch.id + ': ' + (error && error.message ? error.message : String(error)));
          button.disabled = false;
        }
      };
      section.append(title, meta, button);
      root.append(section);
    }
  </script>
</body>
</html>`;
  writeFileSync(input.path, html);
}

const jettonPlanPath = resolve(process.cwd(), 'deployments/jetton-v2.mainnet.plan.json');
const tokenomicsPlanPath = resolve(process.cwd(), 'deployments/72h-v2-tokenomics.mainnet.plan.json');
if (!existsSync(jettonPlanPath) || !existsSync(tokenomicsPlanPath)) {
  throw new Error('Missing mainnet dry-run plans. Run npm run jetton-v2:plan:mainnet and npm run plan:v2-tokenomics:mainnet first.');
}

const jettonPlan = readJson<any>(jettonPlanPath);
const tokenomicsPlan = readJson<any>(tokenomicsPlanPath);
const compiled = await compileJettonV2();
const admin = Address.parse(tokenomicsPlan.admin);
const masterAddress = Address.parse(tokenomicsPlan.jettonMaster);
const ownerJettonWallet = Address.parse(tokenomicsPlan.wallets.initialSupplyOwnerJettonWallet);

assertEqual('Jetton plan master', jettonPlan.addresses.jettonMinter, tokenomicsPlan.jettonMaster);
assertEqual('Jetton plan admin', jettonPlan.addresses.admin, tokenomicsPlan.admin);
assertEqual('Jetton minter code hash', jettonPlan.codeHashes.minterHex, compiled.minter.codeHashHex);
assertEqual('Jetton wallet code hash', jettonPlan.codeHashes.walletHex, compiled.wallet.codeHashHex);

const [
  seasonVaultDef,
  seasonClaimDef,
  fundVestingDef,
  developmentFundDef,
  presaleVaultDef,
  ecosystemTreasuryDef,
  teamVestingDef,
] = await Promise.all([
  loadGeneratedContract('build/tact/SeasonVault/SeasonVault_SeasonVault.js', 'SeasonVault'),
  loadGeneratedContract('build/tact/SeasonClaim/SeasonClaim_SeasonClaim.js', 'SeasonClaim'),
  loadGeneratedContract('build/tact/FundVesting/FundVesting_FundVesting.js', 'FundVesting'),
  loadGeneratedContract('build/tact/DevelopmentFund/DevelopmentFund_DevelopmentFund.js', 'DevelopmentFund'),
  loadGeneratedContract('build/tact/PresaleVault/PresaleVault_PresaleVault.js', 'PresaleVault'),
  loadGeneratedContract('build/tact/EcosystemTreasury/EcosystemTreasury_EcosystemTreasury.js', 'EcosystemTreasury'),
  loadGeneratedContract('build/tact/TeamVesting/TeamVesting_TeamVesting.js', 'TeamVesting'),
]);

const placeholder = admin;
const developmentFundWallet = Address.parse(tokenomicsPlan.wallets.developmentFundWallet);
const teamWallet = Address.parse(tokenomicsPlan.wallets.teamWallet);
const proceedsWallet = Address.parse(tokenomicsPlan.wallets.proceedsWallet);
const earlyUsersWallet = Address.parse(tokenomicsPlan.wallets.earlyUsersWallet);

const developmentFund = await developmentFundDef.contract.fromInit(admin, masterAddress, placeholder);
const fundVesting = await fundVestingDef.contract.fromInit(admin, masterAddress, placeholder, placeholder, developmentFundWallet);
const seasonClaim = await seasonClaimDef.contract.fromInit(admin, masterAddress, placeholder, placeholder);
const teamVesting = await teamVestingDef.contract.fromInit(admin, masterAddress, placeholder, teamWallet);
const ecosystemTreasury = await ecosystemTreasuryDef.contract.fromInit(admin, masterAddress, placeholder);
const presaleVault = await presaleVaultDef.contract.fromInit(
  admin,
  masterAddress,
  placeholder,
  proceedsWallet,
  developmentFund.address,
  BigInt(tokenomicsPlan.presale.tokensPerTonRaw[0]),
  BigInt(tokenomicsPlan.presale.tokensPerTonRaw[1]),
  BigInt(tokenomicsPlan.presale.tokensPerTonRaw[2]),
  BigInt(tokenomicsPlan.presale.walletCapRaw),
);
const seasonVault = await seasonVaultDef.contract.fromInit(admin, masterAddress, placeholder, seasonClaim.address, fundVesting.address);

const contracts = {
  SeasonVault: seasonVault,
  SeasonClaim: seasonClaim,
  FundVesting: fundVesting,
  DevelopmentFund: developmentFund,
  PresaleVault: presaleVault,
  EcosystemTreasury: ecosystemTreasury,
  TeamVesting: teamVesting,
};

for (const [name, contract] of Object.entries(contracts)) {
  assertEqual(`${name} address`, formatAddress(contract.address), tokenomicsPlan.contracts[name]);
  assertEqual(`${name} code hash`, codeHashHex(contract), tokenomicsPlan.codeHashes.tokenomics[name]);
}

const contractWallet = (name: string) => Address.parse(tokenomicsPlan.wallets.contractJettonWallets[name]);

const setupMessage = (contract: GeneratedContract, module: GeneratedModule, storeName: string, message: Record<string, unknown>): TonConnectMessage => ({
  address: formatAddress(contract.address),
  amount: SETUP_VALUE,
  payload: tactPayload(module, storeName, message),
});

const batches: TonConnectBatch[] = [
  {
    id: 'deploy-v2-jetton-master',
    label: 'Deploy V2 Jetton master',
    risk: 'deploy',
    messages: [{
      address: jettonPlan.messages.deploy.to,
      amount: jettonPlan.messages.deploy.valueNano,
      stateInit: jettonPlan.messages.deploy.stateInit,
      payload: jettonPlan.messages.deploy.payload,
    }],
  },
  {
    id: 'mint-v2-total-supply',
    label: 'Mint fixed total supply to admin Jetton wallet',
    risk: 'allocation',
    messages: [{
      address: jettonPlan.messages.mintTotalSupply.to,
      amount: jettonPlan.messages.mintTotalSupply.valueNano,
      payload: jettonPlan.messages.mintTotalSupply.payload,
    }],
  },
  {
    id: 'drop-v2-admin',
    label: 'Drop V2 Jetton admin',
    risk: 'setup',
    messages: [{
      address: jettonPlan.messages.dropAdmin.to,
      amount: jettonPlan.messages.dropAdmin.valueNano,
      payload: jettonPlan.messages.dropAdmin.payload,
    }],
  },
  {
    id: 'deploy-tokenomics-a',
    label: 'Deploy tokenomics contracts A',
    risk: 'deploy',
    messages: [deployMessage(seasonVault), deployMessage(seasonClaim), deployMessage(fundVesting)],
  },
  {
    id: 'deploy-tokenomics-b',
    label: 'Deploy tokenomics contracts B',
    risk: 'deploy',
    messages: [deployMessage(developmentFund), deployMessage(presaleVault), deployMessage(ecosystemTreasury), deployMessage(teamVesting)],
  },
  {
    id: 'set-jetton-wallets-a',
    label: 'Set contract Jetton wallets A',
    risk: 'setup',
    messages: [
      setupMessage(seasonVault, seasonVaultDef.module, 'storeSetSeasonVaultJettonWallet', { $$type: 'SetSeasonVaultJettonWallet', wallet: contractWallet('SeasonVault') }),
      setupMessage(seasonClaim, seasonClaimDef.module, 'storeSetSeasonClaimJettonWallet', { $$type: 'SetSeasonClaimJettonWallet', wallet: contractWallet('SeasonClaim') }),
      setupMessage(fundVesting, fundVestingDef.module, 'storeSetFundJettonWallet', { $$type: 'SetFundJettonWallet', wallet: contractWallet('FundVesting') }),
      setupMessage(developmentFund, developmentFundDef.module, 'storeSetDevelopmentFundJettonWallet', { $$type: 'SetDevelopmentFundJettonWallet', wallet: contractWallet('DevelopmentFund') }),
    ],
  },
  {
    id: 'set-jetton-wallets-b',
    label: 'Set contract Jetton wallets B',
    risk: 'setup',
    messages: [
      setupMessage(presaleVault, presaleVaultDef.module, 'storeSetPresaleJettonWallet', { $$type: 'SetPresaleJettonWallet', wallet: contractWallet('PresaleVault') }),
      setupMessage(ecosystemTreasury, ecosystemTreasuryDef.module, 'storeSetEcosystemJettonWallet', { $$type: 'SetEcosystemJettonWallet', wallet: contractWallet('EcosystemTreasury') }),
      setupMessage(teamVesting, teamVestingDef.module, 'storeSetTeamJettonWallet', { $$type: 'SetTeamJettonWallet', wallet: contractWallet('TeamVesting') }),
    ],
  },
  {
    id: 'set-tokenomics-routes',
    label: 'Set tokenomics post-deploy routes',
    risk: 'setup',
    messages: [
      setupMessage(seasonVault, seasonVaultDef.module, 'storeSetSeasonVaultRoutes', { $$type: 'SetSeasonVaultRoutes', claimContract: seasonClaim.address, fundVestingContract: fundVesting.address }),
      setupMessage(seasonClaim, seasonClaimDef.module, 'storeSetSeasonClaimSeasonVault', { $$type: 'SetSeasonClaimSeasonVault', seasonVault: seasonVault.address }),
      setupMessage(fundVesting, fundVestingDef.module, 'storeSetFundSeasonVault', { $$type: 'SetFundSeasonVault', seasonVault: seasonVault.address }),
    ],
  },
  {
    id: 'allocate-tokenomics-a',
    label: 'Allocate V2 supply A',
    risk: 'allocation',
    messages: [
      jettonTransferMessage({ ownerJettonWallet, to: seasonVault.address, responseAddress: admin, amount: SEASON_VAULT_ALLOCATION, queryId: 7202000001n }),
      jettonTransferMessage({ ownerJettonWallet, to: presaleVault.address, responseAddress: admin, amount: PRESALE_ALLOCATION, queryId: 7202000002n }),
      jettonTransferMessage({ ownerJettonWallet, to: ecosystemTreasury.address, responseAddress: admin, amount: ECOSYSTEM_ALLOCATION, queryId: 7202000003n }),
    ],
  },
  {
    id: 'allocate-tokenomics-b',
    label: 'Allocate V2 supply B',
    risk: 'allocation',
    messages: [
      jettonTransferMessage({ ownerJettonWallet, to: developmentFund.address, responseAddress: admin, amount: DEVELOPMENT_FUND_ALLOCATION, queryId: 7202000004n }),
      jettonTransferMessage({ ownerJettonWallet, to: teamVesting.address, responseAddress: admin, amount: TEAM_VESTING_ALLOCATION, queryId: 7202000005n }),
      jettonTransferMessage({ ownerJettonWallet, to: earlyUsersWallet, responseAddress: admin, amount: EARLY_USERS_ALLOCATION, queryId: 7202000006n }),
    ],
  },
];

const packageJson = {
  generatedAt: new Date().toISOString(),
  network: 'mainnet',
  chain: MAINNET_CHAIN,
  sourcePlans: {
    jetton: 'deployments/jetton-v2.mainnet.plan.json',
    tokenomics: 'deployments/72h-v2-tokenomics.mainnet.plan.json',
  },
  expectedWallet: formatAddress(admin),
  jettonMaster: formatAddress(masterAddress),
  ownerJettonWallet: formatAddress(ownerJettonWallet),
  contracts: tokenomicsPlan.contracts,
  warnings: [
    'Do not use deployments/mainnet.tonconnect.json for V2 tokenomics.',
    'This package does not open presale.',
    'This package only funds SeasonVault with 90B; successful season rewards must later be finalized to SeasonClaim after 18 recorded rounds and a multi-millionaire Merkle root.',
    'Regenerate this package immediately before use so TonConnect validUntil is fresh.',
    'Send batches strictly in order and verify getters between major stages.',
  ],
  batches,
};

const directory = resolve(process.cwd(), 'deployments');
mkdirSync(directory, { recursive: true });
const jsonPath = resolve(directory, '72h-v2-mainnet.tonconnect.json');
const htmlPath = resolve(directory, '72h-v2-mainnet-deploy.html');
writeFileSync(jsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
writeDeployHtml({ path: htmlPath, expectedWallet: formatAddress(admin), batches });

console.log('72H V2 mainnet TonConnect package generated.');
console.log(`Expected wallet: ${formatAddress(admin)}`);
console.log(`V2 Jetton master: ${formatAddress(masterAddress)}`);
console.log(`Package: ${jsonPath}`);
console.log(`Wallet confirmation page: ${htmlPath}`);
console.log('No transaction was sent.');
