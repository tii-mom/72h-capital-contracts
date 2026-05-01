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

// V3 FIX: forward_ton_amount must be > 0 for all Jetton transfers
// Root cause of V2 PresaleVault funded72H=0: forward_ton_amount was 0,
// so the JettonTransferNotification was never dispatched to the contract.
const FORWARD_TON_AMOUNT = toNano('0.01').toString();

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
      forwardTonAmount: BigInt(FORWARD_TON_AMOUNT),
    })),
  };
}

function writeDeployHtml(input: {
  readonly path: string;
  readonly title: string;
  readonly expectedWallet: string;
  readonly batches: readonly TonConnectBatch[];
  readonly warnings: readonly string[];
}) {
  const warningsHtml = input.warnings.map(w => `<p class="warn">⚠️ ${w}</p>`).join('\n');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${input.title}</title>
  <script src="https://unpkg.com/@tonconnect/ui@latest/dist/tonconnect-ui.min.js"></script>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #10100e; color: #f4ead3; }
    main { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
    section { border: 1px solid rgba(244,234,211,.18); border-radius: 12px; padding: 18px; margin: 14px 0; background: rgba(255,255,255,.04); }
    button { border: 0; border-radius: 8px; padding: 10px 14px; background: #d7a84f; color: #15120a; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    button.skip-btn { background: #5a6268; }
    code { color: #ffe0a3; overflow-wrap: anywhere; }
    .muted { color: rgba(244,234,211,.72); }
    .warn { color: #ffd07a; }
    .info { color: #7eb8da; }
  </style>
</head>
<body>
  <main>
    <h1>${input.title}</h1>
    ${warningsHtml}
    <p class="info">Expected admin wallet: <code>${input.expectedWallet}</code></p>
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
      if (batch.risk === 'skip-if-deployed') {
        button.textContent = 'Verify batch (skip if deployed)';
        button.className = 'skip-btn';
      }
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

const tokenomicsPlanPath = resolve(process.cwd(), 'deployments/v3-mainnet/72h-v3-tokenomics.mainnet.plan.json');
if (!existsSync(tokenomicsPlanPath)) {
  throw new Error('Missing V3 mainnet dry-run plan. Run plan-72h-v3-tokenomics-mainnet.ts first.');
}

const tokenomicsPlan = readJson<any>(tokenomicsPlanPath);
const compiled = await compileJettonV2();
const admin = Address.parse(tokenomicsPlan.admin);
const masterAddress = Address.parse(tokenomicsPlan.jettonMaster);
const ownerJettonWallet = Address.parse(tokenomicsPlan.wallets.initialSupplyOwnerJettonWallet);

if (!tokenomicsPlan.v3Jetton) {
  throw new Error('V3 tokenomics plan is missing embedded v3Jetton plan.');
}
assertEqual('V3 Jetton plan master', tokenomicsPlan.v3Jetton.addresses.jettonMinter, tokenomicsPlan.jettonMaster);
assertEqual('V3 Jetton plan admin', tokenomicsPlan.v3Jetton.addresses.admin, tokenomicsPlan.admin);
assertEqual('V3 Jetton minter code hash', tokenomicsPlan.v3Jetton.codeHashes.minterHex, compiled.minter.codeHashHex);
assertEqual('V3 Jetton wallet code hash', tokenomicsPlan.v3Jetton.codeHashes.walletHex, compiled.wallet.codeHashHex);

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
  loadGeneratedContract('build/tact/SeasonClaimV2/SeasonClaimV2_SeasonClaimV2.js', 'SeasonClaimV2'),
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

const contracts: Record<string, GeneratedContract> = {
  SeasonVault: seasonVault,
  SeasonClaimV2: seasonClaim,
  FundVesting: fundVesting,
  DevelopmentFund: developmentFund,
  PresaleVault: presaleVault,
  EcosystemTreasury: ecosystemTreasury,
  TeamVesting: teamVesting,
};

// V3 is a new asset line; any V2 address collision is a hard failure.
const v2TokenomicsPlanPath = resolve(process.cwd(), 'deployments/72h-v2-tokenomics.mainnet.plan.json');
const v2Addresses: Record<string, string> = {};
if (existsSync(v2TokenomicsPlanPath)) {
  const v2Plan = readJson<any>(v2TokenomicsPlanPath);
  for (const [name, addr] of Object.entries(v2Plan.contracts as Record<string, string>)) {
    v2Addresses[name] = addr;
  }
}

const newContracts: typeof contracts = {};
const addressCollisions: typeof contracts = {};
for (const [name, contract] of Object.entries(contracts)) {
  const addr = formatAddress(contract.address);
  if (v2Addresses[name] === addr) {
    addressCollisions[name] = contract;
  } else {
    newContracts[name] = contract;
  }
}

console.log('New contracts to deploy:', Object.keys(newContracts));
console.log('V2 address collisions:', Object.keys(addressCollisions));
if (Object.keys(addressCollisions).length > 0) {
  throw new Error(`V3 requires new addresses for every tokenomics contract; V2 address collisions: ${Object.keys(addressCollisions).join(', ')}`);
}

const contractWallet = (name: string) => Address.parse(tokenomicsPlan.wallets.contractJettonWallets[name]);

const setupMessage = (contract: GeneratedContract, module: GeneratedModule, storeName: string, message: Record<string, unknown>): TonConnectMessage => ({
  address: formatAddress(contract.address),
  amount: SETUP_VALUE,
  payload: tactPayload(module, storeName, message),
});

const allBatches = [
  {
    id: 'deploy-v3-jetton-master',
    label: 'Deploy V3 Jetton master',
    risk: 'deploy',
    messages: [{
      address: tokenomicsPlan.v3Jetton.messages.deploy.to,
      amount: tokenomicsPlan.v3Jetton.messages.deploy.valueNano,
      stateInit: tokenomicsPlan.v3Jetton.messages.deploy.stateInit,
      payload: tokenomicsPlan.v3Jetton.messages.deploy.payload,
    }],
  },
  {
    id: 'mint-v3-total-supply',
    label: 'Mint fixed V3 total supply',
    risk: 'allocation',
    messages: [{
      address: tokenomicsPlan.v3Jetton.messages.mintTotalSupply.to,
      amount: tokenomicsPlan.v3Jetton.messages.mintTotalSupply.valueNano,
      payload: tokenomicsPlan.v3Jetton.messages.mintTotalSupply.payload,
    }],
  },
  {
    id: 'drop-v3-jetton-admin',
    label: 'Drop V3 Jetton master admin',
    risk: 'setup',
    messages: [{
      address: tokenomicsPlan.v3Jetton.messages.dropAdmin.to,
      amount: tokenomicsPlan.v3Jetton.messages.dropAdmin.valueNano,
      payload: tokenomicsPlan.v3Jetton.messages.dropAdmin.payload,
    }],
  },
  {
    id: 'deploy-tokenomics-a',
    label: 'Deploy tokenomics contracts A (NEW)',
    risk: 'deploy',
    messages: 'SeasonVault' in newContracts && 'SeasonClaimV2' in newContracts && 'FundVesting' in newContracts 
      ? [deployMessage(newContracts.SeasonVault!), deployMessage(newContracts.SeasonClaimV2!), deployMessage(newContracts.FundVesting!)]
      : [],
  },
  {
    id: 'deploy-tokenomics-b',
    label: 'Deploy tokenomics contracts B (NEW)',
    risk: 'deploy',
    messages: [
      ...('DevelopmentFund' in newContracts ? [deployMessage(newContracts.DevelopmentFund!)] : []),
      ...('PresaleVault' in newContracts ? [deployMessage(newContracts.PresaleVault!)] : []),
      ...('EcosystemTreasury' in newContracts ? [deployMessage(newContracts.EcosystemTreasury!)] : []),
      ...('TeamVesting' in newContracts ? [deployMessage(newContracts.TeamVesting!)] : []),
    ],
  },
  {
    id: 'set-jetton-wallets-a',
    label: 'Set contract Jetton wallets A',
    risk: 'setup',
    messages: [
      setupMessage(seasonVault, seasonVaultDef.module, 'storeSetSeasonVaultJettonWallet', { $$type: 'SetSeasonVaultJettonWallet', wallet: contractWallet('SeasonVault') }),
      setupMessage(seasonClaim, seasonClaimDef.module, 'storeSetSeasonClaimJettonWallet', { $$type: 'SetSeasonClaimJettonWallet', wallet: contractWallet('SeasonClaimV2') }),
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
    label: 'Allocate V3 supply A (forward_ton_amount > 0)',
    risk: 'allocation',
    messages: [
      jettonTransferMessage({ ownerJettonWallet, to: seasonVault.address, responseAddress: admin, amount: SEASON_VAULT_ALLOCATION, queryId: 7202000001n }),
      jettonTransferMessage({ ownerJettonWallet, to: presaleVault.address, responseAddress: admin, amount: PRESALE_ALLOCATION, queryId: 7202000002n }),
      jettonTransferMessage({ ownerJettonWallet, to: ecosystemTreasury.address, responseAddress: admin, amount: ECOSYSTEM_ALLOCATION, queryId: 7202000003n }),
    ],
  },
  {
    id: 'allocate-tokenomics-b',
    label: 'Allocate V3 supply B (forward_ton_amount > 0)',
    risk: 'allocation',
    messages: [
      jettonTransferMessage({ ownerJettonWallet, to: developmentFund.address, responseAddress: admin, amount: DEVELOPMENT_FUND_ALLOCATION, queryId: 7202000004n }),
      jettonTransferMessage({ ownerJettonWallet, to: teamVesting.address, responseAddress: admin, amount: TEAM_VESTING_ALLOCATION, queryId: 7202000005n }),
      jettonTransferMessage({ ownerJettonWallet, to: earlyUsersWallet, responseAddress: admin, amount: EARLY_USERS_ALLOCATION, queryId: 7202000006n }),
    ],
  },
] satisfies readonly TonConnectBatch[];

const batches = allBatches.filter(b => b.messages.length > 0);

const warnings = [
  '🚨 V3 REDEPLOY: 新Jetton Master + 新tokenomics合约地址；V2资产线不得复用为V3。',
  '🚨 本包不打开预售。',
  `🚨 本包仅向SeasonVault拨付900亿72H；成功赛季奖励必须在18轮记录完成和multi-millionaire Merkle root注册后才能finalize到SeasonClaimV2。`,
  '🚨 使用前必须重新生成此包，确保TonConnect validUntil保持新鲜。',
  '🚨 严格按顺序发送批次，并在主要阶段之间验证getters。',
  '✅ V3修正: 价格保持时间为1小时；所有allocation Jetton转账的forward_ton_amount=0.01 TON（>0）。',
];

const packageJson = {
  generatedAt: new Date().toISOString(),
  network: 'mainnet',
  version: 'v3',
  chain: MAINNET_CHAIN,
  sourcePlans: {
    jetton: 'embedded-v3-jetton-plan',
    tokenomics: 'deployments/v3-mainnet/72h-v3-tokenomics.mainnet.plan.json',
  },
  expectedWallet: formatAddress(admin),
  jettonMaster: formatAddress(masterAddress),
  ownerJettonWallet: formatAddress(ownerJettonWallet),
  contracts: tokenomicsPlan.contracts,
  newContracts: Object.fromEntries(Object.entries(newContracts).map(([n, c]) => [n, formatAddress(c.address)])),
  warnings,
  batches,
};

const directory = resolve(process.cwd(), 'deployments', 'v3-mainnet');
mkdirSync(directory, { recursive: true });
const jsonPath = resolve(directory, '72h-v3-mainnet.tonconnect.json');
const htmlPath = resolve(directory, '72h-v3-mainnet-deploy.html');
writeFileSync(jsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
writeDeployHtml({
  path: htmlPath,
  title: '72H V3 Mainnet Deploy (1-hour price hold)',
  expectedWallet: formatAddress(admin),
  batches,
  warnings,
});

console.log('72H V3 mainnet TonConnect package generated.');
console.log(`Expected wallet: ${formatAddress(admin)}`);
console.log(`V3 Jetton master (NEW): ${formatAddress(masterAddress)}`);
console.log(`Package: ${jsonPath}`);
console.log(`Wallet confirmation page: ${htmlPath}`);
console.log(`Forward TON amount (V3 fix): ${FORWARD_TON_AMOUNT}`);
console.log('No transaction was sent.');
