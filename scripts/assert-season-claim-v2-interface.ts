import { readFileSync } from 'node:fs';
import { Cell } from '@ton/core';

type AbiField = {
  readonly name: string;
};

type AbiType = {
  readonly name: string;
  readonly header?: number | null;
  readonly fields?: readonly AbiField[];
};

type AbiGetter = {
  readonly name: string;
  readonly arguments?: readonly AbiField[];
};

type Abi = {
  readonly types: readonly AbiType[];
  readonly getters: readonly AbiGetter[];
  readonly errors: Record<string, { readonly message: string }>;
};

const expectedCodeHashes = {
  seasonClaimV2: '99b63712844f6032a34b10e52b2e8daa0eebc2e265603cc2176a5df7f6e02c26',
  bridge: '86f767f5d56675c0b9c11c76f949022e4ddc1b12cb318a3c5f0a1105c3b83c76',
};

const paths = {
  seasonClaimV2Abi: 'build/tact/SeasonClaimV2/SeasonClaimV2_SeasonClaimV2.abi',
  seasonClaimV2Code: 'build/tact/SeasonClaimV2/SeasonClaimV2_SeasonClaimV2.code.boc',
  seasonClaimV2Wrapper: 'build/tact/SeasonClaimV2/SeasonClaimV2_SeasonClaimV2.ts',
  bridgeAbi: 'build/tact/SeasonClaimV2LegacyBridge/SeasonClaimV2LegacyBridge_SeasonClaimV2LegacyBridge.abi',
  bridgeCode: 'build/tact/SeasonClaimV2LegacyBridge/SeasonClaimV2LegacyBridge_SeasonClaimV2LegacyBridge.code.boc',
  bridgeWrapper: 'build/tact/SeasonClaimV2LegacyBridge/SeasonClaimV2LegacyBridge_SeasonClaimV2LegacyBridge.ts',
};

const seasonClaimV2Messages: Record<string, { readonly header: number; readonly fields: readonly string[] }> = {
  SetSeasonClaimJettonWallet: { header: 0x72070001, fields: ['wallet'] },
  RegisterClaimRound: { header: 0x72070002, fields: ['roundId', 'merkleRoot', 'totalAmount72H', 'openAt', 'evidenceHash'] },
  UnlockClaimStage: { header: 0x72070003, fields: ['stage', 'priceUsd9', 'observedAt', 'evidenceHash'] },
  ClaimSeasonReward: {
    header: 0x72070004,
    fields: ['queryId', 'seasonId', 'personalDepositAmount72H', 'teamDepositAmount72H', 'referralAmount72H', 'leaderboardAmount72H', 'proof'],
  },
  SweepExpiredClaimRound: { header: 0x72070006, fields: ['roundId'] },
  SetSeasonClaimSeasonVault: { header: 0x72070007, fields: ['seasonVault'] },
  SettleSeasonClaimPending: { header: 0x72070008, fields: ['queryId'] },
  RegisterSeasonClaim: {
    header: 0x72070009,
    fields: [
      'seasonId',
      'merkleRoot',
      'totalAmount72H',
      'personalDepositTotal72H',
      'teamDepositTotal72H',
      'referralTotal72H',
      'leaderboardTotal72H',
      'openAt',
      'evidenceHash',
    ],
  },
  SweepExpiredSeasonClaim: { header: 0x7207000a, fields: ['seasonId'] },
  ConfirmSeasonClaimFunding: { header: 0x7207000b, fields: ['queryId', 'amount72H'] },
};

const seasonClaimV2Getters = [
  'getUnlockedBps',
  'getRewardAppId',
  'getPersonalDepositBps',
  'getTeamDepositBps',
  'getReferralBps',
  'getLeaderboardBps',
  'getFunded72H',
  'getReserved72H',
  'getClaimed72H',
  'getRoundRoot(roundId)',
  'getSeasonRoot(seasonId)',
  'getRoundTotal(roundId)',
  'getSeasonTotal(seasonId)',
  'getSeasonPersonalDepositTotal(seasonId)',
  'getSeasonTeamDepositTotal(seasonId)',
  'getSeasonReferralTotal(seasonId)',
  'getSeasonLeaderboardTotal(seasonId)',
  'getRoundClaimed(roundId)',
  'getSeasonClaimed(seasonId)',
  'getClaimedByLeaf(leaf)',
  'getPendingClaimAmount(queryId)',
  'getPendingClaimOpenedAt(queryId)',
  'getPendingClaimAmountByRound(roundId)',
  'getPendingClaimAmountBySeason(seasonId)',
  'getClaimWindowSeconds',
  'getBounceGraceSeconds',
];

const bridgeMessages: Record<string, { readonly header: number; readonly fields: readonly string[] }> = {
  SetSeasonClaimV2BridgeJettonWallet: { header: 0x72071001, fields: ['wallet'] },
  ClaimLegacySeasonForV2: {
    header: 0x72071002,
    fields: [
      'queryId',
      'seasonId',
      'personalDepositAmount72H',
      'teamDepositAmount72H',
      'referralAmount72H',
      'leaderboardAmount72H',
      'expectedClaimAmount72H',
      'proof',
    ],
  },
  ForwardBridgeWalletToV2: { header: 0x72071003, fields: ['queryId', 'amount72H'] },
  SetSeasonClaimV2BridgeTarget: { header: 0x72071004, fields: ['seasonClaimV2'] },
};

const bridgeGetters = [
  'getLegacyClaimRequested72H',
  'getForwardedToV272H',
  'getPendingForward72H',
  'getExpectedAvailableToForward72H',
  'getPendingLegacyAmount(queryId)',
  'getPendingForwardAmount(queryId)',
  'getCompletedForwardAmount(queryId)',
  'getConfigurationLocked',
];

const selectedErrors: Record<string, Record<string, string>> = {
  SeasonClaimV2: {
    '6437': 'invalid proof bits',
    '11815': 'invalid proof refs',
    '26047': 'invalid wallet sender',
    '33336': 'invalid bounced amount',
    '35392': 'claim bounce grace',
    '48137': 'owner only',
    '49425': 'empty proof continuation',
  },
  SeasonClaimV2LegacyBridge: {
    '12332': 'forward query completed',
    '13195': 'amount exceeds expected inventory',
    '18947': 'invalid forward confirm amount',
    '25405': 'manual forward query required',
    '45945': 'forward query pending',
    '49126': 'season claim v2 only',
    '50664': 'wallet locked after activity',
    '61102': 'legacy query reserved',
  },
};
const seasonClaimV2SelectedErrors = selectedErrors.SeasonClaimV2;
const bridgeSelectedErrors = selectedErrors.SeasonClaimV2LegacyBridge;

if (!seasonClaimV2SelectedErrors || !bridgeSelectedErrors) {
  throw new Error('Selected error assertions are incomplete.');
}

function readAbi(path: string): Abi {
  return JSON.parse(readFileSync(path, 'utf8')) as Abi;
}

function codeHash(path: string): string {
  const [cell] = Cell.fromBoc(readFileSync(path));
  if (!cell) {
    throw new Error(`Missing code cell in ${path}`);
  }
  return cell.hash().toString('hex');
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch.\nActual: ${JSON.stringify(actual)}\nExpected: ${JSON.stringify(expected)}`);
  }
}

function assertMessages(abi: Abi, expected: Record<string, { readonly header: number; readonly fields: readonly string[] }>, label: string) {
  const byName = new Map(abi.types.map((type) => [type.name, type]));
  for (const [name, spec] of Object.entries(expected)) {
    const type = byName.get(name);
    if (!type) {
      throw new Error(`${label} missing message ${name}`);
    }
    assertEqual(type.header, spec.header, `${label}.${name} opcode`);
    assertEqual((type.fields ?? []).map((field) => field.name), spec.fields, `${label}.${name} fields`);
  }
}

function getterSignature(getter: AbiGetter): string {
  const args = (getter.arguments ?? []).map((arg) => arg.name).join(', ');
  return args ? `${getter.name}(${args})` : getter.name;
}

function assertGetters(abi: Abi, expected: readonly string[], label: string) {
  assertEqual(abi.getters.map(getterSignature), expected, `${label} getters`);
}

function assertErrors(abi: Abi, expected: Record<string, string>, label: string) {
  for (const [code, message] of Object.entries(expected)) {
    assertEqual(abi.errors[code]?.message, message, `${label} error ${code}`);
  }
}

readFileSync(paths.seasonClaimV2Wrapper, 'utf8');
readFileSync(paths.bridgeWrapper, 'utf8');

assertEqual(codeHash(paths.seasonClaimV2Code), expectedCodeHashes.seasonClaimV2, 'SeasonClaimV2 code hash');
assertEqual(codeHash(paths.bridgeCode), expectedCodeHashes.bridge, 'SeasonClaimV2LegacyBridge code hash');

const seasonClaimV2Abi = readAbi(paths.seasonClaimV2Abi);
const bridgeAbi = readAbi(paths.bridgeAbi);

assertMessages(seasonClaimV2Abi, seasonClaimV2Messages, 'SeasonClaimV2');
assertGetters(seasonClaimV2Abi, seasonClaimV2Getters, 'SeasonClaimV2');
assertErrors(seasonClaimV2Abi, seasonClaimV2SelectedErrors, 'SeasonClaimV2');

assertMessages(bridgeAbi, bridgeMessages, 'SeasonClaimV2LegacyBridge');
assertGetters(bridgeAbi, bridgeGetters, 'SeasonClaimV2LegacyBridge');
assertErrors(bridgeAbi, bridgeSelectedErrors, 'SeasonClaimV2LegacyBridge');

console.log('SeasonClaimV2 stable interface assertion passed.');
