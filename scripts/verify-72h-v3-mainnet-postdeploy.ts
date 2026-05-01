import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, Cell } from '@ton/core';
import { TonClient } from '@ton/ton';
import {
  compileJettonV2,
  H72H_V2_TOTAL_SUPPLY,
  JettonMinterV2,
  JettonWalletV2,
} from '../src/jetton-v2/index.js';

type ContractName =
  | 'SeasonVault'
  | 'SeasonClaimV2'
  | 'FundVesting'
  | 'DevelopmentFund'
  | 'PresaleVault'
  | 'EcosystemTreasury'
  | 'TeamVesting';

type TokenomicsPlan = {
  readonly network: string;
  readonly version: string;
  readonly admin: string;
  readonly jettonMaster: string;
  readonly metadataUri: string;
  readonly supplyRaw: string;
  readonly v3Jetton: {
    readonly expectedFinalGetter: {
      readonly totalSupplyRaw: string;
      readonly mintable: boolean;
      readonly adminAddress: string | null;
      readonly walletCodeHashHex: string;
    };
  };
  readonly wallets: {
    readonly earlyUsersWallet: string;
    readonly contractJettonWallets: Record<ContractName, string>;
  };
  readonly contracts: Record<ContractName, string>;
  readonly codeHashes: {
    readonly jettonMinterHex: string;
    readonly jettonWalletHex: string;
    readonly tokenomics: Record<ContractName, string>;
  };
  readonly allocationsRaw: Partial<Record<ContractName, string>> & Record<'earlyUsersWallet', string>;
  readonly seasonRewards: {
    readonly roundsPerSeason: string;
    readonly roundRewardRaw: string;
    readonly poolBps: {
      readonly personalDeposit: string;
      readonly teamDeposit: string;
      readonly referral: string;
      readonly leaderboard: string;
    };
    readonly poolAmountsPerSuccessfulRoundRaw: {
      readonly personalDeposit: string;
      readonly teamDeposit: string;
      readonly referral: string;
      readonly leaderboard: string;
    };
  };
  readonly presale: {
    readonly tokensPerTonRaw: readonly string[];
    readonly walletCapRaw: string;
  };
};

type DeployedContractSnapshot = {
  readonly address: string;
  readonly state: string;
  readonly codeHashHex: string | null;
  readonly funded72H?: string;
  readonly extra?: Record<string, string | boolean>;
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

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

async function loadContractClass(relativePath: string, exportName: string) {
  const requestedPath = resolve(process.cwd(), relativePath);
  const tsPath = resolve(process.cwd(), relativePath.replace(/\.js$/, '.ts'));
  const absolutePath = existsSync(requestedPath) ? requestedPath : tsPath;
  const module = (await import(pathToFileURL(absolutePath).href)) as Record<string, unknown>;
  const contract = module[exportName] as (new (address: Address) => unknown) | undefined;
  if (!contract) throw new Error(`Generated wrapper ${relativePath} does not export ${exportName}.`);
  return contract;
}

function formatAddress(address: Address) {
  return address.toString({ testOnly: false });
}

function stateCodeHashHex(state: Awaited<ReturnType<TonClient['getContractState']>>) {
  if (!state.code) return null;
  return Cell.fromBoc(state.code)[0]?.hash().toString('hex') ?? null;
}

function expectEqual(failures: string[], label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) failures.push(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

async function main() {
  const loadedEnvFiles = loadLocalEnv();
  const endpoint = requireEnv('TON_MAINNET_RPC_URL');
  const apiKey = optionalEnv('TON_MAINNET_RPC_API_KEY');
  const client = new TonClient(apiKey ? { endpoint, apiKey } : { endpoint });
  const compiled = await compileJettonV2();
  const planPath = resolve(process.cwd(), 'deployments/v3-mainnet/72h-v3-tokenomics.mainnet.plan.json');
  const plan = readJson<TokenomicsPlan>(planPath);
  const failures: string[] = [];

  expectEqual(failures, 'plan.network', plan.network, 'mainnet');
  expectEqual(failures, 'plan.version', plan.version, 'v3');
  expectEqual(failures, 'plan.supplyRaw', plan.supplyRaw, H72H_V2_TOTAL_SUPPLY.toString());
  expectEqual(failures, 'local jetton wallet code hash', compiled.wallet.codeHashHex, plan.codeHashes.jettonWalletHex);
  expectEqual(failures, 'local jetton minter code hash', compiled.minter.codeHashHex, plan.codeHashes.jettonMinterHex);

  const masterAddress = Address.parse(plan.jettonMaster);
  const minter = client.open(JettonMinterV2.createFromAddress(masterAddress));
  const jettonData = await minter.getJettonData();
  const jettonMasterState = await client.getContractState(masterAddress);
  const jettonWalletCodeHashHex = jettonData.walletCode.hash().toString('hex');
  const jettonMasterCodeHashHex = stateCodeHashHex(jettonMasterState);

  expectEqual(failures, 'Jetton master state', jettonMasterState.state, 'active');
  expectEqual(failures, 'Jetton master code hash', jettonMasterCodeHashHex, plan.codeHashes.jettonMinterHex);
  expectEqual(failures, 'Jetton totalSupplyRaw', jettonData.totalSupply.toString(), plan.v3Jetton.expectedFinalGetter.totalSupplyRaw);
  expectEqual(failures, 'Jetton mintable', jettonData.mintable, plan.v3Jetton.expectedFinalGetter.mintable);
  expectEqual(failures, 'Jetton adminAddress', jettonData.adminAddress?.toString({ testOnly: false }) ?? null, null);
  expectEqual(failures, 'Jetton wallet code hash', jettonWalletCodeHashHex, plan.v3Jetton.expectedFinalGetter.walletCodeHashHex);

  const classes = {
    SeasonVault: await loadContractClass('build/tact/SeasonVault/SeasonVault_SeasonVault.js', 'SeasonVault'),
    SeasonClaimV2: await loadContractClass('build/tact/SeasonClaimV2/SeasonClaimV2_SeasonClaimV2.js', 'SeasonClaimV2'),
    FundVesting: await loadContractClass('build/tact/FundVesting/FundVesting_FundVesting.js', 'FundVesting'),
    DevelopmentFund: await loadContractClass('build/tact/DevelopmentFund/DevelopmentFund_DevelopmentFund.js', 'DevelopmentFund'),
    PresaleVault: await loadContractClass('build/tact/PresaleVault/PresaleVault_PresaleVault.js', 'PresaleVault'),
    EcosystemTreasury: await loadContractClass('build/tact/EcosystemTreasury/EcosystemTreasury_EcosystemTreasury.js', 'EcosystemTreasury'),
    TeamVesting: await loadContractClass('build/tact/TeamVesting/TeamVesting_TeamVesting.js', 'TeamVesting'),
  } satisfies Record<ContractName, new (address: Address) => unknown>;

  const snapshots: Record<ContractName, DeployedContractSnapshot> = {} as Record<ContractName, DeployedContractSnapshot>;
  for (const name of Object.keys(plan.contracts) as ContractName[]) {
    const address = Address.parse(plan.contracts[name]);
    const state = await client.getContractState(address);
    const codeHashHex = stateCodeHashHex(state);
    const opened = client.open(new classes[name](address) as any) as any;
    const expectedWallet = Address.parse(plan.wallets.contractJettonWallets[name]);
    const wallet = JettonWalletV2.createFromConfig({ ownerAddress: address, jettonMasterAddress: masterAddress }, compiled.wallet.code).address;
    const balance = await client.open(JettonWalletV2.createFromAddress(wallet)).getJettonBalance();

    expectEqual(failures, `${name} state`, state.state, 'active');
    expectEqual(failures, `${name} code hash`, codeHashHex, plan.codeHashes.tokenomics[name]);
    expectEqual(failures, `${name} derived jetton wallet`, formatAddress(wallet), formatAddress(expectedWallet));
    const expectedAllocation = plan.allocationsRaw[name] ?? '0';
    expectEqual(failures, `${name} jetton wallet balance`, balance.toString(), expectedAllocation);

    const extra: Record<string, string | boolean> = {
      derivedJettonWallet: formatAddress(wallet),
      jettonWalletBalanceRaw: balance.toString(),
    };
    let funded72H: string | undefined;

    if (typeof opened.getGetFunded72H === 'function') {
      funded72H = (await opened.getGetFunded72H()).toString();
      expectEqual(failures, `${name} funded72H`, funded72H, expectedAllocation);
    }

    if (name === 'SeasonVault') {
      expectEqual(failures, 'SeasonVault round amount', (await opened.getGetRoundAmount72H()).toString(), plan.seasonRewards.roundRewardRaw);
      expectEqual(failures, 'SeasonVault rounds per season', (await opened.getGetRoundsPerSeason()).toString(), plan.seasonRewards.roundsPerSeason);
      expectEqual(failures, 'SeasonVault personal pool amount', (await opened.getGetRoundPersonalDepositAmount72H()).toString(), plan.seasonRewards.poolAmountsPerSuccessfulRoundRaw.personalDeposit);
      expectEqual(failures, 'SeasonVault team pool amount', (await opened.getGetRoundTeamDepositAmount72H()).toString(), plan.seasonRewards.poolAmountsPerSuccessfulRoundRaw.teamDeposit);
      expectEqual(failures, 'SeasonVault referral pool amount', (await opened.getGetRoundReferralAmount72H()).toString(), plan.seasonRewards.poolAmountsPerSuccessfulRoundRaw.referral);
      expectEqual(failures, 'SeasonVault leaderboard pool amount', (await opened.getGetRoundLeaderboardAmount72H()).toString(), plan.seasonRewards.poolAmountsPerSuccessfulRoundRaw.leaderboard);
      extra.allocated72H = (await opened.getGetAllocated72H()).toString();
      expectEqual(failures, 'SeasonVault allocated72H', extra.allocated72H, '0');
    } else if (name === 'SeasonClaimV2') {
      expectEqual(failures, 'SeasonClaimV2 reserved72H', (await opened.getGetReserved72H()).toString(), '0');
      expectEqual(failures, 'SeasonClaimV2 claimed72H', (await opened.getGetClaimed72H()).toString(), '0');
      expectEqual(failures, 'SeasonClaimV2 claim window seconds', (await opened.getGetClaimWindowSeconds()).toString(), String(60 * 24 * 60 * 60));
      expectEqual(failures, 'SeasonClaimV2 bounce grace seconds', (await opened.getGetBounceGraceSeconds()).toString(), String(15 * 60));
      expectEqual(failures, 'SeasonClaimV2 personal bps', (await opened.getGetPersonalDepositBps()).toString(), plan.seasonRewards.poolBps.personalDeposit);
      expectEqual(failures, 'SeasonClaimV2 team bps', (await opened.getGetTeamDepositBps()).toString(), plan.seasonRewards.poolBps.teamDeposit);
      expectEqual(failures, 'SeasonClaimV2 referral bps', (await opened.getGetReferralBps()).toString(), plan.seasonRewards.poolBps.referral);
      expectEqual(failures, 'SeasonClaimV2 leaderboard bps', (await opened.getGetLeaderboardBps()).toString(), plan.seasonRewards.poolBps.leaderboard);
    } else if (name === 'PresaleVault') {
      expectEqual(failures, 'PresaleVault isActive', await opened.getIsActive(), false);
      expectEqual(failures, 'PresaleVault funded72H', funded72H, plan.allocationsRaw.PresaleVault);
      expectEqual(failures, 'PresaleVault sold72H', (await opened.getGetSold72H()).toString(), '0');
      expectEqual(failures, 'PresaleVault currentStage', (await opened.getGetCurrentStage()).toString(), '1');
      expectEqual(failures, 'PresaleVault total cap', (await opened.getGetTotalCap72H()).toString(), plan.allocationsRaw.PresaleVault);
    } else if (name === 'FundVesting') {
      expectEqual(failures, 'FundVesting withdrawn72H', (await opened.getGetWithdrawn72H()).toString(), '0');
    } else if (name === 'DevelopmentFund') {
      expectEqual(failures, 'DevelopmentFund withdrawn72H', (await opened.getGetWithdrawn72H()).toString(), '0');
      expectEqual(failures, 'DevelopmentFund available72H', (await opened.getGetAvailable72H()).toString(), plan.allocationsRaw.DevelopmentFund);
    } else if (name === 'EcosystemTreasury') {
      expectEqual(failures, 'EcosystemTreasury released72H', (await opened.getGetReleased72H()).toString(), '0');
    } else if (name === 'TeamVesting') {
      expectEqual(failures, 'TeamVesting released72H', (await opened.getGetReleased72H()).toString(), '0');
      expectEqual(failures, 'TeamVesting stage amount', (await opened.getGetStageAmount72H()).toString(), (100_000_000n * 1_000_000_000n).toString());
    }

    snapshots[name] = {
      address: formatAddress(address),
      state: state.state,
      codeHashHex,
      extra,
      ...(funded72H === undefined ? {} : { funded72H }),
    };
  }

  const earlyUsersWalletAddress = Address.parse(plan.wallets.earlyUsersWallet);
  const earlyUsersJettonWallet = JettonWalletV2.createFromConfig(
    { ownerAddress: earlyUsersWalletAddress, jettonMasterAddress: masterAddress },
    compiled.wallet.code,
  ).address;
  const earlyUsersBalance = await client.open(JettonWalletV2.createFromAddress(earlyUsersJettonWallet)).getJettonBalance();
  expectEqual(failures, 'earlyUsersWallet balance', earlyUsersBalance.toString(), plan.allocationsRaw.earlyUsersWallet);

  const result = {
    checkedAt: new Date().toISOString(),
    network: 'mainnet',
    status: failures.length === 0 ? 'deployed-and-postdeploy-verified' : 'failed',
    loadedEnvFiles,
    adminWallet: plan.admin,
    metadataUri: plan.metadataUri,
    jettonMaster: {
      address: formatAddress(masterAddress),
      state: jettonMasterState.state,
      codeHashHex: jettonMasterCodeHashHex,
      totalSupplyRaw: jettonData.totalSupply.toString(),
      mintable: jettonData.mintable,
      adminAddress: jettonData.adminAddress?.toString({ testOnly: false }) ?? null,
      walletCodeHashHex: jettonWalletCodeHashHex,
    },
    contracts: snapshots,
    earlyUsers: {
      owner: formatAddress(earlyUsersWalletAddress),
      jettonWallet: formatAddress(earlyUsersJettonWallet),
      balanceRaw: earlyUsersBalance.toString(),
    },
    failures,
  };

  const latestPath = resolve(process.cwd(), 'deployments/v3-mainnet/72h-v3-mainnet.postdeploy.latest.json');
  writeFileSync(latestPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));

  if (failures.length > 0) {
    throw new Error(`V3 mainnet postdeploy verification failed:\n${failures.join('\n')}`);
  }
}

await main();
