import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, type Cell } from '@ton/core';
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

type JettonV2Plan = {
  readonly token: {
    readonly metadataUri: string;
  };
  readonly addresses: {
    readonly admin: string;
    readonly initialSupplyOwner: string;
    readonly jettonMinter: string;
  };
  readonly codeHashes: {
    readonly minterHex: string;
    readonly walletHex: string;
  };
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

function readJettonV2MainnetPlan() {
  const path = resolve(process.cwd(), 'deployments/jetton-v2.mainnet.plan.json');
  if (!existsSync(path)) {
    throw new Error('Missing deployments/jetton-v2.mainnet.plan.json. Run npm run jetton-v2:plan:mainnet first.');
  }
  return JSON.parse(readFileSync(path, 'utf8')) as JettonV2Plan;
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

const loadedEnvFiles = loadLocalEnv();
const compiled = await compileJettonV2();
const jettonPlan = readJettonV2MainnetPlan();
if (jettonPlan.codeHashes.walletHex !== compiled.wallet.codeHashHex) {
  throw new Error('V2 wallet code hash in deployments/jetton-v2.mainnet.plan.json does not match local build.');
}
if (jettonPlan.codeHashes.minterHex !== compiled.minter.codeHashHex) {
  throw new Error('V2 minter code hash in deployments/jetton-v2.mainnet.plan.json does not match local build.');
}

const admin = Address.parse(optionalEnv('TON_V2_TOKENOMICS_ADMIN_ADDRESS') ?? optionalEnv('TON_V2_ADMIN_ADDRESS') ?? optionalEnv('TON_MAINNET_DEPLOYER_ADDRESS') ?? DEFAULT_MAINNET_ADMIN);
const initialSupplyOwner = Address.parse(jettonPlan.addresses.initialSupplyOwner);
if (!initialSupplyOwner.equals(admin)) {
  throw new Error(`V2 initial supply owner ${formatAddress(initialSupplyOwner)} must equal tokenomics admin ${formatAddress(admin)} for the allocation runbook.`);
}

const masterAddress = Address.parse(jettonPlan.addresses.jettonMinter);
const developmentFundWallet = Address.parse(optionalEnv('TON_V2_DEVELOPMENT_FUND_WALLET_ADDRESS') ?? DEFAULT_DEVELOPMENT_FUND_WALLET);
const teamWallet = Address.parse(optionalEnv('TON_V2_TEAM_WALLET_ADDRESS') ?? DEFAULT_TEAM_WALLET);
const proceedsWallet = Address.parse(optionalEnv('TON_V2_PRESALE_PROCEEDS_WALLET_ADDRESS') ?? DEFAULT_PROCEEDS_WALLET);
const earlyUsersWallet = Address.parse(optionalEnv('TON_V2_EARLY_USERS_WALLET_ADDRESS') ?? DEFAULT_EARLY_USERS_WALLET);
const placeholder = admin;

const [
  SeasonVault,
  SeasonClaim,
  FundVesting,
  DevelopmentFund,
  PresaleVault,
  EcosystemTreasury,
  TeamVesting,
] = await Promise.all([
  loadGeneratedContract('build/tact/SeasonVault/SeasonVault_SeasonVault.js', 'SeasonVault'),
  loadGeneratedContract('build/tact/SeasonClaim/SeasonClaim_SeasonClaim.js', 'SeasonClaim'),
  loadGeneratedContract('build/tact/FundVesting/FundVesting_FundVesting.js', 'FundVesting'),
  loadGeneratedContract('build/tact/DevelopmentFund/DevelopmentFund_DevelopmentFund.js', 'DevelopmentFund'),
  loadGeneratedContract('build/tact/PresaleVault/PresaleVault_PresaleVault.js', 'PresaleVault'),
  loadGeneratedContract('build/tact/EcosystemTreasury/EcosystemTreasury_EcosystemTreasury.js', 'EcosystemTreasury'),
  loadGeneratedContract('build/tact/TeamVesting/TeamVesting_TeamVesting.js', 'TeamVesting'),
]);

const developmentFund = await DevelopmentFund.fromInit(admin, masterAddress, placeholder);
const fundVesting = await FundVesting.fromInit(admin, masterAddress, placeholder, placeholder, developmentFundWallet);
const seasonClaim = await SeasonClaim.fromInit(admin, masterAddress, placeholder, placeholder);
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
  SeasonClaim: seasonClaim,
  FundVesting: fundVesting,
  DevelopmentFund: developmentFund,
  PresaleVault: presaleVault,
  EcosystemTreasury: ecosystemTreasury,
  TeamVesting: teamVesting,
};

const plan = {
  generatedAt: new Date().toISOString(),
  network: 'mainnet',
  mode: 'dry-run',
  loadedEnvFiles,
  jettonPlan: 'deployments/jetton-v2.mainnet.plan.json',
  admin: formatAddress(admin),
  jettonMaster: formatAddress(masterAddress),
  metadataUri: jettonPlan.token.metadataUri,
  supplyRaw: H72H_V2_TOTAL_SUPPLY.toString(),
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
    seasonFinalization: 'Successful rounds accrue inside SeasonVault and are transferred to SeasonClaim only after the 18-round season is finalized.',
    claimMode: 'SeasonClaim stores one Merkle root per season. Leaves are generated by multi-millionaire with personal/team/referral/leaderboard amounts.',
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
  deploymentOrder: [
    'Deploy V2 Jetton master from deployments/jetton-v2.mainnet.plan.json.',
    'Verify V2 getter: totalSupply=100000000000000000000, mintable=false, admin=null, wallet code hash matches this plan.',
    'Deploy SeasonVault, SeasonClaim, FundVesting, DevelopmentFund, PresaleVault, EcosystemTreasury, TeamVesting.',
    'Set each contract official V2 Jetton wallet using the derived contractJettonWallets values.',
    'Set post-deploy routes: SeasonVault -> SeasonClaim/FundVesting, SeasonClaim -> SeasonVault, FundVesting -> SeasonVault.',
    'Transfer fixed allocations from initialSupplyOwnerJettonWallet.',
    'For each completed season, record all 18 rounds, finalize successful-round inventory to SeasonClaim, then register the multi-millionaire Merkle root.',
    'Keep presale inactive until a separate launch approval transaction.',
  ],
  blockersBeforeSend: [
    'Independent TON/Tact audit must be completed and fixes must be retested.',
    'Mainnet TonConnect/send package for this V2 tokenomics plan must be generated from this exact JSON.',
    'All addresses and code/data hashes must be signed off manually before Tonkeeper confirmation.',
    'No mainnet transaction should be sent from this script; it is dry-run only.',
  ],
};

const directory = resolve(process.cwd(), 'deployments');
mkdirSync(directory, { recursive: true });
const outputPath = resolve(directory, '72h-v2-tokenomics.mainnet.plan.json');
writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);

console.log('72H V2 tokenomics mainnet dry-run plan generated.');
console.log(`Admin: ${plan.admin}`);
console.log(`V2 Jetton master: ${plan.jettonMaster}`);
console.log(`SeasonVault: ${plan.contracts.SeasonVault}`);
console.log(`PresaleVault: ${plan.contracts.PresaleVault}`);
console.log(`Plan: ${outputPath}`);
