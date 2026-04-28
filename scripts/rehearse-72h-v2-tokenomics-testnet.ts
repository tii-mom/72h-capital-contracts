import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, beginCell, fromNano, internal, toNano, type Cell } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, TonClient4, WalletContractV4, type TonClientParameters } from '@ton/ton';
import {
  compileJettonV2,
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
const SEASON_ROUNDS = 18n;
const SUCCESSFUL_REHEARSAL_ROUNDS = 17n;
const SEASON_SUCCESS_AMOUNT = SUCCESSFUL_REHEARSAL_ROUNDS * ROUND_AMOUNT;
const SEASON_PERSONAL_DEPOSIT_AMOUNT = (SEASON_SUCCESS_AMOUNT * 5000n) / 10000n;
const SEASON_TEAM_DEPOSIT_AMOUNT = (SEASON_SUCCESS_AMOUNT * 2500n) / 10000n;
const SEASON_REFERRAL_AMOUNT = (SEASON_SUCCESS_AMOUNT * 1500n) / 10000n;
const SEASON_LEADERBOARD_AMOUNT = (SEASON_SUCCESS_AMOUNT * 1000n) / 10000n;
const ONE_72H = SCALE;
const PRESALE_STAGE_1_TOKENS_PER_TON = 10_072n * SCALE;
const PRESALE_STAGE_2_TOKENS_PER_TON = 7_200n * SCALE;
const PRESALE_STAGE_3_TOKENS_PER_TON = 3_500n * SCALE;
const PRESALE_WALLET_CAP = 7_200_000n * SCALE;
const DEFAULT_DEVELOPMENT_FUND_WALLET = 'UQB31HYfGtzDDa-cudZolA6g1gNcoxZsxeQoEM4lmhhuo5Bu';
const DEFAULT_TEAM_WALLET = 'UQDqA19b4tBQKi7Z_0NS08eWzq-FZ-wsRU4QfzEEKwcoucjV';
const DEFAULT_PROCEEDS_WALLET = 'UQBGY56JY9gy1V-vnnyOpGoJXLWAcm3LKNAdl9OKShuCe7QA';
const DEFAULT_EARLY_USERS_WALLET = 'UQDqA19b4tBQKi7Z_0NS08eWzq-FZ-wsRU4QfzEEKwcoucjV';
const POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 5_000;

type GeneratedContract = {
  readonly address: Address;
  readonly init?: { readonly code: Cell; readonly data: Cell };
};

type GeneratedContractClass = {
  fromInit: (...args: any[]) => Promise<GeneratedContract>;
};

type JettonV2Manifest = {
  readonly jettonMaster: string;
  readonly initialSupplyOwner: string;
  readonly metadataUri: string;
  readonly codeHashes: {
    readonly minterHex: string;
    readonly walletHex: string;
  };
  readonly finalGetter?: {
    readonly totalSupplyRaw: string;
    readonly mintable: boolean;
    readonly adminAddress: string | null;
    readonly walletCodeHashHex: string;
  };
};

type JettonV2Plan = {
  readonly token: {
    readonly metadataUri: string;
  };
  readonly addresses: {
    readonly initialSupplyOwner: string;
    readonly jettonMinter: string;
  };
  readonly codeHashes: {
    readonly minterHex: string;
    readonly walletHex: string;
  };
  readonly expectedFinalGetter: JettonV2Manifest['finalGetter'];
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

function requireEnv(name: string) {
  const value = optionalEnv(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optionalIntegerEnv(name: string) {
  const value = optionalEnv(name);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffffffff) {
    throw new Error(`${name} must be a uint32 integer.`);
  }
  return parsed;
}

function createClient(endpoint: string) {
  const useV4 = optionalEnv('TON_TESTNET_USE_V4_RPC') !== 'false';
  const v4Endpoint = useV4 ? optionalEnv('TON_TESTNET_RPC_V4_URL') ?? 'https://testnet-v4.tonhubapi.com' : undefined;
  if (v4Endpoint) {
    return new TonClient4({ endpoint: v4Endpoint, timeout: 20_000 });
  }
  const apiKey = optionalEnv('TON_TESTNET_RPC_API_KEY') ?? optionalEnv('TON_TESTNET_API_KEY') ?? optionalEnv('TONCENTER_API_KEY');
  const parameters: TonClientParameters = { endpoint, timeout: 20_000 };
  if (apiKey) parameters.apiKey = apiKey;
  return new TonClient(parameters);
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableRpcError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('429') ||
    message.includes('500') ||
    message.includes('internal error') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('socket') ||
    message.includes('network')
  );
}

async function withRpcRetry<T>(label: string, operation: () => Promise<T>, attempts = 6) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableRpcError(error) || attempt === attempts) break;
      await sleep(attempt * 30_000);
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${getErrorMessage(lastError)}`);
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

function readJettonContext(requireLatest: boolean): JettonV2Manifest & { readonly source: 'latest' | 'plan' } {
  const latestPath = resolve(process.cwd(), 'deployments/jetton-v2.testnet.latest.json');
  if (existsSync(latestPath)) {
    return { ...(JSON.parse(readFileSync(latestPath, 'utf8')) as JettonV2Manifest), source: 'latest' };
  }

  if (requireLatest) {
    throw new Error('Missing deployments/jetton-v2.testnet.latest.json. Run npm run jetton-v2:deploy:testnet:send first.');
  }

  const planPath = resolve(process.cwd(), 'deployments/jetton-v2.testnet.plan.json');
  if (!existsSync(planPath)) {
    throw new Error('Missing deployments/jetton-v2.testnet.plan.json. Run npm run jetton-v2:plan:testnet first.');
  }
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as JettonV2Plan;
  const context: JettonV2Manifest & { readonly source: 'latest' | 'plan' } = {
    source: 'plan',
    jettonMaster: plan.addresses.jettonMinter,
    initialSupplyOwner: plan.addresses.initialSupplyOwner,
    metadataUri: plan.token.metadataUri,
    codeHashes: {
      minterHex: plan.codeHashes.minterHex,
      walletHex: plan.codeHashes.walletHex,
    },
  };
  if (plan.expectedFinalGetter) {
    return { ...context, finalGetter: plan.expectedFinalGetter };
  }
  return context;
}

function formatAddress(address: Address) {
  return address.toString({ testOnly: true });
}

function evidenceHash(label: string) {
  return BigInt(`0x${createHash('sha256').update(label).digest('hex')}`);
}

function seasonRewardLeafHash(jettonMaster: Address, seasonClaim: Address, seasonId: bigint, account: Address) {
  return BigInt(
    `0x${beginCell()
      .storeUint(1n, 32)
      .storeRef(beginCell().storeAddress(jettonMaster).storeAddress(seasonClaim).endCell())
      .storeRef(beginCell()
        .storeUint(seasonId, 8)
        .storeAddress(account)
        .storeCoins(SEASON_PERSONAL_DEPOSIT_AMOUNT)
        .storeCoins(SEASON_TEAM_DEPOSIT_AMOUNT)
        .storeCoins(SEASON_REFERRAL_AMOUNT)
        .storeCoins(SEASON_LEADERBOARD_AMOUNT)
        .storeCoins(SEASON_SUCCESS_AMOUNT)
        .endCell())
      .endCell()
      .hash()
      .toString('hex')}`,
  );
}

function assertEqual(label: string, actual: bigint | string | boolean | null, expected: bigint | string | boolean | null) {
  if (actual !== expected) {
    throw new Error(`${label} expected ${String(expected)}, got ${String(actual)}.`);
  }
}

async function getWalletSeqno(client: TonClient | TonClient4, wallet: WalletContractV4) {
  return withRpcRetry('wallet seqno', () => wallet.getSeqno(client.provider(wallet.address, wallet.init)));
}

async function waitForSeqnoIncrease(client: TonClient | TonClient4, wallet: WalletContractV4, previousSeqno: number) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const seqno = await getWalletSeqno(client, wallet);
    if (seqno > previousSeqno) return seqno;
  }
  throw new Error(`Wallet seqno did not increase from ${previousSeqno}.`);
}

async function waitForValue<T>(label: string, read: () => Promise<T>, accept: (value: T) => boolean) {
  let lastValue: T | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    try {
      lastValue = await read();
      if (accept(lastValue)) return lastValue;
    } catch (error) {
      lastError = error;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`${label} did not reach expected state. Last value=${String(lastValue)} error=${lastError ? getErrorMessage(lastError) : 'none'}`);
}

const loadedEnvFiles = loadLocalEnv();
const send = process.argv.includes('--send');
const allowSend = optionalEnv('TON_TESTNET_ALLOW_72H_V2_TOKENOMICS_REHEARSAL_SEND') === 'true';
const endpoint = requireEnv('TON_TESTNET_RPC_URL');
const mnemonic = requireEnv('TON_TESTNET_DEPLOYER_MNEMONIC');
const keyPair = await mnemonicToPrivateKey(mnemonic.split(/\s+/).filter(Boolean));
const walletId = optionalIntegerEnv('TON_TESTNET_DEPLOYER_WALLET_ID');
const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0, walletId });
const configuredDeployer = Address.parse(requireEnv('TON_TESTNET_DEPLOYER_ADDRESS'));
if (!wallet.address.equals(configuredDeployer)) {
  throw new Error(`Derived Wallet V4 ${formatAddress(wallet.address)} does not match TON_TESTNET_DEPLOYER_ADDRESS ${formatAddress(configuredDeployer)}.`);
}

const manifest = readJettonContext(send);
const masterAddress = Address.parse(manifest.jettonMaster);
const initialSupplyOwner = Address.parse(manifest.initialSupplyOwner);
if (!initialSupplyOwner.equals(wallet.address)) {
  throw new Error(`Initial supply owner ${formatAddress(initialSupplyOwner)} must match deployer ${formatAddress(wallet.address)} for this rehearsal.`);
}

const compiled = await compileJettonV2();
if (manifest.codeHashes.walletHex !== compiled.wallet.codeHashHex) {
  throw new Error('V2 wallet code hash in manifest does not match local build.');
}

const client = createClient(endpoint);
const minter = client.open(JettonMinterV2.createFromAddress(masterAddress));
if (send) {
  const masterData = await withRpcRetry('V2 final getter', () => minter.getJettonData(), 8);
  const masterWalletCodeHash = masterData.walletCode.hash().toString('hex');
  assertEqual('V2 totalSupplyRaw', masterData.totalSupply.toString(), H72H_V2_TOTAL_SUPPLY.toString());
  assertEqual('V2 mintable', masterData.mintable, false);
  assertEqual('V2 adminAddress', masterData.adminAddress?.toString({ testOnly: true }) ?? null, null);
  assertEqual('V2 wallet code hash', masterWalletCodeHash, compiled.wallet.codeHashHex);
}

const developmentFundWallet = Address.parse(optionalEnv('TON_V2_DEVELOPMENT_FUND_WALLET_ADDRESS') ?? DEFAULT_DEVELOPMENT_FUND_WALLET);
const teamWallet = Address.parse(optionalEnv('TON_V2_TEAM_WALLET_ADDRESS') ?? DEFAULT_TEAM_WALLET);
const proceedsWallet = Address.parse(optionalEnv('TON_V2_PRESALE_PROCEEDS_WALLET_ADDRESS') ?? DEFAULT_PROCEEDS_WALLET);
const earlyUsersWallet = Address.parse(optionalEnv('TON_V2_EARLY_USERS_WALLET_ADDRESS') ?? DEFAULT_EARLY_USERS_WALLET);
const placeholder = wallet.address;

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

const developmentFund = await DevelopmentFund.fromInit(wallet.address, masterAddress, placeholder);
const fundVesting = await FundVesting.fromInit(wallet.address, masterAddress, placeholder, placeholder, developmentFundWallet);
const seasonClaim = await SeasonClaim.fromInit(wallet.address, masterAddress, placeholder, placeholder);
const teamVesting = await TeamVesting.fromInit(wallet.address, masterAddress, placeholder, teamWallet);
const ecosystemTreasury = await EcosystemTreasury.fromInit(wallet.address, masterAddress, placeholder);
const presaleVault = await PresaleVault.fromInit(
  wallet.address,
  masterAddress,
  placeholder,
  proceedsWallet,
  developmentFund.address,
  PRESALE_STAGE_1_TOKENS_PER_TON,
  PRESALE_STAGE_2_TOKENS_PER_TON,
  PRESALE_STAGE_3_TOKENS_PER_TON,
  PRESALE_WALLET_CAP,
);
const seasonVault = await SeasonVault.fromInit(wallet.address, masterAddress, placeholder, seasonClaim.address, fundVesting.address);

const ownerJettonWallet = JettonWalletV2.createFromConfig(
  { ownerAddress: wallet.address, jettonMasterAddress: masterAddress },
  compiled.wallet.code,
);

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

const jettonWallets = Object.fromEntries(
  Object.entries(contracts).map(([name, contract]) => [name, jettonWalletFor(contract.address).toString({ testOnly: true })]),
);

const plan = {
  generatedAt: new Date().toISOString(),
  network: 'testnet',
  loadedEnvFiles,
  mode: send ? 'send' : 'dry-run',
  jettonSource: manifest.source,
  deployer: formatAddress(wallet.address),
  deployerWalletId: wallet.walletId,
  jettonMaster: formatAddress(masterAddress),
  metadataUri: manifest.metadataUri,
  codeHashes: {
    minterHex: compiled.minter.codeHashHex,
    walletHex: compiled.wallet.codeHashHex,
    tokenomics: Object.fromEntries(
      Object.entries(contracts).map(([name, contract]) => [name, contract.init?.code.hash().toString('hex') ?? null]),
    ),
  },
  wallets: {
    ownerJettonWallet: formatAddress(ownerJettonWallet.address),
    developmentFundWallet: formatAddress(developmentFundWallet),
    teamWallet: formatAddress(teamWallet),
    proceedsWallet: formatAddress(proceedsWallet),
    earlyUsersWallet: formatAddress(earlyUsersWallet),
    contractJettonWallets: jettonWallets,
  },
  contracts: Object.fromEntries(Object.entries(contracts).map(([name, contract]) => [name, formatAddress(contract.address)])),
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
    roundsPerSeason: SEASON_ROUNDS.toString(),
    roundRewardRaw: ROUND_AMOUNT.toString(),
    poolAmountsPerSuccessfulRoundRaw: {
      personalDeposit: ((ROUND_AMOUNT * 5000n) / 10000n).toString(),
      teamDeposit: ((ROUND_AMOUNT * 2500n) / 10000n).toString(),
      referral: ((ROUND_AMOUNT * 1500n) / 10000n).toString(),
      leaderboard: ((ROUND_AMOUNT * 1000n) / 10000n).toString(),
    },
  },
  presale: {
    tokensPerTonRaw: [
      PRESALE_STAGE_1_TOKENS_PER_TON.toString(),
      PRESALE_STAGE_2_TOKENS_PER_TON.toString(),
      PRESALE_STAGE_3_TOKENS_PER_TON.toString(),
    ],
    walletCapRaw: PRESALE_WALLET_CAP.toString(),
  },
};

mkdirSync(resolve(process.cwd(), 'deployments'), { recursive: true });
writeFileSync(resolve(process.cwd(), 'deployments/72h-v2-tokenomics.testnet.plan.json'), `${JSON.stringify(plan, null, 2)}\n`);

console.log('72H V2 tokenomics testnet rehearsal');
console.log(`Deployer: ${formatAddress(wallet.address)}`);
console.log(`V2 Jetton master: ${formatAddress(masterAddress)}`);
console.log(`SeasonVault: ${formatAddress(seasonVault.address)}`);
console.log(`PresaleVault: ${formatAddress(presaleVault.address)}`);
console.log(`Send mode: ${send ? 'requested' : 'dry-run'}`);

if (!send) {
  console.log('No transactions sent. Re-run with --send and TON_TESTNET_ALLOW_72H_V2_TOKENOMICS_REHEARSAL_SEND=true to execute on testnet.');
  process.exit(0);
}

if (!allowSend) {
  throw new Error('Refusing to send. Set TON_TESTNET_ALLOW_72H_V2_TOKENOMICS_REHEARSAL_SEND=true and pass --send.');
}

async function getContractState(address: Address) {
  if (client instanceof TonClient) {
    return client.getContractState(address);
  }
  const lastBlock = await client.getLastBlock();
  const account = await client.getAccount(lastBlock.last.seqno, address);
  return {
    state: account.account.state.type,
    balance: BigInt(account.account.balance.coins),
  };
}

async function getBalance(address: Address) {
  if (client instanceof TonClient) {
    return client.getBalance(address);
  }
  const lastBlock = await client.getLastBlock();
  const account = await client.getAccount(lastBlock.last.seqno, address);
  return BigInt(account.account.balance.coins);
}

const walletBalance = await withRpcRetry('wallet balance', () => getBalance(wallet.address));
console.log(`Deployer balance: ${fromNano(walletBalance)} TON`);

const opened = {
  SeasonVault: client.open(seasonVault as any) as any,
  SeasonClaim: client.open(seasonClaim as any) as any,
  FundVesting: client.open(fundVesting as any) as any,
  DevelopmentFund: client.open(developmentFund as any) as any,
  PresaleVault: client.open(presaleVault as any) as any,
  EcosystemTreasury: client.open(ecosystemTreasury as any) as any,
  TeamVesting: client.open(teamVesting as any) as any,
};

const sender = wallet.sender(client.provider(wallet.address, wallet.init), keyPair.secretKey);
const actions: { label: string; seqnoBefore: number; seqnoAfter: number; at: string }[] = [];
let queryId = BigInt(Date.now()) * 1000n;
const nextQueryId = () => {
  queryId += 1n;
  return queryId;
};

async function sendOpened(label: string, contract: { send: (...args: any[]) => Promise<unknown> }, message: unknown, value = toNano('0.12')) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const seqno = await getWalletSeqno(client, wallet);
    console.log(`Sending ${label}; seqno=${seqno}`);
    try {
      await contract.send(sender, { value, bounce: true }, message);
    } catch (error) {
      lastError = error;
      const currentSeqno = await getWalletSeqno(client, wallet);
      if (currentSeqno > seqno) {
        actions.push({ label, seqnoBefore: seqno, seqnoAfter: currentSeqno, at: new Date().toISOString() });
        return;
      }
      if (!isRetryableRpcError(error) || attempt === 8) break;
      await sleep(attempt * 5_000);
      continue;
    }
    const nextSeqno = await waitForSeqnoIncrease(client, wallet, seqno);
    actions.push({ label, seqnoBefore: seqno, seqnoAfter: nextSeqno, at: new Date().toISOString() });
    await sleep(10_000);
    return;
  }
  throw lastError;
}

async function sendInternalMessage(label: string, to: Address, value: bigint, body: Cell) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const seqno = await getWalletSeqno(client, wallet);
    console.log(`Sending ${label}; seqno=${seqno}`);
    const transfer = wallet.createTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to,
          value,
          bounce: true,
          body,
        }),
      ],
    });
    try {
      await wallet.send(client.provider(wallet.address, wallet.init), transfer);
    } catch (error) {
      lastError = error;
      const currentSeqno = await getWalletSeqno(client, wallet);
      if (currentSeqno > seqno) {
        actions.push({ label, seqnoBefore: seqno, seqnoAfter: currentSeqno, at: new Date().toISOString() });
        return;
      }
      if (!isRetryableRpcError(error) || attempt === 8) break;
      await sleep(attempt * 5_000);
      continue;
    }
    const nextSeqno = await waitForSeqnoIncrease(client, wallet, seqno);
    actions.push({ label, seqnoBefore: seqno, seqnoAfter: nextSeqno, at: new Date().toISOString() });
    await sleep(10_000);
    return;
  }
  throw new Error(`${label} failed: ${getErrorMessage(lastError)}`);
}

async function deployContract(label: keyof typeof contracts) {
  const state = await withRpcRetry(`${label} state`, () => getContractState(contracts[label].address));
  if (state.state === 'active') {
    console.log(`${label} already active; skipping deploy.`);
    return;
  }
  await sendOpened(`deploy ${label}`, opened[label] as never, null, toNano('0.12'));
  await waitForValue(`${label} active`, () => getContractState(contracts[label].address), (value) => value.state === 'active');
}

async function transferJettons(label: string, destination: Address, amount: bigint, forwardTonAmount = toNano('0.03')) {
  await sendInternalMessage(
    label,
    ownerJettonWallet.address,
    toNano('0.25'),
    JettonWalletV2.transferMessage({
      queryId: nextQueryId(),
      jettonAmount: amount,
      to: destination,
      responseAddress: wallet.address,
      forwardTonAmount,
    }),
  );
}

async function getJettonBalance(owner: Address) {
  return client.open(JettonWalletV2.createFromAddress(jettonWalletFor(owner))).getJettonBalance();
}

async function getJettonBalanceOrZero(owner: Address) {
  const jettonWalletAddress = jettonWalletFor(owner);
  const state = await withRpcRetry('jetton wallet state', () => getContractState(jettonWalletAddress));
  if (state.state !== 'active') return 0n;
  return getJettonBalance(owner);
}

async function sendOpenedUnless(
  label: string,
  isComplete: () => Promise<boolean>,
  contract: { send: (...args: any[]) => Promise<unknown> },
  message: unknown,
  value = toNano('0.12'),
) {
  if (await withRpcRetry(`${label} completion check`, isComplete, 8)) {
    console.log(`${label} already complete; skipping.`);
    return;
  }
  await sendOpened(label, contract, message, value);
}

async function transferJettonsToTarget(
  label: string,
  destination: Address,
  targetAmount: bigint,
  readCurrentAmount: () => Promise<bigint>,
  forwardTonAmount = toNano('0.03'),
) {
  const currentAmount = await withRpcRetry(`${label} current amount`, readCurrentAmount);
  if (currentAmount >= targetAmount) {
    console.log(`${label} already complete; skipping.`);
    return;
  }
  await transferJettons(label, destination, targetAmount - currentAmount, forwardTonAmount);
  await waitForValue(label, readCurrentAmount, (value) => value === targetAmount);
}

for (const label of Object.keys(contracts) as (keyof typeof contracts)[]) {
  await deployContract(label);
}

await sendOpenedUnless(
  'set SeasonVault jetton wallet',
  async () => (await opened.SeasonVault.getGetFunded72H()) > 0n || (await opened.SeasonVault.getGetAllocated72H()) > 0n,
  opened.SeasonVault as never,
  {
    $$type: 'SetSeasonVaultJettonWallet',
    wallet: jettonWalletFor(seasonVault.address),
  },
);
await sendOpenedUnless(
  'set SeasonClaim jetton wallet',
  async () => (await opened.SeasonClaim.getGetFunded72H()) > 0n || (await opened.SeasonClaim.getGetReserved72H()) > 0n || (await opened.SeasonClaim.getGetClaimed72H()) > 0n,
  opened.SeasonClaim as never,
  {
    $$type: 'SetSeasonClaimJettonWallet',
    wallet: jettonWalletFor(seasonClaim.address),
  },
);
await sendOpenedUnless(
  'set FundVesting jetton wallet',
  async () => (await opened.FundVesting.getGetFunded72H()) > 0n || (await opened.FundVesting.getGetWithdrawn72H()) > 0n,
  opened.FundVesting as never,
  {
    $$type: 'SetFundJettonWallet',
    wallet: jettonWalletFor(fundVesting.address),
  },
);
await sendOpenedUnless(
  'set DevelopmentFund jetton wallet',
  async () => (await opened.DevelopmentFund.getGetFunded72H()) > 0n || (await opened.DevelopmentFund.getGetWithdrawn72H()) > 0n,
  opened.DevelopmentFund as never,
  {
    $$type: 'SetDevelopmentFundJettonWallet',
    wallet: jettonWalletFor(developmentFund.address),
  },
);
await sendOpenedUnless(
  'set PresaleVault jetton wallet',
  async () => (await opened.PresaleVault.getIsActive()) || (await opened.PresaleVault.getGetFunded72H()) > 0n || (await opened.PresaleVault.getGetSold72H()) > 0n,
  opened.PresaleVault as never,
  {
    $$type: 'SetPresaleJettonWallet',
    wallet: jettonWalletFor(presaleVault.address),
  },
);
await sendOpenedUnless(
  'set EcosystemTreasury jetton wallet',
  async () => (await opened.EcosystemTreasury.getGetFunded72H()) > 0n || (await opened.EcosystemTreasury.getGetReleased72H()) > 0n,
  opened.EcosystemTreasury as never,
  {
    $$type: 'SetEcosystemJettonWallet',
    wallet: jettonWalletFor(ecosystemTreasury.address),
  },
);
await sendOpenedUnless(
  'set TeamVesting jetton wallet',
  async () => (await opened.TeamVesting.getGetFunded72H()) > 0n || (await opened.TeamVesting.getGetReleased72H()) > 0n,
  opened.TeamVesting as never,
  {
    $$type: 'SetTeamJettonWallet',
    wallet: jettonWalletFor(teamVesting.address),
  },
);
await sendOpenedUnless(
  'set SeasonVault routes',
  async () => (await opened.SeasonVault.getGetFunded72H()) > 0n || (await opened.SeasonVault.getGetAllocated72H()) > 0n,
  opened.SeasonVault as never,
  {
    $$type: 'SetSeasonVaultRoutes',
    claimContract: seasonClaim.address,
    fundVestingContract: fundVesting.address,
  },
);
await sendOpenedUnless(
  'set SeasonClaim season vault',
  async () => (await opened.SeasonClaim.getGetFunded72H()) > 0n || (await opened.SeasonClaim.getGetReserved72H()) > 0n || (await opened.SeasonClaim.getGetClaimed72H()) > 0n,
  opened.SeasonClaim as never,
  {
    $$type: 'SetSeasonClaimSeasonVault',
    seasonVault: seasonVault.address,
  },
);
await sendOpenedUnless(
  'set FundVesting season vault',
  async () => (await opened.FundVesting.getGetFunded72H()) > 0n || (await opened.FundVesting.getGetWithdrawn72H()) > 0n,
  opened.FundVesting as never,
  {
    $$type: 'SetFundSeasonVault',
    seasonVault: seasonVault.address,
  },
);

await transferJettonsToTarget('allocate SeasonVault 90B', seasonVault.address, SEASON_VAULT_ALLOCATION, () => opened.SeasonVault.getGetFunded72H() as Promise<bigint>);
await transferJettonsToTarget('allocate PresaleVault 4.5B', presaleVault.address, PRESALE_ALLOCATION, () => opened.PresaleVault.getGetFunded72H() as Promise<bigint>);
await transferJettonsToTarget('allocate EcosystemTreasury 4.5B', ecosystemTreasury.address, ECOSYSTEM_ALLOCATION, () => opened.EcosystemTreasury.getGetFunded72H() as Promise<bigint>);
await transferJettonsToTarget('allocate DevelopmentFund 0.5B', developmentFund.address, DEVELOPMENT_FUND_ALLOCATION, () => opened.DevelopmentFund.getGetFunded72H() as Promise<bigint>);
await transferJettonsToTarget('allocate TeamVesting 0.3B', teamVesting.address, TEAM_VESTING_ALLOCATION, () => opened.TeamVesting.getGetFunded72H() as Promise<bigint>);
await transferJettonsToTarget('allocate early users wallet 0.2B', earlyUsersWallet, EARLY_USERS_ALLOCATION, () => getJettonBalanceOrZero(earlyUsersWallet), 0n);

const presaleBuyTokens = PRESALE_STAGE_1_TOKENS_PER_TON;
await sendOpenedUnless(
  'open presale',
  async () => (await opened.PresaleVault.getIsActive()) || (await opened.PresaleVault.getGetSold72H()) >= presaleBuyTokens,
  opened.PresaleVault as never,
  { $$type: 'SetPresaleActive', active: true },
  toNano('0.06'),
);
await sendOpenedUnless(
  'buy presale stage 1 with 1 TON',
  async () => (await opened.PresaleVault.getGetSold72H()) >= presaleBuyTokens,
  opened.PresaleVault as never,
  {
    $$type: 'BuyPresale',
    queryId: nextQueryId(),
    stage: 1n,
    tonAmount: toNano('1'),
    minTokens72H: presaleBuyTokens,
  },
  toNano('1.2'),
);
await waitForValue('Presale sold', () => opened.PresaleVault.getGetSold72H() as Promise<bigint>, (value) => value === presaleBuyTokens);

const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
const oldObservation = nowSeconds - 72n * 60n * 60n - 300n;
const stageOneRoundAmount = (ROUND_AMOUNT * 2000n) / 10000n;
const stageOneSeasonClaimAmount = (SEASON_SUCCESS_AMOUNT * 2000n) / 10000n;
const stageOneTeamAmount = 100_000_000n * SCALE;
const ecosystemAppFunding = 10_000_000n * SCALE;
const developmentFundAfterSweep = DEVELOPMENT_FUND_ALLOCATION + ecosystemAppFunding + PRESALE_ALLOCATION - presaleBuyTokens;
const earlyUsersBalanceBeforeOrdinaryTransfer =
  EARLY_USERS_ALLOCATION +
  (teamWallet.equals(earlyUsersWallet) ? stageOneTeamAmount : 0n) +
  (developmentFundWallet.equals(earlyUsersWallet) ? ONE_72H : 0n);
await sendOpenedUnless(
  'record successful season round 1',
  async () => (await opened.SeasonVault.getGetHighestRecordedRoundId()) >= 1n,
  opened.SeasonVault as never,
  {
    $$type: 'RecordSeasonRound',
    roundId: 1n,
    startAt: oldObservation,
    endAt: oldObservation + 4n * 60n * 60n,
    startPriceUsd9: 10_000_000n,
    endPriceUsd9: 12_500_000n,
    success: true,
    evidenceHash: evidenceHash('testnet-round-1-success'),
  },
  toNano('0.2'),
);
await waitForValue('Season 1 claimable after round 1', () => opened.SeasonVault.getGetSeasonClaimable72H(1n) as Promise<bigint>, (value) => value >= ROUND_AMOUNT);

await sendOpenedUnless(
  'record failed season round 2',
  async () => (await opened.SeasonVault.getGetHighestRecordedRoundId()) >= 2n,
  opened.SeasonVault as never,
  {
    $$type: 'RecordSeasonRound',
    roundId: 2n,
    startAt: oldObservation + 4n * 60n * 60n,
    endAt: oldObservation + 8n * 60n * 60n,
    startPriceUsd9: 12_500_000n,
    endPriceUsd9: 13_000_000n,
    success: false,
    evidenceHash: evidenceHash('testnet-round-2-failure'),
  },
  toNano('0.2'),
);
await waitForValue('FundVesting funded after round 2', () => opened.FundVesting.getGetFunded72H() as Promise<bigint>, (value) => value === ROUND_AMOUNT);
await waitForValue('SeasonVault failed-round transfer settled', () => opened.SeasonVault.getGetPendingFundTransferCount() as Promise<bigint>, (value) => value === 0n);

for (let roundId = 3n; roundId <= SEASON_ROUNDS; roundId += 1n) {
  const roundStart = oldObservation + (roundId - 1n) * 4n * 60n * 60n;
  await sendOpenedUnless(
    `record successful season round ${roundId}`,
    async () => (await opened.SeasonVault.getGetHighestRecordedRoundId()) >= roundId,
    opened.SeasonVault as never,
    {
      $$type: 'RecordSeasonRound',
      roundId,
      startAt: roundStart,
      endAt: roundStart + 4n * 60n * 60n,
      startPriceUsd9: 10_000_000n,
      endPriceUsd9: 12_500_000n,
      success: true,
      evidenceHash: evidenceHash(`testnet-round-${roundId}-success`),
    },
    toNano('0.2'),
  );
}
await waitForValue('Season 1 successful reward inventory', () => opened.SeasonVault.getGetSeasonClaimable72H(1n) as Promise<bigint>, (value) => value === SEASON_SUCCESS_AMOUNT);
await sendOpenedUnless(
  'finalize season 1 rewards to SeasonClaim',
  async () => (await opened.SeasonVault.getGetSeasonFinalized72H(1n)) >= SEASON_SUCCESS_AMOUNT,
  opened.SeasonVault as never,
  {
    $$type: 'FinalizeSeasonRewards',
    queryId: nextQueryId(),
    seasonId: 1n,
    evidenceHash: evidenceHash('testnet-season-1-finalize'),
  },
  toNano('0.2'),
);
await waitForValue('SeasonClaim funded after season 1 finalization', () => opened.SeasonClaim.getGetFunded72H() as Promise<bigint>, (value) => value === SEASON_SUCCESS_AMOUNT);

const claimLeaf = seasonRewardLeafHash(masterAddress, seasonClaim.address, 1n, wallet.address);
await sendOpenedUnless(
  'register season claim 1',
  async () => (await opened.SeasonClaim.getGetReserved72H()) >= SEASON_SUCCESS_AMOUNT,
  opened.SeasonClaim as never,
  {
    $$type: 'RegisterSeasonClaim',
    seasonId: 1n,
    merkleRoot: claimLeaf,
    totalAmount72H: SEASON_SUCCESS_AMOUNT,
    personalDepositTotal72H: SEASON_PERSONAL_DEPOSIT_AMOUNT,
    teamDepositTotal72H: SEASON_TEAM_DEPOSIT_AMOUNT,
    referralTotal72H: SEASON_REFERRAL_AMOUNT,
    leaderboardTotal72H: SEASON_LEADERBOARD_AMOUNT,
    openAt: oldObservation,
    evidenceHash: evidenceHash('testnet-season-1-claim-root'),
  },
  toNano('0.12'),
);
await sendOpenedUnless(
  'unlock claim stage 1',
  async () => (await opened.SeasonClaim.getGetUnlockedBps()) >= 2000n,
  opened.SeasonClaim as never,
  {
    $$type: 'UnlockClaimStage',
    stage: 1n,
    priceUsd9: 10_000_000n,
    observedAt: oldObservation,
    evidenceHash: evidenceHash('testnet-claim-stage-1'),
  },
  toNano('0.12'),
);
await sendOpenedUnless(
  'claim season reward stage 1',
  async () => (await opened.SeasonClaim.getGetClaimed72H()) >= stageOneSeasonClaimAmount,
  opened.SeasonClaim as never,
  {
    $$type: 'ClaimSeasonReward',
    queryId: nextQueryId(),
    seasonId: 1n,
    personalDepositAmount72H: SEASON_PERSONAL_DEPOSIT_AMOUNT,
    teamDepositAmount72H: SEASON_TEAM_DEPOSIT_AMOUNT,
    referralAmount72H: SEASON_REFERRAL_AMOUNT,
    leaderboardAmount72H: SEASON_LEADERBOARD_AMOUNT,
    proof: beginCell().endCell(),
  },
  toNano('0.2'),
);
await waitForValue('SeasonClaim claimed', () => opened.SeasonClaim.getGetClaimed72H() as Promise<bigint>, (value) => value === stageOneSeasonClaimAmount);
await sendOpenedUnless(
  'unlock fund stage 1',
  async () => (await opened.FundVesting.getGetUnlockedBps()) >= 2000n,
  opened.FundVesting as never,
  {
    $$type: 'UnlockFundStage',
    stage: 1n,
    priceUsd9: 10_000_000n,
    observedAt: oldObservation,
    evidenceHash: evidenceHash('testnet-fund-stage-1'),
  },
  toNano('0.12'),
);
await sendOpenedUnless(
  'withdraw unlocked failed-round fund',
  async () => (await opened.FundVesting.getGetWithdrawn72H()) >= stageOneRoundAmount,
  opened.FundVesting as never,
  {
    $$type: 'WithdrawFund',
    queryId: nextQueryId(),
    amount72H: stageOneRoundAmount,
    purposeHash: evidenceHash('testnet-fund-withdraw-stage-1'),
  },
  toNano('0.2'),
);
await waitForValue('FundVesting withdrawn', () => opened.FundVesting.getGetWithdrawn72H() as Promise<bigint>, (value) => value === stageOneRoundAmount);

await sendOpenedUnless(
  'unlock team stage 1',
  async () => (await opened.TeamVesting.getGetReleased72H()) >= stageOneTeamAmount,
  opened.TeamVesting as never,
  {
    $$type: 'UnlockTeamStage',
    queryId: nextQueryId(),
    stage: 1n,
    priceUsd9: 100_000_000n,
    observedAt: oldObservation,
    evidenceHash: evidenceHash('testnet-team-stage-1'),
  },
  toNano('0.2'),
);
await waitForValue('TeamVesting released', () => opened.TeamVesting.getGetReleased72H() as Promise<bigint>, (value) => value === stageOneTeamAmount);

await sendOpenedUnless(
  'approve DevelopmentFund as ecosystem app',
  async () => (await opened.EcosystemTreasury.getGetReleased72H()) >= ecosystemAppFunding,
  opened.EcosystemTreasury as never,
  {
    $$type: 'ApproveEcosystemContract',
    appContract: developmentFund.address,
    approved: true,
    metadataHash: evidenceHash('testnet-development-fund-app'),
  },
  toNano('0.08'),
);
await sendOpenedUnless(
  'fund approved ecosystem app',
  async () => (await opened.EcosystemTreasury.getGetReleased72H()) >= ecosystemAppFunding,
  opened.EcosystemTreasury as never,
  {
    $$type: 'FundEcosystemContract',
    queryId: nextQueryId(),
    appContract: developmentFund.address,
    amount72H: ecosystemAppFunding,
    purposeHash: evidenceHash('testnet-ecosystem-funding'),
  },
  toNano('0.2'),
);
await waitForValue('EcosystemTreasury released', () => opened.EcosystemTreasury.getGetReleased72H() as Promise<bigint>, (value) => value === ecosystemAppFunding);

await sendOpenedUnless('close presale', async () => !(await opened.PresaleVault.getIsActive()), opened.PresaleVault as never, { $$type: 'SetPresaleActive', active: false }, toNano('0.06'));
await sendOpenedUnless(
  'sweep unsold presale to DevelopmentFund',
  async () => (await opened.DevelopmentFund.getGetFunded72H()) >= developmentFundAfterSweep,
  opened.PresaleVault as never,
  {
    $$type: 'SweepUnsoldPresale',
    queryId: nextQueryId(),
  },
  toNano('0.2'),
);
await waitForValue(
  'DevelopmentFund funded after ecosystem and presale sweep',
  () => opened.DevelopmentFund.getGetFunded72H() as Promise<bigint>,
  (value) => value === developmentFundAfterSweep,
);
await sendOpenedUnless(
  'withdraw unlocked DevelopmentFund inventory',
  async () => (await opened.DevelopmentFund.getGetWithdrawn72H()) >= ONE_72H,
  opened.DevelopmentFund as never,
  {
    $$type: 'WithdrawDevelopmentFund',
    queryId: nextQueryId(),
    amount72H: ONE_72H,
    destination: developmentFundWallet,
    purposeHash: evidenceHash('testnet-development-withdraw'),
  },
  toNano('0.2'),
);
await waitForValue('DevelopmentFund withdrawn', () => opened.DevelopmentFund.getGetWithdrawn72H() as Promise<bigint>, (value) => value === ONE_72H);

await transferJettonsToTarget('ordinary wallet transfer 1 72H', earlyUsersWallet, earlyUsersBalanceBeforeOrdinaryTransfer + ONE_72H, () => getJettonBalanceOrZero(earlyUsersWallet), 0n);
const burnTargetSupply = H72H_V2_TOTAL_SUPPLY - ONE_72H;
const supplyBeforeBurn = await withRpcRetry('V2 burn precheck getter', () => minter.getJettonData(), 8);
if (supplyBeforeBurn.totalSupply === burnTargetSupply) {
  console.log('burn 1 72H from deployer wallet already complete; skipping.');
} else {
  if (supplyBeforeBurn.totalSupply < burnTargetSupply) {
    throw new Error(`V2 total supply ${supplyBeforeBurn.totalSupply} is below burn target ${burnTargetSupply}.`);
  }
  await sendInternalMessage(
    'burn 1 72H from deployer wallet',
    ownerJettonWallet.address,
    toNano('0.12'),
    JettonWalletV2.burnMessage({
      queryId: nextQueryId(),
      jettonAmount: ONE_72H,
      responseAddress: wallet.address,
    }),
  );
}
await waitForValue('V2 total supply after test burn', () => withRpcRetry('V2 burn getter', () => minter.getJettonData(), 8), (value) => value.totalSupply === H72H_V2_TOTAL_SUPPLY - ONE_72H);

const finalGetter = {
  master: {
    ...(await withRpcRetry('V2 final evidence getter', () => minter.getJettonData(), 8)),
    content: undefined,
    walletCode: undefined,
  },
  SeasonVault: {
    funded72H: (await opened.SeasonVault.getGetFunded72H()).toString(),
    allocated72H: (await opened.SeasonVault.getGetAllocated72H()).toString(),
    userRewardAllocated72H: (await opened.SeasonVault.getGetUserRewardAllocated72H()).toString(),
    fundAllocated72H: (await opened.SeasonVault.getGetFundAllocated72H()).toString(),
    season1Claimable72H: (await opened.SeasonVault.getGetSeasonClaimable72H(1n)).toString(),
    season1Finalized72H: (await opened.SeasonVault.getGetSeasonFinalized72H(1n)).toString(),
  },
  SeasonClaim: {
    funded72H: (await opened.SeasonClaim.getGetFunded72H()).toString(),
    reserved72H: (await opened.SeasonClaim.getGetReserved72H()).toString(),
    claimed72H: (await opened.SeasonClaim.getGetClaimed72H()).toString(),
    season1Total72H: (await opened.SeasonClaim.getGetSeasonTotal(1n)).toString(),
    season1PersonalDepositTotal72H: (await opened.SeasonClaim.getGetSeasonPersonalDepositTotal(1n)).toString(),
    season1TeamDepositTotal72H: (await opened.SeasonClaim.getGetSeasonTeamDepositTotal(1n)).toString(),
    season1ReferralTotal72H: (await opened.SeasonClaim.getGetSeasonReferralTotal(1n)).toString(),
    season1LeaderboardTotal72H: (await opened.SeasonClaim.getGetSeasonLeaderboardTotal(1n)).toString(),
  },
  FundVesting: {
    funded72H: (await opened.FundVesting.getGetFunded72H()).toString(),
    withdrawn72H: (await opened.FundVesting.getGetWithdrawn72H()).toString(),
  },
  DevelopmentFund: {
    funded72H: (await opened.DevelopmentFund.getGetFunded72H()).toString(),
    withdrawn72H: (await opened.DevelopmentFund.getGetWithdrawn72H()).toString(),
  },
  PresaleVault: {
    funded72H: (await opened.PresaleVault.getGetFunded72H()).toString(),
    sold72H: (await opened.PresaleVault.getGetSold72H()).toString(),
  },
  EcosystemTreasury: {
    funded72H: (await opened.EcosystemTreasury.getGetFunded72H()).toString(),
    released72H: (await opened.EcosystemTreasury.getGetReleased72H()).toString(),
  },
  TeamVesting: {
    funded72H: (await opened.TeamVesting.getGetFunded72H()).toString(),
    released72H: (await opened.TeamVesting.getGetReleased72H()).toString(),
  },
};

const evidence = {
  ...plan,
  completedAt: new Date().toISOString(),
  actions,
  finalGetter: JSON.parse(JSON.stringify(finalGetter, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))),
};
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const timestampedPath = resolve(process.cwd(), `deployments/72h-v2-tokenomics.testnet.${timestamp}.json`);
const latestPath = resolve(process.cwd(), 'deployments/72h-v2-tokenomics.testnet.latest.json');
writeFileSync(timestampedPath, `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(latestPath, `${JSON.stringify(evidence, null, 2)}\n`);

console.log('72H V2 tokenomics testnet rehearsal completed.');
console.log(`Evidence: ${timestampedPath}`);
