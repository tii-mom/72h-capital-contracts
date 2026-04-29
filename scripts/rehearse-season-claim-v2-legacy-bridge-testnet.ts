import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address, beginCell, Cell, fromNano, internal, toNano, type Slice } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, TonClient4, WalletContractV4, type TonClientParameters } from '@ton/ton';
import {
  compileJettonV2,
  H72H_V2_TOTAL_SUPPLY,
  JettonMinterV2,
  JettonWalletV2,
} from '../src/jetton-v2/index.js';

const SCALE = 1_000_000_000n;
const REHEARSAL_TOTAL = SCALE;
const PERSONAL_AMOUNT = (REHEARSAL_TOTAL * 5000n) / 10000n;
const TEAM_AMOUNT = (REHEARSAL_TOTAL * 2500n) / 10000n;
const REFERRAL_AMOUNT = (REHEARSAL_TOTAL * 1500n) / 10000n;
const LEADERBOARD_AMOUNT = (REHEARSAL_TOTAL * 1000n) / 10000n;
const PRICE_HOLD_SECONDS = 72n * 60n * 60n;
const BOUNCE_GRACE_SECONDS = 72n * 60n * 60n;
const MANUAL_FORWARD_QUERY_OFFSET = 14_414_200_000_000_000n;
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
};

type BridgeRehearsalEvidence = {
  readonly nonce?: string;
  readonly rehearsal?: {
    readonly legacyClaimQueryId?: string;
    readonly manualForwardQueryId?: string;
  };
  readonly finalGetter?: {
    readonly legacyPendingCleanup?: {
      readonly queryId?: string;
    };
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

function optionalBigIntEnv(name: string) {
  const value = optionalEnv(name);
  if (!value) return undefined;
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > 18_446_744_073_709_551_615n) {
    throw new Error(`${name} must be a uint64 integer.`);
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
      await sleep(attempt * 10_000);
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

function readJettonManifest() {
  const latestPath = resolve(process.cwd(), 'deployments/jetton-v2.testnet.latest.json');
  if (!existsSync(latestPath)) {
    throw new Error('Missing deployments/jetton-v2.testnet.latest.json. Run npm run jetton-v2:deploy:testnet:send first.');
  }
  return JSON.parse(readFileSync(latestPath, 'utf8')) as JettonV2Manifest;
}

function readLatestBridgeEvidence() {
  const latestPath = resolve(process.cwd(), 'deployments/season-claim-v2-legacy-bridge.testnet.latest.json');
  if (!existsSync(latestPath)) {
    throw new Error('Missing deployments/season-claim-v2-legacy-bridge.testnet.latest.json. Run bridge rehearsal first.');
  }
  return JSON.parse(readFileSync(latestPath, 'utf8')) as BridgeRehearsalEvidence;
}

function parseOptionalBigInt(value: string | undefined) {
  return value ? BigInt(value) : undefined;
}

function formatAddress(address: Address) {
  return address.toString({ testOnly: true });
}

function zeroAddress() {
  return Address.parse(`0:${'0'.repeat(64)}`);
}

function nonceAddress(nonce: string) {
  return Address.parse(`0:${createHash('sha256').update(`season-claim-v2-legacy-bridge:${nonce}`).digest('hex')}`);
}

function evidenceHash(label: string) {
  return BigInt(`0x${createHash('sha256').update(label).digest('hex')}`);
}

function cellHash(cell: Cell) {
  return BigInt(`0x${cell.hash().toString('hex')}`);
}

function seasonRewardLeafHash(jettonMaster: Address, seasonClaim: Address, seasonId: bigint, account: Address) {
  return cellHash(beginCell()
    .storeUint(1n, 32)
    .storeRef(beginCell().storeAddress(jettonMaster).storeAddress(seasonClaim).endCell())
    .storeRef(beginCell()
      .storeUint(seasonId, 8)
      .storeAddress(account)
      .storeCoins(PERSONAL_AMOUNT)
      .storeCoins(TEAM_AMOUNT)
      .storeCoins(REFERRAL_AMOUNT)
      .storeCoins(LEADERBOARD_AMOUNT)
      .storeCoins(REHEARSAL_TOTAL)
      .endCell())
    .endCell());
}

function emptyProof() {
  return beginCell().endCell();
}

function emptyForwardPayload() {
  return beginCell().storeBit(false).endCell().beginParse() as Slice;
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
const settlePending = process.argv.includes('--settle-pending');
const allowSend = optionalEnv('TON_TESTNET_ALLOW_SEASON_CLAIM_V2_BRIDGE_REHEARSAL_SEND') === 'true';
const endpoint = requireEnv('TON_TESTNET_RPC_URL');
const mnemonic = requireEnv('TON_TESTNET_DEPLOYER_MNEMONIC');
const keyPair = await mnemonicToPrivateKey(mnemonic.split(/\s+/).filter(Boolean));
const walletId = optionalIntegerEnv('TON_TESTNET_DEPLOYER_WALLET_ID');
const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0, walletId });
const configuredDeployer = Address.parse(requireEnv('TON_TESTNET_DEPLOYER_ADDRESS'));
if (!wallet.address.equals(configuredDeployer)) {
  throw new Error(`Derived Wallet V4 ${formatAddress(wallet.address)} does not match TON_TESTNET_DEPLOYER_ADDRESS ${formatAddress(configuredDeployer)}.`);
}

const manifest = readJettonManifest();
const masterAddress = Address.parse(manifest.jettonMaster);
const initialSupplyOwner = Address.parse(manifest.initialSupplyOwner);
if (!initialSupplyOwner.equals(wallet.address)) {
  throw new Error(`Initial supply owner ${formatAddress(initialSupplyOwner)} must match deployer ${formatAddress(wallet.address)} for this rehearsal.`);
}

const compiled = await compileJettonV2();
if (manifest.codeHashes.walletHex !== compiled.wallet.codeHashHex) {
  throw new Error('V2 wallet code hash in manifest does not match local build.');
}

const latestBridgeEvidence = settlePending ? readLatestBridgeEvidence() : undefined;
const nonce = optionalEnv('TON_TESTNET_SEASON_CLAIM_V2_BRIDGE_REHEARSAL_NONCE') ?? latestBridgeEvidence?.nonce ?? 'manual-forward-2026-04-28';
const client = createClient(endpoint);
const minter = client.open(JettonMinterV2.createFromAddress(masterAddress));
const SeasonClaim = await loadGeneratedContract('build/tact/SeasonClaim/SeasonClaim_SeasonClaim.js', 'SeasonClaim');
const SeasonClaimV2 = await loadGeneratedContract('build/tact/SeasonClaimV2/SeasonClaimV2_SeasonClaimV2.js', 'SeasonClaimV2');
const SeasonClaimV2LegacyBridge = await loadGeneratedContract(
  'build/tact/SeasonClaimV2LegacyBridge/SeasonClaimV2LegacyBridge_SeasonClaimV2LegacyBridge.js',
  'SeasonClaimV2LegacyBridge',
);

function jettonWalletFor(owner: Address) {
  return JettonWalletV2.createFromConfig({ ownerAddress: owner, jettonMasterAddress: masterAddress }, compiled.wallet.code).address;
}

const legacyClaim = await SeasonClaim.fromInit(wallet.address, masterAddress, nonceAddress(`${nonce}:legacy-placeholder-wallet`), wallet.address);
const bridge = await SeasonClaimV2LegacyBridge.fromInit(
  wallet.address,
  masterAddress,
  legacyClaim.address,
  zeroAddress(),
  nonceAddress(`${nonce}:bridge-placeholder-wallet`),
);
const v2 = await SeasonClaimV2.fromInit(wallet.address, masterAddress, nonceAddress(`${nonce}:v2-placeholder-wallet`), bridge.address);
const openedLegacyClaim = client.open(legacyClaim as any) as any;
const openedBridge = client.open(bridge as any) as any;
const openedV2 = client.open(v2 as any) as any;
const ownerJettonWallet = JettonWalletV2.createFromConfig({ ownerAddress: wallet.address, jettonMasterAddress: masterAddress }, compiled.wallet.code);
const legacyClaimWallet = jettonWalletFor(legacyClaim.address);
const bridgeWallet = jettonWalletFor(bridge.address);
const v2Wallet = jettonWalletFor(v2.address);
const leaf = seasonRewardLeafHash(masterAddress, legacyClaim.address, 1n, bridge.address);
const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
const oldObservation = nowSeconds - PRICE_HOLD_SECONDS - 300n;
let queryId = BigInt(Date.now()) * 1000n;
const nextQueryId = () => {
  queryId += 1n;
  return queryId;
};
const legacyClaimQueryId = optionalBigIntEnv('TON_TESTNET_SEASON_CLAIM_V2_BRIDGE_LEGACY_QUERY_ID')
  ?? parseOptionalBigInt(latestBridgeEvidence?.finalGetter?.legacyPendingCleanup?.queryId)
  ?? parseOptionalBigInt(latestBridgeEvidence?.rehearsal?.legacyClaimQueryId)
  ?? nextQueryId();
const manualForwardQueryId = optionalBigIntEnv('TON_TESTNET_SEASON_CLAIM_V2_BRIDGE_MANUAL_FORWARD_QUERY_ID')
  ?? parseOptionalBigInt(latestBridgeEvidence?.rehearsal?.manualForwardQueryId)
  ?? (MANUAL_FORWARD_QUERY_OFFSET + nextQueryId());
if (legacyClaimQueryId >= 7_207_000_600_000_000n) {
  throw new Error('TON_TESTNET_SEASON_CLAIM_V2_BRIDGE_LEGACY_QUERY_ID must be below the legacy SeasonClaim sweep namespace.');
}
if (manualForwardQueryId < MANUAL_FORWARD_QUERY_OFFSET) {
  throw new Error('TON_TESTNET_SEASON_CLAIM_V2_BRIDGE_MANUAL_FORWARD_QUERY_ID must be in the manual forward namespace.');
}

const plan = {
  generatedAt: new Date().toISOString(),
  network: 'testnet',
  loadedEnvFiles,
  mode: settlePending ? (send ? 'settle-pending-send' : 'settle-pending-dry-run') : (send ? 'send' : 'dry-run'),
  phase: 'bridge-focused-manual-forward',
  nonce,
  deployer: formatAddress(wallet.address),
  deployerWalletId: wallet.walletId,
  jettonMaster: formatAddress(masterAddress),
  metadataUri: manifest.metadataUri,
  contracts: {
    legacySeasonClaim: formatAddress(legacyClaim.address),
    seasonClaimV2: formatAddress(v2.address),
    bridge: formatAddress(bridge.address),
    ownerJettonWallet: formatAddress(ownerJettonWallet.address),
    legacyClaimJettonWallet: formatAddress(legacyClaimWallet),
    bridgeJettonWallet: formatAddress(bridgeWallet),
    v2JettonWallet: formatAddress(v2Wallet),
  },
  codeHashes: {
    minterHex: compiled.minter.codeHashHex,
    walletHex: compiled.wallet.codeHashHex,
    SeasonClaim: legacyClaim.init?.code.hash().toString('hex') ?? null,
    SeasonClaimData: legacyClaim.init?.data.hash().toString('hex') ?? null,
    SeasonClaimV2: v2.init?.code.hash().toString('hex') ?? null,
    SeasonClaimV2Data: v2.init?.data.hash().toString('hex') ?? null,
    SeasonClaimV2LegacyBridge: bridge.init?.code.hash().toString('hex') ?? null,
    SeasonClaimV2LegacyBridgeData: bridge.init?.data.hash().toString('hex') ?? null,
  },
  rehearsal: {
    amountRaw: REHEARSAL_TOTAL.toString(),
    personalAmountRaw: PERSONAL_AMOUNT.toString(),
    teamAmountRaw: TEAM_AMOUNT.toString(),
    referralAmountRaw: REFERRAL_AMOUNT.toString(),
    leaderboardAmountRaw: LEADERBOARD_AMOUNT.toString(),
    legacyRoot: `0x${leaf.toString(16)}`,
    legacyClaimQueryId: legacyClaimQueryId.toString(),
    manualForwardQueryId: manualForwardQueryId.toString(),
    manualForwardQueryOffset: MANUAL_FORWARD_QUERY_OFFSET.toString(),
    openAt: oldObservation.toString(),
  },
  checkpoints: [
    'legacy SeasonClaim payout uses forwardTonAmount=0',
    'bridge contract pendingForward remains 0 before manual forward',
    'bridge Jetton wallet balance increases by the claim amount',
    'owner calls ForwardBridgeWalletToV2 after wallet balance confirmation',
    'SeasonClaimV2 funding and bridge forwarded accounting finalize after ConfirmSeasonClaimFunding',
    'legacy SeasonClaim pending cleanup is recorded for execution after 72h bounce grace',
  ],
};

mkdirSync(resolve(process.cwd(), 'deployments'), { recursive: true });
writeFileSync(resolve(process.cwd(), 'deployments/season-claim-v2-legacy-bridge.testnet.plan.json'), `${JSON.stringify(plan, null, 2)}\n`);

console.log('SeasonClaimV2 legacy bridge testnet rehearsal');
console.log(`Deployer: ${formatAddress(wallet.address)}`);
console.log(`V2 Jetton master: ${formatAddress(masterAddress)}`);
console.log(`Legacy SeasonClaim: ${formatAddress(legacyClaim.address)}`);
console.log(`SeasonClaimV2: ${formatAddress(v2.address)}`);
console.log(`Bridge: ${formatAddress(bridge.address)}`);
console.log(`Bridge Jetton wallet: ${formatAddress(bridgeWallet)}`);
console.log(`Send mode: ${send ? 'requested' : 'dry-run'}`);
console.log(`Settle pending mode: ${settlePending ? 'yes' : 'no'}`);

if (!send) {
  console.log('No transactions sent. Re-run with --send and TON_TESTNET_ALLOW_SEASON_CLAIM_V2_BRIDGE_REHEARSAL_SEND=true to execute on testnet.');
  process.exit(0);
}

if (!allowSend) {
  throw new Error('Refusing to send. Set TON_TESTNET_ALLOW_SEASON_CLAIM_V2_BRIDGE_REHEARSAL_SEND=true and pass --send.');
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

async function getJettonBalance(owner: Address) {
  const jettonWalletAddress = jettonWalletFor(owner);
  const state = await withRpcRetry('jetton wallet state', () => getContractState(jettonWalletAddress));
  if (state.state !== 'active') return 0n;
  return client.open(JettonWalletV2.createFromAddress(jettonWalletAddress)).getJettonBalance();
}

const sender = wallet.sender(client.provider(wallet.address, wallet.init), keyPair.secretKey);
const actions: { label: string; seqnoBefore: number; seqnoAfter: number; at: string }[] = [];

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
    const nextSeqnoValue = await waitForSeqnoIncrease(client, wallet, seqno);
    actions.push({ label, seqnoBefore: seqno, seqnoAfter: nextSeqnoValue, at: new Date().toISOString() });
    await sleep(10_000);
    return;
  }
  throw new Error(`${label} failed: ${getErrorMessage(lastError)}`);
}

async function sendOpenedUnless(
  label: string,
  done: () => Promise<boolean>,
  contract: { send: (...args: any[]) => Promise<unknown> },
  message: unknown,
  value = toNano('0.12'),
) {
  if (await done()) {
    console.log(`${label} already complete; skipping.`);
    return;
  }
  await sendOpened(label, contract, message, value);
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
    const nextSeqnoValue = await waitForSeqnoIncrease(client, wallet, seqno);
    actions.push({ label, seqnoBefore: seqno, seqnoAfter: nextSeqnoValue, at: new Date().toISOString() });
    await sleep(10_000);
    return;
  }
  throw new Error(`${label} failed: ${getErrorMessage(lastError)}`);
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
      forwardPayload: emptyForwardPayload(),
    }),
  );
}

async function readLegacyPendingCleanup(query: bigint) {
  const amount = await openedLegacyClaim.getGetPendingClaimAmount(query) as bigint;
  const openedAt = await openedLegacyClaim.getGetPendingClaimOpenedAt(query) as bigint;
  const settleNotBefore = openedAt > 0n ? openedAt + BOUNCE_GRACE_SECONDS + 1n : 0n;
  return {
    amount,
    openedAt,
    settleNotBefore,
    settleNotBeforeIso: settleNotBefore > 0n ? new Date(Number(settleNotBefore) * 1000).toISOString() : null,
  };
}

if (settlePending) {
  const cleanupBefore = await readLegacyPendingCleanup(legacyClaimQueryId);
  if (cleanupBefore.amount === 0n) {
    console.log(`Legacy pending query ${legacyClaimQueryId} is already clear; writing refreshed evidence.`);
  } else {
    const currentChainTime = BigInt(Math.floor(Date.now() / 1000));
    if (cleanupBefore.settleNotBefore === 0n || currentChainTime <= cleanupBefore.settleNotBefore) {
      throw new Error(`Legacy pending query ${legacyClaimQueryId} is not settleable until ${cleanupBefore.settleNotBeforeIso}.`);
    }
    await sendOpened(
      'settle legacy SeasonClaim pending after bounce grace',
      openedLegacyClaim as never,
      {
        $$type: 'SettleSeasonClaimPending',
        queryId: legacyClaimQueryId,
      },
      toNano('0.2'),
    );
    await waitForValue('legacy pending cleared', () => openedLegacyClaim.getGetPendingClaimAmount(legacyClaimQueryId) as Promise<bigint>, (value) => value === 0n);
  }

  const cleanupAfter = await readLegacyPendingCleanup(legacyClaimQueryId);
  const evidence = {
    ...plan,
    completedAt: new Date().toISOString(),
    status: cleanupAfter.amount === 0n ? 'complete' : 'bridge-forward-complete-pending-legacy-settle',
    actions,
    finalGetter: {
      legacySeasonClaim: {
        pendingClaimAmount: cleanupAfter.amount.toString(),
        pendingClaimOpenedAt: cleanupAfter.openedAt.toString(),
      },
      legacyPendingCleanup: {
        settled: cleanupAfter.amount === 0n,
        queryId: legacyClaimQueryId.toString(),
        amountRaw: cleanupAfter.amount.toString(),
        openedAt: cleanupAfter.openedAt.toString(),
        settleNotBefore: cleanupAfter.settleNotBefore.toString(),
        settleNotBeforeIso: cleanupAfter.settleNotBeforeIso,
      },
    },
  };
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const timestampedPath = resolve(process.cwd(), `deployments/season-claim-v2-legacy-bridge.testnet.${timestamp}.json`);
  const latestPath = resolve(process.cwd(), 'deployments/season-claim-v2-legacy-bridge.testnet.latest.json');
  writeFileSync(timestampedPath, `${JSON.stringify(evidence, null, 2)}\n`);
  writeFileSync(latestPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('SeasonClaimV2 legacy bridge pending cleanup completed.');
  console.log(`Status: ${evidence.status}`);
  console.log(`Evidence: ${timestampedPath}`);
  process.exit(0);
}

const masterData = await withRpcRetry('V2 final getter', () => minter.getJettonData(), 8);
if (masterData.totalSupply !== H72H_V2_TOTAL_SUPPLY - SCALE) {
  console.log(`Warning: testnet total supply is ${masterData.totalSupply}; expected prior rehearsal burn total ${H72H_V2_TOTAL_SUPPLY - SCALE}.`);
}
if (masterData.mintable !== false || masterData.adminAddress !== null) {
  throw new Error('Testnet V2 Jetton is not in fixed-supply non-mintable state.');
}

const walletBalance = await withRpcRetry('wallet balance', () => getBalance(wallet.address));
const ownerJettonBalanceBefore = await withRpcRetry('owner jetton balance', () => getJettonBalance(wallet.address));
if (ownerJettonBalanceBefore < REHEARSAL_TOTAL) {
  throw new Error(`Owner Jetton balance ${ownerJettonBalanceBefore} is below bridge rehearsal amount ${REHEARSAL_TOTAL}.`);
}
console.log(`Deployer balance: ${fromNano(walletBalance)} TON`);
console.log(`Owner Jetton balance before: ${ownerJettonBalanceBefore}`);

await sendOpenedUnless(
  'deploy legacy SeasonClaim',
  async () => (await withRpcRetry('legacy SeasonClaim state', () => getContractState(legacyClaim.address))).state === 'active',
  openedLegacyClaim as never,
  null,
  toNano('0.12'),
);
await sendOpenedUnless(
  'deploy SeasonClaimV2',
  async () => (await withRpcRetry('SeasonClaimV2 state', () => getContractState(v2.address))).state === 'active',
  openedV2 as never,
  null,
  toNano('0.12'),
);
await sendOpenedUnless(
  'deploy SeasonClaimV2LegacyBridge',
  async () => (await withRpcRetry('bridge state', () => getContractState(bridge.address))).state === 'active',
  openedBridge as never,
  null,
  toNano('0.12'),
);

await sendOpenedUnless(
  'set legacy SeasonClaim jetton wallet',
  async () => (await openedLegacyClaim.getGetFunded72H() as bigint) > 0n,
  openedLegacyClaim as never,
  {
    $$type: 'SetSeasonClaimJettonWallet',
    wallet: legacyClaimWallet,
  },
);
await sendOpenedUnless(
  'set SeasonClaimV2 jetton wallet',
  async () => (await openedV2.getGetFunded72H() as bigint) > 0n,
  openedV2 as never,
  {
    $$type: 'SetSeasonClaimJettonWallet',
    wallet: v2Wallet,
  },
);
await sendOpenedUnless(
  'set bridge jetton wallet',
  async () => (await openedBridge.getGetConfigurationLocked() as boolean),
  openedBridge as never,
  {
    $$type: 'SetSeasonClaimV2BridgeJettonWallet',
    wallet: bridgeWallet,
  },
);
await sendOpenedUnless(
  'set bridge SeasonClaimV2 target',
  async () => (await openedBridge.getGetConfigurationLocked() as boolean),
  openedBridge as never,
  {
    $$type: 'SetSeasonClaimV2BridgeTarget',
    seasonClaimV2: v2.address,
  },
);

await waitForValue('legacy SeasonClaim active', () => getContractState(legacyClaim.address), (value) => value.state === 'active');
await waitForValue('SeasonClaimV2 active', () => getContractState(v2.address), (value) => value.state === 'active');
await waitForValue('bridge active', () => getContractState(bridge.address), (value) => value.state === 'active');

const legacyFundedBefore = await openedLegacyClaim.getGetFunded72H() as bigint;
if (legacyFundedBefore < REHEARSAL_TOTAL) {
  await transferJettons('fund legacy SeasonClaim inventory', legacyClaim.address, REHEARSAL_TOTAL - legacyFundedBefore);
}
await waitForValue('legacy SeasonClaim funded', () => openedLegacyClaim.getGetFunded72H() as Promise<bigint>, (value) => value >= REHEARSAL_TOTAL);

await sendOpenedUnless(
  'register legacy bridge leaf season',
  async () => (await openedLegacyClaim.getGetSeasonTotal(1n) as bigint) >= REHEARSAL_TOTAL,
  openedLegacyClaim as never,
  {
    $$type: 'RegisterSeasonClaim',
    seasonId: 1n,
    merkleRoot: leaf,
    totalAmount72H: REHEARSAL_TOTAL,
    personalDepositTotal72H: PERSONAL_AMOUNT,
    teamDepositTotal72H: TEAM_AMOUNT,
    referralTotal72H: REFERRAL_AMOUNT,
    leaderboardTotal72H: LEADERBOARD_AMOUNT,
    openAt: oldObservation,
    evidenceHash: evidenceHash('testnet-season-claim-v2-legacy-bridge-root'),
  },
  toNano('0.12'),
);
await sendOpenedUnless(
  'unlock legacy SeasonClaim stage 5',
  async () => (await openedLegacyClaim.getGetUnlockedBps() as bigint) >= 10000n,
  openedLegacyClaim as never,
  {
    $$type: 'UnlockClaimStage',
    stage: 5n,
    priceUsd9: 100_000_000n,
    observedAt: oldObservation,
    evidenceHash: evidenceHash('testnet-season-claim-v2-legacy-bridge-stage-5'),
  },
  toNano('0.12'),
);

const v2FundedBeforeBridge = await openedV2.getGetFunded72H() as bigint;
if (v2FundedBeforeBridge < REHEARSAL_TOTAL) {
  const bridgeWalletBefore = await withRpcRetry('bridge wallet balance before claim', () => getJettonBalance(bridge.address));
  if (bridgeWalletBefore < REHEARSAL_TOTAL) {
    await sendOpened(
      'bridge claims legacy SeasonClaim leaf',
      openedBridge as never,
      {
        $$type: 'ClaimLegacySeasonForV2',
        queryId: legacyClaimQueryId,
        seasonId: 1n,
        personalDepositAmount72H: PERSONAL_AMOUNT,
        teamDepositAmount72H: TEAM_AMOUNT,
        referralAmount72H: REFERRAL_AMOUNT,
        leaderboardAmount72H: LEADERBOARD_AMOUNT,
        expectedClaimAmount72H: REHEARSAL_TOTAL,
        proof: emptyProof(),
      },
      toNano('0.3'),
    );
  }
  await waitForValue('bridge Jetton wallet funded by zero-forward legacy payout', () => getJettonBalance(bridge.address), (value) => value >= REHEARSAL_TOTAL);
  await waitForValue('bridge has no pending forward before manual action', () => openedBridge.getGetPendingForward72H() as Promise<bigint>, (value) => value === 0n);
  await waitForValue('SeasonClaimV2 still unfunded before manual forward', () => openedV2.getGetFunded72H() as Promise<bigint>, (value) => value === 0n);

  await sendOpened(
    'manual forward bridge wallet inventory to SeasonClaimV2',
    openedBridge as never,
    {
      $$type: 'ForwardBridgeWalletToV2',
      queryId: manualForwardQueryId,
      amount72H: REHEARSAL_TOTAL,
    },
    toNano('0.3'),
  );
}

await waitForValue('SeasonClaimV2 funded by bridge manual forward', () => openedV2.getGetFunded72H() as Promise<bigint>, (value) => value >= REHEARSAL_TOTAL);
await waitForValue('bridge forwarded accounting finalized', () => openedBridge.getGetForwardedToV272H() as Promise<bigint>, (value) => value >= REHEARSAL_TOTAL);
await waitForValue('bridge pending forward cleared', () => openedBridge.getGetPendingForward72H() as Promise<bigint>, (value) => value === 0n);
await waitForValue('bridge manual query completed', () => openedBridge.getGetCompletedForwardAmount(manualForwardQueryId) as Promise<bigint>, (value) => value === REHEARSAL_TOTAL);

const legacyPendingAmount = await openedLegacyClaim.getGetPendingClaimAmount(legacyClaimQueryId) as bigint;
const legacyPendingOpenedAt = await openedLegacyClaim.getGetPendingClaimOpenedAt(legacyClaimQueryId) as bigint;
const settleNotBefore = legacyPendingOpenedAt > 0n ? legacyPendingOpenedAt + BOUNCE_GRACE_SECONDS + 1n : 0n;
const currentChainTime = BigInt(Math.floor(Date.now() / 1000));
let legacyPendingSettled = false;
if (legacyPendingAmount > 0n && settleNotBefore > 0n && currentChainTime > settleNotBefore) {
  await sendOpened(
    'settle legacy SeasonClaim pending after bounce grace',
    openedLegacyClaim as never,
    {
      $$type: 'SettleSeasonClaimPending',
      queryId: legacyClaimQueryId,
    },
    toNano('0.2'),
  );
  await waitForValue('legacy pending cleared', () => openedLegacyClaim.getGetPendingClaimAmount(legacyClaimQueryId) as Promise<bigint>, (value) => value === 0n);
  legacyPendingSettled = true;
}

const finalGetter = {
  legacySeasonClaim: {
    funded72H: (await openedLegacyClaim.getGetFunded72H()).toString(),
    reserved72H: (await openedLegacyClaim.getGetReserved72H()).toString(),
    claimed72H: (await openedLegacyClaim.getGetClaimed72H()).toString(),
    season1Total72H: (await openedLegacyClaim.getGetSeasonTotal(1n)).toString(),
    pendingClaimAmount: (await openedLegacyClaim.getGetPendingClaimAmount(legacyClaimQueryId)).toString(),
    pendingClaimOpenedAt: (await openedLegacyClaim.getGetPendingClaimOpenedAt(legacyClaimQueryId)).toString(),
  },
  bridge: {
    legacyClaimRequested72H: (await openedBridge.getGetLegacyClaimRequested72H()).toString(),
    expectedAvailableToForward72H: (await openedBridge.getGetExpectedAvailableToForward72H()).toString(),
    pendingLegacyAmount: (await openedBridge.getGetPendingLegacyAmount(legacyClaimQueryId)).toString(),
    forwardedToV272H: (await openedBridge.getGetForwardedToV272H()).toString(),
    pendingForward72H: (await openedBridge.getGetPendingForward72H()).toString(),
    completedForwardAmount: (await openedBridge.getGetCompletedForwardAmount(manualForwardQueryId)).toString(),
  },
  seasonClaimV2: {
    funded72H: (await openedV2.getGetFunded72H()).toString(),
    reserved72H: (await openedV2.getGetReserved72H()).toString(),
    claimed72H: (await openedV2.getGetClaimed72H()).toString(),
  },
  balances: {
    ownerJettonBefore: ownerJettonBalanceBefore.toString(),
    ownerJettonAfter: (await getJettonBalance(wallet.address)).toString(),
    legacyClaimJettonWallet: (await getJettonBalance(legacyClaim.address)).toString(),
    bridgeJettonWallet: (await getJettonBalance(bridge.address)).toString(),
    seasonClaimV2JettonWallet: (await getJettonBalance(v2.address)).toString(),
  },
  legacyPendingCleanup: {
    settled: legacyPendingSettled,
    queryId: legacyClaimQueryId.toString(),
    amountRaw: legacyPendingAmount.toString(),
    openedAt: legacyPendingOpenedAt.toString(),
    settleNotBefore: settleNotBefore.toString(),
    settleNotBeforeIso: settleNotBefore > 0n ? new Date(Number(settleNotBefore) * 1000).toISOString() : null,
  },
};

const evidence = {
  ...plan,
  completedAt: new Date().toISOString(),
  status: legacyPendingSettled ? 'complete' : 'bridge-forward-complete-pending-legacy-settle',
  actions,
  finalGetter,
};
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const timestampedPath = resolve(process.cwd(), `deployments/season-claim-v2-legacy-bridge.testnet.${timestamp}.json`);
const latestPath = resolve(process.cwd(), 'deployments/season-claim-v2-legacy-bridge.testnet.latest.json');
writeFileSync(timestampedPath, `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(latestPath, `${JSON.stringify(evidence, null, 2)}\n`);

console.log('SeasonClaimV2 legacy bridge testnet rehearsal phase completed.');
console.log(`Status: ${evidence.status}`);
console.log(`Evidence: ${timestampedPath}`);
if (!legacyPendingSettled && settleNotBefore > 0n) {
  console.log(`Legacy pending cleanup due after: ${new Date(Number(settleNotBefore) * 1000).toISOString()}`);
}
