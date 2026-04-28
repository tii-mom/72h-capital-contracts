import { CAPITAL_RULEBOOK, getAlphaThreshold72H } from '../config/capital.constants.js';
import type { CapitalAppSlug, CapitalSeatType, GasPayer, RewardTokenSymbol } from '../types/domain.js';

export const TRANSACTION_PAYLOAD_SCAFFOLD_VERSION = '72h-capital-transaction-payload-scaffold/v1' as const;
export const TRANSACTION_PAYLOAD_SCAFFOLD_ENCODING = 'base64(json-scaffold)' as const;
export const TRANSACTION_REQUEST_PROTOCOL = 'ton-connect' as const;
export const TRANSACTION_REQUEST_PROTOCOL_VERSION = 'v2' as const;
export const TRANSACTION_REQUEST_METHOD_KIND = 'message-boundary-scaffold' as const;

export type CapitalTransactionPayloadAction =
  | 'reserve.allocate'
  | 'reserve.redeem'
  | 'alpha.allocate'
  | 'reward.claim';

export type CapitalTransactionPayloadContract = 'ReserveVault' | 'AlphaVault' | 'AppRewardPool';

export type CapitalTransactionPayloadEntrypoint =
  | 'allocateReserve'
  | 'redeemReserve'
  | 'allocateAlpha'
  | 'claimReward';

export interface Normalized72HAmount {
  readonly token: RewardTokenSymbol;
  readonly amount72H: bigint;
  readonly amount72HString: string;
}

export interface TransactionPayloadScaffoldMeta {
  readonly version: typeof TRANSACTION_PAYLOAD_SCAFFOLD_VERSION;
  readonly encoding: typeof TRANSACTION_PAYLOAD_SCAFFOLD_ENCODING;
  readonly productionReady: false;
  readonly gasPayer: GasPayer;
  readonly notes: readonly string[];
}

export interface TransactionRequestProtocolMeta {
  readonly name: typeof TRANSACTION_REQUEST_PROTOCOL;
  readonly version: typeof TRANSACTION_REQUEST_PROTOCOL_VERSION;
}

export interface TransactionRequestMethodMeta<
  TAction extends CapitalTransactionPayloadAction,
  TContract extends CapitalTransactionPayloadContract,
  TEntrypoint extends CapitalTransactionPayloadEntrypoint,
> {
  readonly kind: typeof TRANSACTION_REQUEST_METHOD_KIND;
  readonly action: TAction;
  readonly contract: TContract;
  readonly entrypoint: TEntrypoint;
}

export interface TransactionRequestScaffold<
  TAction extends CapitalTransactionPayloadAction,
  TContract extends CapitalTransactionPayloadContract,
  TEntrypoint extends CapitalTransactionPayloadEntrypoint,
  TPayload extends object,
> {
  readonly operation: TAction;
  readonly protocol: TransactionRequestProtocolMeta;
  readonly method: TransactionRequestMethodMeta<TAction, TContract, TEntrypoint>;
  readonly to: {
    readonly contract: TContract;
    readonly app: CapitalAppSlug;
    readonly address: null;
  };
  readonly entrypoint: TEntrypoint;
  readonly nativeValueNanoTon: null;
  readonly payloadEncoding: typeof TRANSACTION_PAYLOAD_SCAFFOLD_ENCODING;
  readonly payloadJson: Readonly<TPayload>;
  readonly payloadUtf8: string;
  readonly payloadBase64: string;
}

export interface TransactionPayloadScaffold<
  TAction extends CapitalTransactionPayloadAction,
  TContract extends CapitalTransactionPayloadContract,
  TEntrypoint extends CapitalTransactionPayloadEntrypoint,
  TParameters extends object,
  TPayload extends object,
> {
  readonly scaffold: TransactionPayloadScaffoldMeta;
  readonly action: TAction;
  readonly target: {
    readonly contract: TContract;
    readonly app: CapitalAppSlug;
    readonly entrypoint: TEntrypoint;
  };
  readonly parameters: Readonly<TParameters>;
  readonly transactionRequestScaffold: TransactionRequestScaffold<TAction, TContract, TEntrypoint, TPayload>;
}

export interface ReserveAllocatePayloadScaffoldInput {
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly amount72H: bigint;
}

export interface ReserveAllocatePayloadScaffoldParameters {
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly amount: Normalized72HAmount;
}

interface ReserveAllocatePayloadScaffoldJson {
  readonly schema: typeof TRANSACTION_PAYLOAD_SCAFFOLD_VERSION;
  readonly productionReady: false;
  readonly action: 'reserve.allocate';
  readonly contract: 'ReserveVault';
  readonly entrypoint: 'allocateReserve';
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly amount72H: string;
}

export type ReserveAllocatePayloadScaffold = TransactionPayloadScaffold<
  'reserve.allocate',
  'ReserveVault',
  'allocateReserve',
  ReserveAllocatePayloadScaffoldParameters,
  ReserveAllocatePayloadScaffoldJson
>;

export interface ReserveRedeemPayloadScaffoldInput {
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly requestedAmount72H: bigint;
}

export interface ReserveRedeemPayloadScaffoldParameters {
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly requestedAmount: Normalized72HAmount;
}

interface ReserveRedeemPayloadScaffoldJson {
  readonly schema: typeof TRANSACTION_PAYLOAD_SCAFFOLD_VERSION;
  readonly productionReady: false;
  readonly action: 'reserve.redeem';
  readonly contract: 'ReserveVault';
  readonly entrypoint: 'redeemReserve';
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly requestedAmount72H: string;
}

export type ReserveRedeemPayloadScaffold = TransactionPayloadScaffold<
  'reserve.redeem',
  'ReserveVault',
  'redeemReserve',
  ReserveRedeemPayloadScaffoldParameters,
  ReserveRedeemPayloadScaffoldJson
>;

export interface AlphaAllocatePayloadScaffoldInput {
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly amount72H: bigint;
}

export interface AlphaAllocatePayloadScaffoldParameters {
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly amount: Normalized72HAmount;
}

interface AlphaAllocatePayloadScaffoldJson {
  readonly schema: typeof TRANSACTION_PAYLOAD_SCAFFOLD_VERSION;
  readonly productionReady: false;
  readonly action: 'alpha.allocate';
  readonly contract: 'AlphaVault';
  readonly entrypoint: 'allocateAlpha';
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly amount72H: string;
}

export type AlphaAllocatePayloadScaffold = TransactionPayloadScaffold<
  'alpha.allocate',
  'AlphaVault',
  'allocateAlpha',
  AlphaAllocatePayloadScaffoldParameters,
  AlphaAllocatePayloadScaffoldJson
>;

export interface RewardClaimPayloadScaffoldInput {
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly seatType: CapitalSeatType;
}

export interface RewardClaimPayloadScaffoldParameters {
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly seatType: CapitalSeatType;
}

interface ReserveRewardClaimPayloadScaffoldJson {
  readonly schema: typeof TRANSACTION_PAYLOAD_SCAFFOLD_VERSION;
  readonly productionReady: false;
  readonly action: 'reward.claim';
  readonly contract: 'AppRewardPool';
  readonly entrypoint: 'claimReward';
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly seatType: 'reserve';
}

interface AlphaRewardClaimPayloadScaffoldJson {
  readonly schema: typeof TRANSACTION_PAYLOAD_SCAFFOLD_VERSION;
  readonly productionReady: false;
  readonly action: 'reward.claim';
  readonly contract: 'AppRewardPool';
  readonly entrypoint: 'claimReward';
  readonly app: CapitalAppSlug;
  readonly owner: string;
  readonly seatType: 'alpha';
}

export type RewardClaimPayloadScaffold =
  | TransactionPayloadScaffold<
      'reward.claim',
      'AppRewardPool',
      'claimReward',
      RewardClaimPayloadScaffoldParameters & { readonly seatType: 'reserve' },
      ReserveRewardClaimPayloadScaffoldJson
    >
  | TransactionPayloadScaffold<
      'reward.claim',
      'AppRewardPool',
      'claimReward',
      RewardClaimPayloadScaffoldParameters & { readonly seatType: 'alpha' },
      AlphaRewardClaimPayloadScaffoldJson
    >;

const SCAFFOLD_NOTES = [
  'Scaffold only: this payload is JSON + base64 for cross-repo alignment, not a finalized TON cell or BOC.',
  'Contract addresses, native TON value, op codes, and TL-B layout remain unresolved placeholders.',
  'Action semantics still come from the TypeScript state machines and mirrored Tact placeholders in this repo.',
] as const;

function normalize72HAmount(amount72H: bigint): Normalized72HAmount {
  assertPositiveAmount(amount72H);

  return {
    token: CAPITAL_RULEBOOK.shared.rewardToken,
    amount72H,
    amount72HString: amount72H.toString(),
  };
}

function assertPositiveAmount(amount72H: bigint) {
  if (amount72H <= 0n) {
    throw new Error('Amount must be positive.');
  }
}

function encodePayloadScaffold(payload: object) {
  const payloadUtf8 = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadUtf8, 'utf8').toString('base64');

  validateEncodedPayload(payload, payloadUtf8, payloadBase64);

  return {
    payloadUtf8,
    payloadBase64,
  };
}

function validateEncodedPayload(payload: object, payloadUtf8: string, payloadBase64: string) {
  const expectedPayloadUtf8 = JSON.stringify(payload);
  if (payloadUtf8 !== expectedPayloadUtf8) {
    throw new Error('Transaction payload scaffold JSON encoding is not deterministic.');
  }

  const decodedPayloadUtf8 = Buffer.from(payloadBase64, 'base64').toString('utf8');
  if (decodedPayloadUtf8 !== payloadUtf8) {
    throw new Error('Transaction payload scaffold base64 does not round-trip to JSON.');
  }

  const parsedPayload = JSON.parse(payloadUtf8);
  const canonicalPayloadUtf8 = JSON.stringify(parsedPayload);
  if (canonicalPayloadUtf8 !== payloadUtf8) {
    throw new Error('Transaction payload scaffold JSON is not canonical.');
  }
}

function buildTransactionPayloadScaffold<
  TAction extends CapitalTransactionPayloadAction,
  TContract extends CapitalTransactionPayloadContract,
  TEntrypoint extends CapitalTransactionPayloadEntrypoint,
  TParameters extends { readonly app: CapitalAppSlug },
  TPayload extends object,
>({
  action,
  contract,
  entrypoint,
  parameters,
  payloadJson,
}: {
  readonly action: TAction;
  readonly contract: TContract;
  readonly entrypoint: TEntrypoint;
  readonly parameters: TParameters;
  readonly payloadJson: TPayload;
}): TransactionPayloadScaffold<TAction, TContract, TEntrypoint, TParameters, TPayload> {
  const { payloadUtf8, payloadBase64 } = encodePayloadScaffold(payloadJson);

  return {
    scaffold: {
      version: TRANSACTION_PAYLOAD_SCAFFOLD_VERSION,
      encoding: TRANSACTION_PAYLOAD_SCAFFOLD_ENCODING,
      productionReady: false,
      gasPayer: CAPITAL_RULEBOOK.shared.gasPayer,
      notes: SCAFFOLD_NOTES,
    },
    action,
    target: {
      contract,
      app: parameters.app,
      entrypoint,
    },
    parameters,
    transactionRequestScaffold: {
      operation: action,
      protocol: {
        name: TRANSACTION_REQUEST_PROTOCOL,
        version: TRANSACTION_REQUEST_PROTOCOL_VERSION,
      },
      method: {
        kind: TRANSACTION_REQUEST_METHOD_KIND,
        action,
        contract,
        entrypoint,
      },
      to: {
        contract,
        app: parameters.app,
        address: null,
      },
      entrypoint,
      nativeValueNanoTon: null,
      payloadEncoding: TRANSACTION_PAYLOAD_SCAFFOLD_ENCODING,
      payloadJson,
      payloadUtf8,
      payloadBase64,
    },
  };
}

export function createReserveAllocatePayloadScaffold(
  input: ReserveAllocatePayloadScaffoldInput,
): ReserveAllocatePayloadScaffold {
  const amount = normalize72HAmount(input.amount72H);

  if (amount.amount72H < CAPITAL_RULEBOOK.reserve.threshold72H) {
    throw new Error(`Reserve allocation must be at least ${CAPITAL_RULEBOOK.reserve.threshold72H} 72H.`);
  }

  return buildTransactionPayloadScaffold({
    action: 'reserve.allocate',
    contract: 'ReserveVault',
    entrypoint: 'allocateReserve',
    parameters: {
      app: input.app,
      owner: input.owner,
      amount,
    },
    payloadJson: {
      schema: TRANSACTION_PAYLOAD_SCAFFOLD_VERSION,
      productionReady: false,
      action: 'reserve.allocate',
      contract: 'ReserveVault',
      entrypoint: 'allocateReserve',
      app: input.app,
      owner: input.owner,
      amount72H: amount.amount72HString,
    },
  });
}

export function createReserveRedeemPayloadScaffold(
  input: ReserveRedeemPayloadScaffoldInput,
): ReserveRedeemPayloadScaffold {
  const requestedAmount = normalize72HAmount(input.requestedAmount72H);

  return buildTransactionPayloadScaffold({
    action: 'reserve.redeem',
    contract: 'ReserveVault',
    entrypoint: 'redeemReserve',
    parameters: {
      app: input.app,
      owner: input.owner,
      requestedAmount,
    },
    payloadJson: {
      schema: TRANSACTION_PAYLOAD_SCAFFOLD_VERSION,
      productionReady: false,
      action: 'reserve.redeem',
      contract: 'ReserveVault',
      entrypoint: 'redeemReserve',
      app: input.app,
      owner: input.owner,
      requestedAmount72H: requestedAmount.amount72HString,
    },
  });
}

export function createAlphaAllocatePayloadScaffold(
  input: AlphaAllocatePayloadScaffoldInput,
): AlphaAllocatePayloadScaffold {
  const amount = normalize72HAmount(input.amount72H);
  const threshold72H = getAlphaThreshold72H(input.app);

  if (amount.amount72H < threshold72H) {
    throw new Error(`Alpha allocation must be at least ${threshold72H} 72H for ${input.app}.`);
  }

  return buildTransactionPayloadScaffold({
    action: 'alpha.allocate',
    contract: 'AlphaVault',
    entrypoint: 'allocateAlpha',
    parameters: {
      app: input.app,
      owner: input.owner,
      amount,
    },
    payloadJson: {
      schema: TRANSACTION_PAYLOAD_SCAFFOLD_VERSION,
      productionReady: false,
      action: 'alpha.allocate',
      contract: 'AlphaVault',
      entrypoint: 'allocateAlpha',
      app: input.app,
      owner: input.owner,
      amount72H: amount.amount72HString,
    },
  });
}

export function createRewardClaimPayloadScaffold(input: RewardClaimPayloadScaffoldInput): RewardClaimPayloadScaffold {
  if (input.seatType === 'reserve') {
    return buildTransactionPayloadScaffold({
      action: 'reward.claim',
      contract: 'AppRewardPool',
      entrypoint: 'claimReward',
      parameters: {
        app: input.app,
        owner: input.owner,
        seatType: 'reserve',
      },
      payloadJson: {
        schema: TRANSACTION_PAYLOAD_SCAFFOLD_VERSION,
        productionReady: false,
        action: 'reward.claim',
        contract: 'AppRewardPool',
        entrypoint: 'claimReward',
        app: input.app,
        owner: input.owner,
        seatType: 'reserve',
      },
    });
  }

  if (input.seatType === 'alpha') {
    return buildTransactionPayloadScaffold({
      action: 'reward.claim',
      contract: 'AppRewardPool',
      entrypoint: 'claimReward',
      parameters: {
        app: input.app,
        owner: input.owner,
        seatType: 'alpha',
      },
      payloadJson: {
        schema: TRANSACTION_PAYLOAD_SCAFFOLD_VERSION,
        productionReady: false,
        action: 'reward.claim',
        contract: 'AppRewardPool',
        entrypoint: 'claimReward',
        app: input.app,
        owner: input.owner,
        seatType: 'alpha',
      },
    });
  }

  throw new Error(`Unsupported seat type for reward claim scaffold: ${input.seatType}.`);
}
