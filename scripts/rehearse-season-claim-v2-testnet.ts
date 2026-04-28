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
const LEAF_TOTAL = SCALE;
const LEAF_PERSONAL = (LEAF_TOTAL * 5000n) / 10000n;
const LEAF_TEAM = (LEAF_TOTAL * 2500n) / 10000n;
const LEAF_REFERRAL = (LEAF_TOTAL * 1500n) / 10000n;
const LEAF_LEADERBOARD = (LEAF_TOTAL * 1000n) / 10000n;
const CLAIM_LEAF_COUNT = 128;
const CLAIM_SEASON_TOTAL = BigInt(CLAIM_LEAF_COUNT) * LEAF_TOTAL;
const SWEEP_SEASON_TOTAL = 100n * SCALE;
const FUNDING_TOTAL = CLAIM_SEASON_TOTAL + SWEEP_SEASON_TOTAL;
const CLAIM_STAGE_ONE_AMOUNT = (LEAF_TOTAL * 2000n) / 10000n;
const BOUNCE_REHEARSAL_TOTAL = LEAF_TOTAL;
const CLAIM_WINDOW_SECONDS = 60n * 24n * 60n * 60n;
const BOUNCE_GRACE_SECONDS = 72n * 60n * 60n;
const PRICE_HOLD_SECONDS = 72n * 60n * 60n;
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

type ProofItem = {
  readonly siblingOnLeft: boolean;
  readonly hash: bigint;
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

function readJettonManifest() {
  const latestPath = resolve(process.cwd(), 'deployments/jetton-v2.testnet.latest.json');
  if (!existsSync(latestPath)) {
    throw new Error('Missing deployments/jetton-v2.testnet.latest.json. Run npm run jetton-v2:deploy:testnet:send first.');
  }
  return JSON.parse(readFileSync(latestPath, 'utf8')) as JettonV2Manifest;
}

function formatAddress(address: Address) {
  return address.toString({ testOnly: true });
}

function evidenceHash(label: string) {
  return BigInt(`0x${createHash('sha256').update(label).digest('hex')}`);
}

function nonceAddress(nonce: string) {
  return Address.parse(`0:${createHash('sha256').update(`season-claim-v2:${nonce}`).digest('hex')}`);
}

function cellHash(cell: Cell) {
  return BigInt(`0x${cell.hash().toString('hex')}`);
}

function hashPair(left: bigint, right: bigint) {
  return cellHash(beginCell().storeUint(left, 256).storeUint(right, 256).endCell());
}

function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label}`);
  return value;
}

function seasonRewardLeafHash(jettonMaster: Address, seasonClaim: Address, seasonId: bigint, account: Address) {
  return cellHash(beginCell()
    .storeUint(1n, 32)
    .storeRef(beginCell().storeAddress(jettonMaster).storeAddress(seasonClaim).endCell())
    .storeRef(beginCell()
      .storeUint(seasonId, 8)
      .storeAddress(account)
      .storeCoins(LEAF_PERSONAL)
      .storeCoins(LEAF_TEAM)
      .storeCoins(LEAF_REFERRAL)
      .storeCoins(LEAF_LEADERBOARD)
      .storeCoins(LEAF_TOTAL)
      .endCell())
    .endCell());
}

function buildMerkleTree(leaves: bigint[]) {
  const proofs = new Map<number, ProofItem[]>();
  let level = leaves.map((hash, index) => ({ hash, indexes: [index] }));
  for (const leaf of level) {
    proofs.set(must(leaf.indexes[0], 'leaf index'), []);
  }

  while (level.length > 1) {
    const next: Array<{ hash: bigint; indexes: number[] }> = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = must(level[i], 'left Merkle node');
      const right = level[i + 1] || left;
      for (const index of left.indexes) {
        proofs.get(index)?.push({ siblingOnLeft: false, hash: right.hash });
      }
      for (const index of right.indexes) {
        if (right !== left) {
          proofs.get(index)?.push({ siblingOnLeft: true, hash: left.hash });
        }
      }
      next.push({ hash: hashPair(left.hash, right.hash), indexes: [...left.indexes, ...right.indexes] });
    }
    level = next;
  }

  return {
    root: must(level[0], 'Merkle root').hash,
    proofs,
  };
}

function encodeProofRefChain(proof: ProofItem[]) {
  let next: Cell | null = null;
  for (let i = proof.length - 1; i >= 0; i -= 1) {
    const item = must(proof[i], 'proof item');
    const builder = beginCell().storeBit(item.siblingOnLeft).storeUint(item.hash, 256);
    if (next) builder.storeRef(next);
    next = builder.endCell();
  }
  return next || beginCell().endCell();
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
const allowSend = optionalEnv('TON_TESTNET_ALLOW_SEASON_CLAIM_V2_REHEARSAL_SEND') === 'true';
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

const nonce = optionalEnv('TON_TESTNET_SEASON_CLAIM_V2_REHEARSAL_NONCE') ?? 'post-p3-bounce-2026-04-28';
const placeholderClaimWallet = nonceAddress(nonce);
const client = createClient(endpoint);
const minter = client.open(JettonMinterV2.createFromAddress(masterAddress));
const SeasonClaimV2 = await loadGeneratedContract('build/tact/SeasonClaimV2/SeasonClaimV2_SeasonClaimV2.js', 'SeasonClaimV2');
const SeasonClaimV2BouncingJettonWallet = await loadGeneratedContract(
  'build/tact/SeasonClaimV2BounceMock/SeasonClaimV2BounceMock_SeasonClaimV2BouncingJettonWallet.js',
  'SeasonClaimV2BouncingJettonWallet',
);
const seasonClaim = await SeasonClaimV2.fromInit(wallet.address, masterAddress, placeholderClaimWallet, wallet.address);
const opened = client.open(seasonClaim as any) as any;
const bounceSeasonClaim = await SeasonClaimV2.fromInit(
  wallet.address,
  masterAddress,
  nonceAddress(`${nonce}:bounce-placeholder`),
  wallet.address,
);
const bouncingJettonWallet = await SeasonClaimV2BouncingJettonWallet.fromInit(wallet.address, bounceSeasonClaim.address, wallet.address);
const openedBounceClaim = client.open(bounceSeasonClaim as any) as any;
const openedBouncingWallet = client.open(bouncingJettonWallet as any) as any;
const ownerJettonWallet = JettonWalletV2.createFromConfig(
  { ownerAddress: wallet.address, jettonMasterAddress: masterAddress },
  compiled.wallet.code,
);

function jettonWalletFor(owner: Address) {
  return JettonWalletV2.createFromConfig({ ownerAddress: owner, jettonMasterAddress: masterAddress }, compiled.wallet.code).address;
}

const claimJettonWallet = jettonWalletFor(seasonClaim.address);
const accounts = Array.from({ length: CLAIM_LEAF_COUNT }, (_, index) => (
  index === 85
    ? wallet.address
    : Address.parse(`0:${createHash('sha256').update(`season-claim-v2-testnet-account-${index}`).digest('hex')}`)
));
const leaves = accounts.map((account) => seasonRewardLeafHash(masterAddress, seasonClaim.address, 1n, account));
const merkle = buildMerkleTree(leaves);
const claimantIndex = 85;
const claimantProofItems = merkle.proofs.get(claimantIndex) || [];
const claimantProof = encodeProofRefChain(claimantProofItems);
const claimantLeaf = leaves[claimantIndex] || 0n;
const bounceLeaf = seasonRewardLeafHash(masterAddress, bounceSeasonClaim.address, 1n, wallet.address);
const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
const recentOpenAt = nowSeconds - PRICE_HOLD_SECONDS - 300n;
const expiredOpenAt = nowSeconds - CLAIM_WINDOW_SECONDS - BOUNCE_GRACE_SECONDS - 300n;

const plan = {
  generatedAt: new Date().toISOString(),
  network: 'testnet',
  loadedEnvFiles,
  mode: send ? 'send' : 'dry-run',
  nonce,
  deployer: formatAddress(wallet.address),
  deployerWalletId: wallet.walletId,
  jettonMaster: formatAddress(masterAddress),
  metadataUri: manifest.metadataUri,
  contract: {
    SeasonClaimV2: formatAddress(seasonClaim.address),
    claimJettonWallet: formatAddress(claimJettonWallet),
    placeholderClaimWallet: formatAddress(placeholderClaimWallet),
    seasonVaultForRehearsal: formatAddress(wallet.address),
    BounceSeasonClaimV2: formatAddress(bounceSeasonClaim.address),
    BouncingJettonWallet: formatAddress(bouncingJettonWallet.address),
  },
  codeHashes: {
    minterHex: compiled.minter.codeHashHex,
    walletHex: compiled.wallet.codeHashHex,
    SeasonClaimV2: seasonClaim.init?.code.hash().toString('hex') ?? null,
    SeasonClaimV2Data: seasonClaim.init?.data.hash().toString('hex') ?? null,
    SeasonClaimV2BounceMock: bouncingJettonWallet.init?.code.hash().toString('hex') ?? null,
  },
  rehearsal: {
    claimLeafCount: CLAIM_LEAF_COUNT,
    claimProofDepth: claimantProofItems.length,
    claimProofCellHash: claimantProof.hash().toString('hex'),
    season1Root: `0x${merkle.root.toString(16)}`,
    claimantLeaf: `0x${claimantLeaf.toString(16)}`,
    season1TotalRaw: CLAIM_SEASON_TOTAL.toString(),
    season2SweepTotalRaw: SWEEP_SEASON_TOTAL.toString(),
    fundingTotalRaw: FUNDING_TOTAL.toString(),
    expectedStageOneClaimRaw: CLAIM_STAGE_ONE_AMOUNT.toString(),
    bounceRehearsalTotalRaw: BOUNCE_REHEARSAL_TOTAL.toString(),
    bounceLeaf: `0x${bounceLeaf.toString(16)}`,
  },
};

mkdirSync(resolve(process.cwd(), 'deployments'), { recursive: true });
writeFileSync(resolve(process.cwd(), 'deployments/season-claim-v2.testnet.plan.json'), `${JSON.stringify(plan, null, 2)}\n`);

console.log('SeasonClaimV2 testnet rehearsal');
console.log(`Deployer: ${formatAddress(wallet.address)}`);
console.log(`V2 Jetton master: ${formatAddress(masterAddress)}`);
console.log(`SeasonClaimV2: ${formatAddress(seasonClaim.address)}`);
console.log(`Claim Jetton wallet: ${formatAddress(claimJettonWallet)}`);
console.log(`Send mode: ${send ? 'requested' : 'dry-run'}`);

if (!send) {
  console.log('No transactions sent. Re-run with --send and TON_TESTNET_ALLOW_SEASON_CLAIM_V2_REHEARSAL_SEND=true to execute on testnet.');
  process.exit(0);
}

if (!allowSend) {
  throw new Error('Refusing to send. Set TON_TESTNET_ALLOW_SEASON_CLAIM_V2_REHEARSAL_SEND=true and pass --send.');
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
  return client.open(JettonWalletV2.createFromAddress(jettonWalletFor(owner))).getJettonBalance();
}

async function getJettonBalanceOrZero(owner: Address) {
  const jettonWalletAddress = jettonWalletFor(owner);
  const state = await withRpcRetry('jetton wallet state', () => getContractState(jettonWalletAddress));
  if (state.state !== 'active') return 0n;
  return getJettonBalance(owner);
}

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

const masterData = await withRpcRetry('V2 final getter', () => minter.getJettonData(), 8);
if (masterData.totalSupply !== H72H_V2_TOTAL_SUPPLY - SCALE) {
  console.log(`Warning: testnet total supply is ${masterData.totalSupply}; expected prior rehearsal burn total ${H72H_V2_TOTAL_SUPPLY - SCALE}.`);
}
if (masterData.mintable !== false || masterData.adminAddress !== null) {
  throw new Error('Testnet V2 Jetton is not in fixed-supply non-mintable state.');
}

const walletBalance = await withRpcRetry('wallet balance', () => getBalance(wallet.address));
const ownerJettonBalanceBefore = await withRpcRetry('owner jetton balance', () => getJettonBalanceOrZero(wallet.address));
if (ownerJettonBalanceBefore < FUNDING_TOTAL) {
  throw new Error(`Owner Jetton balance ${ownerJettonBalanceBefore} is below rehearsal funding ${FUNDING_TOTAL}.`);
}
console.log(`Deployer balance: ${fromNano(walletBalance)} TON`);
console.log(`Owner Jetton balance before: ${ownerJettonBalanceBefore}`);

const state = await withRpcRetry('SeasonClaimV2 state', () => getContractState(seasonClaim.address));
if (state.state !== 'active') {
  await sendOpened('deploy SeasonClaimV2', opened as never, null, toNano('0.12'));
  await waitForValue('SeasonClaimV2 active', () => getContractState(seasonClaim.address), (value) => value.state === 'active');
} else {
  console.log('SeasonClaimV2 already active; continuing.');
}

await sendOpened('set SeasonClaimV2 jetton wallet', opened as never, {
  $$type: 'SetSeasonClaimJettonWallet',
  wallet: claimJettonWallet,
});

await transferJettons('fund SeasonClaimV2 rehearsal inventory', seasonClaim.address, FUNDING_TOTAL);
await waitForValue('SeasonClaimV2 funded', () => opened.getGetFunded72H() as Promise<bigint>, (value) => value === FUNDING_TOTAL);

await sendOpened('register SeasonClaimV2 season 1 ref-chain root', opened as never, {
  $$type: 'RegisterSeasonClaim',
  seasonId: 1n,
  merkleRoot: merkle.root,
  totalAmount72H: CLAIM_SEASON_TOTAL,
  personalDepositTotal72H: CLAIM_SEASON_TOTAL * 5000n / 10000n,
  teamDepositTotal72H: CLAIM_SEASON_TOTAL * 2500n / 10000n,
  referralTotal72H: CLAIM_SEASON_TOTAL * 1500n / 10000n,
  leaderboardTotal72H: CLAIM_SEASON_TOTAL * 1000n / 10000n,
  openAt: recentOpenAt,
  evidenceHash: evidenceHash('testnet-season-claim-v2-season-1-root'),
});

await sendOpened('register expired SeasonClaimV2 season 2 root', opened as never, {
  $$type: 'RegisterSeasonClaim',
  seasonId: 2n,
  merkleRoot: evidenceHash('testnet-season-claim-v2-season-2-sweep-root'),
  totalAmount72H: SWEEP_SEASON_TOTAL,
  personalDepositTotal72H: SWEEP_SEASON_TOTAL * 5000n / 10000n,
  teamDepositTotal72H: SWEEP_SEASON_TOTAL * 2500n / 10000n,
  referralTotal72H: SWEEP_SEASON_TOTAL * 1500n / 10000n,
  leaderboardTotal72H: SWEEP_SEASON_TOTAL * 1000n / 10000n,
  openAt: expiredOpenAt,
  evidenceHash: evidenceHash('testnet-season-claim-v2-season-2-root'),
});
await waitForValue('SeasonClaimV2 reserved', () => opened.getGetReserved72H() as Promise<bigint>, (value) => value === FUNDING_TOTAL);

await sendOpened('unlock SeasonClaimV2 stage 1', opened as never, {
  $$type: 'UnlockClaimStage',
  stage: 1n,
  priceUsd9: 10_000_000n,
  observedAt: recentOpenAt,
  evidenceHash: evidenceHash('testnet-season-claim-v2-stage-1'),
});

const ownerBalanceBeforeClaim = await withRpcRetry('owner jetton balance before claim', () => getJettonBalanceOrZero(wallet.address));
await sendOpened('claim SeasonClaimV2 ref-chain proof', opened as never, {
  $$type: 'ClaimSeasonReward',
  queryId: nextQueryId(),
  seasonId: 1n,
  personalDepositAmount72H: LEAF_PERSONAL,
  teamDepositAmount72H: LEAF_TEAM,
  referralAmount72H: LEAF_REFERRAL,
  leaderboardAmount72H: LEAF_LEADERBOARD,
  proof: claimantProof,
}, toNano('0.2'));
await waitForValue('SeasonClaimV2 claimed accounting', () => opened.getGetClaimed72H() as Promise<bigint>, (value) => value === CLAIM_STAGE_ONE_AMOUNT);
await waitForValue('owner received claim transfer', () => getJettonBalanceOrZero(wallet.address), (value) => value >= ownerBalanceBeforeClaim + CLAIM_STAGE_ONE_AMOUNT);

const ownerBalanceBeforeSweep = await withRpcRetry('owner jetton balance before sweep', () => getJettonBalanceOrZero(wallet.address));
await sendOpened('sweep expired SeasonClaimV2 season 2', opened as never, {
  $$type: 'SweepExpiredSeasonClaim',
  seasonId: 2n,
}, toNano('0.2'));
await waitForValue('SeasonClaimV2 reserved after sweep', () => opened.getGetReserved72H() as Promise<bigint>, (value) => value === CLAIM_SEASON_TOTAL);
await waitForValue('owner received sweep transfer', () => getJettonBalanceOrZero(wallet.address), (value) => value >= ownerBalanceBeforeSweep + SWEEP_SEASON_TOTAL);

const bounceClaimState = await withRpcRetry('Bounce SeasonClaimV2 state', () => getContractState(bounceSeasonClaim.address));
if (bounceClaimState.state !== 'active') {
  await sendOpened('deploy bounce SeasonClaimV2', openedBounceClaim as never, null, toNano('0.12'));
  await waitForValue('bounce SeasonClaimV2 active', () => getContractState(bounceSeasonClaim.address), (value) => value.state === 'active');
}
const bouncingWalletState = await withRpcRetry('BouncingJettonWallet state', () => getContractState(bouncingJettonWallet.address));
if (bouncingWalletState.state !== 'active') {
  await sendOpened('deploy bouncing Jetton wallet mock', openedBouncingWallet as never, null, toNano('0.12'));
  await waitForValue('bouncing Jetton wallet active', () => getContractState(bouncingJettonWallet.address), (value) => value.state === 'active');
}
await sendOpened('set bounce SeasonClaimV2 jetton wallet', openedBounceClaim as never, {
  $$type: 'SetSeasonClaimJettonWallet',
  wallet: bouncingJettonWallet.address,
});
await sendOpened('mock-fund bounce SeasonClaimV2', openedBouncingWallet as never, {
  $$type: 'MockSeasonClaimV2Funding',
  queryId: nextQueryId(),
  amount: BOUNCE_REHEARSAL_TOTAL,
});
await waitForValue('bounce SeasonClaimV2 funded', () => openedBounceClaim.getGetFunded72H() as Promise<bigint>, (value) => value === BOUNCE_REHEARSAL_TOTAL);
await sendOpened('register bounce SeasonClaimV2 season root', openedBounceClaim as never, {
  $$type: 'RegisterSeasonClaim',
  seasonId: 1n,
  merkleRoot: bounceLeaf,
  totalAmount72H: BOUNCE_REHEARSAL_TOTAL,
  personalDepositTotal72H: LEAF_PERSONAL,
  teamDepositTotal72H: LEAF_TEAM,
  referralTotal72H: LEAF_REFERRAL,
  leaderboardTotal72H: LEAF_LEADERBOARD,
  openAt: recentOpenAt,
  evidenceHash: evidenceHash('testnet-season-claim-v2-bounce-root'),
});
await sendOpened('unlock bounce SeasonClaimV2 stage 1', openedBounceClaim as never, {
  $$type: 'UnlockClaimStage',
  stage: 1n,
  priceUsd9: 10_000_000n,
  observedAt: recentOpenAt,
  evidenceHash: evidenceHash('testnet-season-claim-v2-bounce-stage-1'),
});
const bounceQueryId = nextQueryId();
await sendOpened('claim bounce SeasonClaimV2 and expect rollback', openedBounceClaim as never, {
  $$type: 'ClaimSeasonReward',
  queryId: bounceQueryId,
  seasonId: 1n,
  personalDepositAmount72H: LEAF_PERSONAL,
  teamDepositAmount72H: LEAF_TEAM,
  referralAmount72H: LEAF_REFERRAL,
  leaderboardAmount72H: LEAF_LEADERBOARD,
  proof: beginCell().endCell(),
}, toNano('0.2'));
await waitForValue('bounce SeasonClaimV2 rollback claimed', () => openedBounceClaim.getGetClaimed72H() as Promise<bigint>, (value) => value === 0n);
await waitForValue('bounce SeasonClaimV2 pending cleared', () => openedBounceClaim.getGetPendingClaimAmount(bounceQueryId) as Promise<bigint>, (value) => value === 0n);

const finalGetter = {
  SeasonClaimV2: {
    funded72H: (await opened.getGetFunded72H()).toString(),
    reserved72H: (await opened.getGetReserved72H()).toString(),
    claimed72H: (await opened.getGetClaimed72H()).toString(),
    season1Root: (await opened.getGetSeasonRoot(1n)).toString(),
    season1Total72H: (await opened.getGetSeasonTotal(1n)).toString(),
    season1Claimed72H: (await opened.getGetSeasonClaimed(1n)).toString(),
    season1Pending72H: (await opened.getGetPendingClaimAmountBySeason(1n)).toString(),
    season2Total72H: (await opened.getGetSeasonTotal(2n)).toString(),
  },
  BounceSeasonClaimV2: {
    funded72H: (await openedBounceClaim.getGetFunded72H()).toString(),
    reserved72H: (await openedBounceClaim.getGetReserved72H()).toString(),
    claimed72H: (await openedBounceClaim.getGetClaimed72H()).toString(),
    pendingBounceClaim72H: (await openedBounceClaim.getGetPendingClaimAmount(bounceQueryId)).toString(),
  },
  balances: {
    ownerJettonBefore: ownerJettonBalanceBefore.toString(),
    ownerJettonAfter: (await getJettonBalanceOrZero(wallet.address)).toString(),
    claimJettonWallet: (await getJettonBalanceOrZero(seasonClaim.address)).toString(),
  },
};

const evidence = {
  ...plan,
  completedAt: new Date().toISOString(),
  actions,
  finalGetter,
};
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const timestampedPath = resolve(process.cwd(), `deployments/season-claim-v2.testnet.${timestamp}.json`);
const latestPath = resolve(process.cwd(), 'deployments/season-claim-v2.testnet.latest.json');
writeFileSync(timestampedPath, `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(latestPath, `${JSON.stringify(evidence, null, 2)}\n`);

console.log('SeasonClaimV2 testnet rehearsal completed.');
console.log(`Evidence: ${timestampedPath}`);
