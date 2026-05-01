import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, beginCell, storeStateInit, toNano, type Cell } from '@ton/core';
import {
  compileJettonV2,
  H72H_V2_METADATA_URI_PLACEHOLDER,
  H72H_V2_TOTAL_SUPPLY,
  JettonMinterV2,
  JettonWalletV2,
} from '../src/jetton-v2/index.js';

const SCALE = 1_000_000_000n;
const SEASON_VAULT_ALLOCATION = 90_000_000_000n * SCALE;
const PRESALE_ALLOCATION = 4_500_000_000n * SCALE;
const ECOSYSTEM_ALLOCATION = 4_500_000_000n * SCALE;
const DEVELOPMENT_FUND_ALLOCATION = 500_000_000n * SCALE;
const TEAM_VESTING_ALLOCATION = 300_000_000n * SCALE;
const EARLY_USERS_ALLOCATION = 200_000_000n * SCALE;
const ROUND_AMOUNT = 500_000_000n * SCALE;
const ROUNDS_PER_SEASON = 18n;
const MAX_SEASONS = 10n;
const PERSONAL_DEPOSIT_BPS = 5000n;
const TEAM_DEPOSIT_BPS = 2500n;
const REFERRAL_BPS = 1500n;
const LEADERBOARD_BPS = 1000n;
const PRESALE_STAGE_1_TOKENS_PER_TON = 10_072n * SCALE;
const PRESALE_STAGE_2_TOKENS_PER_TON = 7_200n * SCALE;
const PRESALE_STAGE_3_TOKENS_PER_TON = 3_500n * SCALE;
const PRESALE_WALLET_CAP = 7_200_000n * SCALE;

const DEFAULT_MAINNET_ADMIN = 'UQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQfRq';
const DEFAULT_DEVELOPMENT_FUND_WALLET = 'UQB31HYfGtzDDa-cudZolA6g1gNcoxZsxeQoEM4lmhhuo5Bu';
const DEFAULT_TEAM_WALLET = 'UQDqA19b4tBQKi7Z_0NS08eWzq-FZ-wsRU4QfzEEKwcoucjV';
const DEFAULT_PROCEEDS_WALLET = 'UQBGY56JY9gy1V-vnnyOpGoJXLWAcm3LKNAdl9OKShuCe7QA';
const DEFAULT_EARLY_USERS_WALLET = 'UQDqA19b4tBQKi7Z_0NS08eWzq-FZ-wsRU4QfzEEKwcoucjV';

type GeneratedContract = {
  readonly address: Address;
  readonly init?: { readonly code: Cell; readonly data: Cell };
};

type GeneratedContractClass = {
  fromInit: (...args: any[]) => Promise<GeneratedContract>;
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
  const value = process.env[name]?.trim();
  return value || undefined;
}

async function loadGeneratedContract(relativePath: string, exportName: string) {
  const requestedPath = resolve(process.cwd(), relativePath);
  const tsPath = resolve(process.cwd(), relativePath.replace(/\.js$/, '.ts'));
  const absolutePath = existsSync(requestedPath) ? requestedPath : tsPath;
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing generated wrapper ${relativePath}. Run npm run tact:build first.`);
  }
  const module = (await import(pathToFileURL(absolutePath).href)) as Record<string, unknown>;
  const contract = module[exportName] as GeneratedContractClass | undefined;
  if (!contract?.fromInit) throw new Error(`Generated wrapper ${relativePath} does not export ${exportName}.`);
  return contract;
}

function formatAddress(address: Address) {
  return address.toString({ testOnly: false });
}

function codeHashHex(contract: GeneratedContract) {
  if (!contract.init) throw new Error(`Missing StateInit for ${formatAddress(contract.address)}.`);
  return contract.init.code.hash().toString('hex');
}

function dataHashHex(contract: GeneratedContract) {
  if (!contract.init) throw new Error(`Missing StateInit for ${formatAddress(contract.address)}.`);
  return contract.init.data.hash().toString('hex');
}

function stateInitBase64(contract: JettonMinterV2) {
  if (!contract.init) throw new Error('Missing V3 minter StateInit.');
  return beginCell().store(storeStateInit(contract.init)).endCell().toBoc().toString('base64');
}

const loadedEnvFiles = loadLocalEnv();
const compiled = await compileJettonV2();
const metadataUri = optionalEnv('TON_V3_METADATA_URI') ?? H72H_V2_METADATA_URI_PLACEHOLDER;
if (metadataUri === H72H_V2_METADATA_URI_PLACEHOLDER) {
  throw new Error('TON_V3_METADATA_URI must be finalized before mainnet V3 planning; V3 cannot reuse the V2 metadata URI because the Jetton master address would collide with V2.');
}
const v2MetadataUri = optionalEnv('TON_V2_METADATA_URI');
if (v2MetadataUri && metadataUri === v2MetadataUri) {
  throw new Error('TON_V3_METADATA_URI must differ from TON_V2_METADATA_URI so the V3 Jetton master address is new.');
}

const admin = Address.parse(optionalEnv('TON_V3_TOKENOMICS_ADMIN_ADDRESS') ?? optionalEnv('TON_V3_ADMIN_ADDRESS') ?? optionalEnv('TON_V2_TOKENOMICS_ADMIN_ADDRESS') ?? optionalEnv('TON_V2_ADMIN_ADDRESS') ?? optionalEnv('TON_MAINNET_DEPLOYER_ADDRESS') ?? DEFAULT_MAINNET_ADMIN);
const initialSupplyOwner = Address.parse(optionalEnv('TON_V3_INITIAL_SUPPLY_OWNER_ADDRESS') ?? admin.toString());
if (!initialSupplyOwner.equals(admin)) {
  throw new Error(`V3 initial supply owner ${formatAddress(initialSupplyOwner)} must equal tokenomics admin ${formatAddress(admin)} for the allocation runbook.`);
}

const workchain = Number(optionalEnv('TON_V3_WORKCHAIN') ?? optionalEnv('TON_V2_WORKCHAIN') ?? '0');
const minter = JettonMinterV2.createFromConfig(
  {
    admin,
    walletCode: compiled.wallet.code,
    metadataUri,
  },
  compiled.minter.code,
  workchain,
);
const masterAddress = minter.address;
const mintBody = JettonMinterV2.mintMessage({
  to: initialSupplyOwner,
  jettonAmount: H72H_V2_TOTAL_SUPPLY,
  from: admin,
  responseAddress: admin,
  totalTonAmount: toNano('0.3'),
});
const dropAdminBody = JettonMinterV2.dropAdminMessage();
const deployBody = JettonMinterV2.topUpMessage();
const developmentFundWallet = Address.parse(optionalEnv('TON_V2_DEVELOPMENT_FUND_WALLET_ADDRESS') ?? DEFAULT_DEVELOPMENT_FUND_WALLET);
const teamWallet = Address.parse(optionalEnv('TON_V2_TEAM_WALLET_ADDRESS') ?? DEFAULT_TEAM_WALLET);
const proceedsWallet = Address.parse(optionalEnv('TON_V2_PRESALE_PROCEEDS_WALLET_ADDRESS') ?? DEFAULT_PROCEEDS_WALLET);
const earlyUsersWallet = Address.parse(optionalEnv('TON_V2_EARLY_USERS_WALLET_ADDRESS') ?? DEFAULT_EARLY_USERS_WALLET);
const placeholder = admin;

const [
  SeasonVault,
  SeasonClaimV2,
  FundVesting,
  DevelopmentFund,
  PresaleVault,
  EcosystemTreasury,
  TeamVesting,
] = await Promise.all([
  loadGeneratedContract('build/tact/SeasonVault/SeasonVault_SeasonVault.js', 'SeasonVault'),
  loadGeneratedContract('build/tact/SeasonClaimV2/SeasonClaimV2_SeasonClaimV2.js', 'SeasonClaimV2'),
  loadGeneratedContract('build/tact/FundVesting/FundVesting_FundVesting.js', 'FundVesting'),
  loadGeneratedContract('build/tact/DevelopmentFund/DevelopmentFund_DevelopmentFund.js', 'DevelopmentFund'),
  loadGeneratedContract('build/tact/PresaleVault/PresaleVault_PresaleVault.js', 'PresaleVault'),
  loadGeneratedContract('build/tact/EcosystemTreasury/EcosystemTreasury_EcosystemTreasury.js', 'EcosystemTreasury'),
  loadGeneratedContract('build/tact/TeamVesting/TeamVesting_TeamVesting.js', 'TeamVesting'),
]);

const developmentFund = await DevelopmentFund.fromInit(admin, masterAddress, placeholder);
const fundVesting = await FundVesting.fromInit(admin, masterAddress, placeholder, placeholder, developmentFundWallet);
const seasonClaim = await SeasonClaimV2.fromInit(admin, masterAddress, placeholder, placeholder);
const teamVesting = await TeamVesting.fromInit(admin, masterAddress, placeholder, teamWallet);
const ecosystemTreasury = await EcosystemTreasury.fromInit(admin, masterAddress, placeholder);
const presaleVault = await PresaleVault.fromInit(
  admin,
  masterAddress,
  placeholder,
  proceedsWallet,
  developmentFund.address,
  PRESALE_STAGE_1_TOKENS_PER_TON,
  PRESALE_STAGE_2_TOKENS_PER_TON,
  PRESALE_STAGE_3_TOKENS_PER_TON,
  PRESALE_WALLET_CAP,
);
const seasonVault = await SeasonVault.fromInit(admin, masterAddress, placeholder, seasonClaim.address, fundVesting.address);

function jettonWalletFor(owner: Address) {
  return JettonWalletV2.createFromConfig({ ownerAddress: owner, jettonMasterAddress: masterAddress }, compiled.wallet.code).address;
}

const contracts = {
  SeasonVault: seasonVault,
  SeasonClaimV2: seasonClaim,
  FundVesting: fundVesting,
  DevelopmentFund: developmentFund,
  PresaleVault: presaleVault,
  EcosystemTreasury: ecosystemTreasury,
  TeamVesting: teamVesting,
};

const plan = {
  generatedAt: new Date().toISOString(),
  network: 'mainnet',
  version: 'v3',
  mode: 'dry-run',
  loadedEnvFiles,
  jettonPlan: 'embedded-v3-jetton-plan',
  buildCommit: 'local V3 candidate (1 hour price hold)',
  admin: formatAddress(admin),
  jettonMaster: formatAddress(masterAddress),
  metadataUri,
  supplyRaw: H72H_V2_TOTAL_SUPPLY.toString(),
  v3Jetton: {
    token: {
      name: '72H',
      symbol: '72H',
      decimals: 9,
      totalSupplyRaw: H72H_V2_TOTAL_SUPPLY.toString(),
      metadataUri,
    },
    addresses: {
      admin: formatAddress(admin),
      initialSupplyOwner: formatAddress(initialSupplyOwner),
      jettonMinter: formatAddress(masterAddress),
    },
    codeHashes: {
      minterHex: compiled.minter.codeHashHex,
      minterBase64: compiled.minter.codeHashBase64,
      walletHex: compiled.wallet.codeHashHex,
      walletBase64: compiled.wallet.codeHashBase64,
    },
    messages: {
      deploy: {
        to: formatAddress(masterAddress),
        valueNano: toNano('0.05').toString(),
        stateInit: stateInitBase64(minter),
        payload: deployBody.toBoc().toString('base64'),
      },
      mintTotalSupply: {
        to: formatAddress(masterAddress),
        valueNano: toNano('0.35').toString(),
        payload: mintBody.toBoc().toString('base64'),
      },
      dropAdmin: {
        to: formatAddress(masterAddress),
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
  },
  wallets: {
    initialSupplyOwner: formatAddress(initialSupplyOwner),
    initialSupplyOwnerJettonWallet: formatAddress(jettonWalletFor(initialSupplyOwner)),
    developmentFundWallet: formatAddress(developmentFundWallet),
    teamWallet: formatAddress(teamWallet),
    proceedsWallet: formatAddress(proceedsWallet),
    earlyUsersWallet: formatAddress(earlyUsersWallet),
    contractJettonWallets: Object.fromEntries(
      Object.entries(contracts).map(([name, contract]) => [name, formatAddress(jettonWalletFor(contract.address))]),
    ),
  },
  contracts: Object.fromEntries(Object.entries(contracts).map(([name, contract]) => [name, formatAddress(contract.address)])),
  codeHashes: {
    jettonMinterHex: compiled.minter.codeHashHex,
    jettonWalletHex: compiled.wallet.codeHashHex,
    tokenomics: Object.fromEntries(Object.entries(contracts).map(([name, contract]) => [name, codeHashHex(contract)])),
  },
  dataHashes: Object.fromEntries(Object.entries(contracts).map(([name, contract]) => [name, dataHashHex(contract)])),
  allocationsRaw: {
    SeasonVault: SEASON_VAULT_ALLOCATION.toString(),
    PresaleVault: PRESALE_ALLOCATION.toString(),
    EcosystemTreasury: ECOSYSTEM_ALLOCATION.toString(),
    DevelopmentFund: DEVELOPMENT_FUND_ALLOCATION.toString(),
    TeamVesting: TEAM_VESTING_ALLOCATION.toString(),
    earlyUsersWallet: EARLY_USERS_ALLOCATION.toString(),
  },
  seasonRewards: {
    sourceApp: 'multi-millionaire',
    displayApp: '/Users/yudeyou/Desktop/72',
    maxSeasons: MAX_SEASONS.toString(),
    roundsPerSeason: ROUNDS_PER_SEASON.toString(),
    roundRewardRaw: ROUND_AMOUNT.toString(),
    seasonFinalization: 'Successful rounds accrue inside SeasonVault and are transferred to SeasonClaimV2 only after the 18-round season is finalized.',
    claimMode: 'SeasonClaimV2 stores one Merkle root per season. Leaves are generated by multi-millionaire with personal/team/referral/leaderboard amounts.',
    poolBps: {
      personalDeposit: PERSONAL_DEPOSIT_BPS.toString(),
      teamDeposit: TEAM_DEPOSIT_BPS.toString(),
      referral: REFERRAL_BPS.toString(),
      leaderboard: LEADERBOARD_BPS.toString(),
    },
    poolAmountsPerSuccessfulRoundRaw: {
      personalDeposit: ((ROUND_AMOUNT * PERSONAL_DEPOSIT_BPS) / 10000n).toString(),
      teamDeposit: ((ROUND_AMOUNT * TEAM_DEPOSIT_BPS) / 10000n).toString(),
      referral: ((ROUND_AMOUNT * REFERRAL_BPS) / 10000n).toString(),
      leaderboard: ((ROUND_AMOUNT * LEADERBOARD_BPS) / 10000n).toString(),
    },
  },
  presale: {
    tokensPerTonRaw: [
      PRESALE_STAGE_1_TOKENS_PER_TON.toString(),
      PRESALE_STAGE_2_TOKENS_PER_TON.toString(),
      PRESALE_STAGE_3_TOKENS_PER_TON.toString(),
    ],
    walletCapRaw: PRESALE_WALLET_CAP.toString(),
    proceedsWallet: formatAddress(proceedsWallet),
    unsoldDestination: formatAddress(developmentFund.address),
  },
  v3Changes: {
    'price-hold': 'SeasonClaimV2, FundVesting, and TeamVesting price holds reduced from 72 hours to 1 hour (3600 seconds)',
    'files-modified': ['SeasonClaimV2.tact', 'SeasonClaim.tact', 'TeamVesting.tact', 'FundVesting.tact'],
    'ReserveVault': '72-day lock unchanged (not modified)',
    'forward-ton-amount': 'All Jetton transfer forward_ton_amount set > 0 (fixed from V2 where funded72H=0 root cause was PresaleVault forward_ton_amount=0)',
  },
  deploymentOrder: [
    'Deploy V3 Jetton master: ' + formatAddress(masterAddress) + '.',
    'Mint fixed V3 total supply to the initial supply owner.',
    'Drop V3 Jetton master admin and verify totalSupply=100000000000000000000, mintable=false, admin=null, wallet code hash matches this plan.',
    'Deploy SeasonVault, SeasonClaimV2, FundVesting, DevelopmentFund, PresaleVault, EcosystemTreasury, TeamVesting against the V3 Jetton master.',
    'Set each contract official V3 Jetton wallet using the derived contractJettonWallets values.',
    'Set post-deploy routes: SeasonVault -> SeasonClaimV2/FundVesting, SeasonClaimV2 -> SeasonVault, FundVesting -> SeasonVault.',
    'Transfer fixed allocations from initialSupplyOwnerJettonWallet with forward_ton_amount > 0.',
    'For each completed season, record all 18 rounds, finalize successful-round inventory to SeasonClaimV2, then register the multi-millionaire Merkle root.',
    'Keep presale inactive until a separate launch approval transaction.',
  ],
  blockersBeforeSend: [
    'Independent TON/Tact audit must be completed and fixes must be retested.',
    'V3 package must deploy a new Jetton master and all tokenomics contract addresses must differ from V2.',
    'Mainnet TonConnect/send package for this V3 tokenomics plan must be generated from this exact JSON.',
    'All addresses and code/data hashes must be signed off manually before Tonkeeper confirmation.',
    'No mainnet transaction should be sent from this script; it is dry-run only.',
  ],
};

const directory = resolve(process.cwd(), 'deployments', 'v3-mainnet');
mkdirSync(directory, { recursive: true });
const outputPath = resolve(directory, '72h-v3-tokenomics.mainnet.plan.json');
writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);

console.log('72H V3 tokenomics mainnet dry-run plan generated.');
console.log(`Admin: ${plan.admin}`);
console.log(`V3 Jetton master (NEW): ${plan.jettonMaster}`);
console.log(`SeasonVault (NEW): ${plan.contracts.SeasonVault}`);
console.log(`PresaleVault (NEW): ${plan.contracts.PresaleVault}`);
console.log(`Plan: ${outputPath}`);
