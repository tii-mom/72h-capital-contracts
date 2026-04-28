import { Address, beginCell, type Cell } from '@ton/core';
import type { CapitalAppSlug } from '../types/domain.js';

export const H72H_JETTON_DECIMALS = 9n;
export const H72H_JETTON_SCALE = 10n ** H72H_JETTON_DECIMALS;

export const CAPITAL_APP_IDS: Readonly<Record<CapitalAppSlug, number>> = {
  '72hours': 1,
  wan: 2,
  'multi-millionaire': 3,
};

export const TACT_MESSAGE_OPCODES = {
  TestJetton72H: {
    MintTest72H: 0x72000001,
  },
  JettonWallet: {
    Transfer: 0x0f8a7ea5,
    InternalTransfer: 0x178d4519,
    TransferNotification: 0x7362d09c,
    Excesses: 0xd53276db,
    Burn: 0x595f07bc,
    BurnNotification: 0x7bdd97de,
  },
  CapitalRegistry: {
    RegisterApp: 0x72010001,
    BindReserveVault: 0x72010002,
    AssignReserveSeat: 0x72010003,
  },
  ReserveVault: {
    RecordPrincipalRedeem: 0x72020003,
    ForwardAllocate: 0x72020001,
    ForwardTopUp: 0x72020002,
    SetVaultJettonWallet: 0x72020005,
  },
  AppRewardPool: {
    ClaimReward: 0x72050001,
    RegisterRewardSeat: 0x72050002,
    FinalizeRewardClaim: 0x72050003,
    SetPoolJettonWallet: 0x72050004,
  },
} as const;

export type TactMessageContract = keyof typeof TACT_MESSAGE_OPCODES;

export interface EncodedTactMessageCell {
  readonly contract: TactMessageContract;
  readonly message: string;
  readonly opcode: number;
  readonly body: Cell;
  readonly payloadBase64: string;
  readonly payloadEncoding: 'base64(tact-cell-boc)';
  readonly productionReady: true;
}

export function to72HJettonUnits(amount72H: bigint) {
  if (amount72H <= 0n) {
    throw new Error('72H amount must be positive.');
  }

  return amount72H * H72H_JETTON_SCALE;
}

export function toTonConnectPayloadBase64(body: Cell) {
  return body.toBoc({ idx: false }).toString('base64');
}

function encodeMessage(
  contract: TactMessageContract,
  message: string,
  opcode: number,
  body: Cell,
): EncodedTactMessageCell {
  return {
    contract,
    message,
    opcode,
    body,
    payloadBase64: toTonConnectPayloadBase64(body),
    payloadEncoding: 'base64(tact-cell-boc)',
    productionReady: true,
  };
}

export function getCapitalAppId(app: CapitalAppSlug) {
  return CAPITAL_APP_IDS[app];
}

export function createRegisterAppMessageCell(app: CapitalAppSlug) {
  const opcode = TACT_MESSAGE_OPCODES.CapitalRegistry.RegisterApp;
  const body = beginCell()
    .storeUint(opcode, 32)
    .storeUint(getCapitalAppId(app), 8)
    .endCell();

  return encodeMessage('CapitalRegistry', 'RegisterApp', opcode, body);
}

export function createBindReserveVaultMessageCell(input: {
  readonly app: CapitalAppSlug;
  readonly vault: string | Address;
}) {
  const opcode = TACT_MESSAGE_OPCODES.CapitalRegistry.BindReserveVault;
  const vault = typeof input.vault === 'string' ? Address.parse(input.vault) : input.vault;
  const body = beginCell()
    .storeUint(opcode, 32)
    .storeUint(getCapitalAppId(input.app), 8)
    .storeAddress(vault)
    .endCell();

  return encodeMessage('CapitalRegistry', 'BindReserveVault', opcode, body);
}

export function createAssignReserveSeatMessageCell(input: {
  readonly app: CapitalAppSlug;
  readonly owner: string | Address;
}) {
  const opcode = TACT_MESSAGE_OPCODES.CapitalRegistry.AssignReserveSeat;
  const owner = typeof input.owner === 'string' ? Address.parse(input.owner) : input.owner;
  const body = beginCell()
    .storeUint(opcode, 32)
    .storeUint(getCapitalAppId(input.app), 8)
    .storeAddress(owner)
    .endCell();

  return encodeMessage('CapitalRegistry', 'AssignReserveSeat', opcode, body);
}

function createReserveForwardPayload(input: {
  readonly app: CapitalAppSlug;
  readonly action: 'allocate' | 'top-up';
}) {
  return beginCell()
    .storeUint(
      input.action === 'allocate'
        ? TACT_MESSAGE_OPCODES.ReserveVault.ForwardAllocate
        : TACT_MESSAGE_OPCODES.ReserveVault.ForwardTopUp,
      32,
    )
    .storeUint(getCapitalAppId(input.app), 8);
}

export function createReserveJettonTransferMessageCell(input: {
  readonly app: CapitalAppSlug;
  readonly userJettonWallet: string | Address;
  readonly reserveVault: string | Address;
  readonly responseDestination: string | Address;
  readonly amount72H: bigint;
  readonly queryId?: bigint;
  readonly forwardTonAmountNanoTon?: bigint;
  readonly action?: 'allocate' | 'top-up';
}) {
  const opcode = TACT_MESSAGE_OPCODES.JettonWallet.Transfer;
  const reserveVault = typeof input.reserveVault === 'string' ? Address.parse(input.reserveVault) : input.reserveVault;
  const responseDestination =
    typeof input.responseDestination === 'string'
      ? Address.parse(input.responseDestination)
      : input.responseDestination;
  const forwardTonAmount = input.forwardTonAmountNanoTon ?? 10_000_000n;
  const forwardPayload = createReserveForwardPayload({
    app: input.app,
    action: input.action ?? 'allocate',
  });
  const body = beginCell()
    .storeUint(opcode, 32)
    .storeUint(input.queryId ?? 0n, 64)
    .storeCoins(to72HJettonUnits(input.amount72H))
    .storeAddress(reserveVault)
    .storeAddress(responseDestination)
    .storeMaybeRef(null)
    .storeCoins(forwardTonAmount)
    .storeBit(false)
    .storeBuilder(forwardPayload)
    .endCell();

  return {
    ...encodeMessage('JettonWallet', 'JettonTransfer', opcode, body),
    userJettonWallet:
      typeof input.userJettonWallet === 'string'
        ? Address.parse(input.userJettonWallet)
        : input.userJettonWallet,
    reserveVault,
    responseDestination,
    forwardTonAmountNanoTon: forwardTonAmount,
  };
}

export function createReserveRedeemRequestMessageCell(input: {
  readonly lotId?: number;
  readonly amount72H: bigint;
}) {
  const opcode = TACT_MESSAGE_OPCODES.ReserveVault.RecordPrincipalRedeem;
  const body = beginCell()
    .storeUint(opcode, 32)
    .storeUint(input.lotId ?? 1, 32)
    .storeCoins(to72HJettonUnits(input.amount72H))
    .endCell();

  return encodeMessage('ReserveVault', 'RecordPrincipalRedeem', opcode, body);
}

export function createSetVaultJettonWalletMessageCell(input: {
  readonly wallet: string | Address;
}) {
  const opcode = TACT_MESSAGE_OPCODES.ReserveVault.SetVaultJettonWallet;
  const wallet = typeof input.wallet === 'string' ? Address.parse(input.wallet) : input.wallet;
  const body = beginCell()
    .storeUint(opcode, 32)
    .storeAddress(wallet)
    .endCell();

  return encodeMessage('ReserveVault', 'SetVaultJettonWallet', opcode, body);
}

export function createSetPoolJettonWalletMessageCell(input: {
  readonly wallet: string | Address;
}) {
  const opcode = TACT_MESSAGE_OPCODES.AppRewardPool.SetPoolJettonWallet;
  const wallet = typeof input.wallet === 'string' ? Address.parse(input.wallet) : input.wallet;
  const body = beginCell()
    .storeUint(opcode, 32)
    .storeAddress(wallet)
    .endCell();

  return encodeMessage('AppRewardPool', 'SetPoolJettonWallet', opcode, body);
}

export function createRegisterRewardSeatMessageCell(input: {
  readonly seatType: 'reserve' | 'alpha';
  readonly seatNumber: number;
  readonly owner: string | Address;
}) {
  const opcode = TACT_MESSAGE_OPCODES.AppRewardPool.RegisterRewardSeat;
  const owner = typeof input.owner === 'string' ? Address.parse(input.owner) : input.owner;
  const body = beginCell()
    .storeUint(opcode, 32)
    .storeUint(input.seatType === 'reserve' ? 1 : 2, 8)
    .storeUint(input.seatNumber, 16)
    .storeAddress(owner)
    .endCell();

  return encodeMessage('AppRewardPool', 'RegisterRewardSeat', opcode, body);
}

export function createFinalizeRewardClaimMessageCell(input: {
  readonly queryId: bigint;
}) {
  const opcode = TACT_MESSAGE_OPCODES.AppRewardPool.FinalizeRewardClaim;
  const body = beginCell()
    .storeUint(opcode, 32)
    .storeUint(input.queryId, 64)
    .endCell();

  return encodeMessage('AppRewardPool', 'FinalizeRewardClaim', opcode, body);
}

export function createRewardClaimMessageCell(input: {
  readonly seatType: 'reserve' | 'alpha';
  readonly seatNumber: number;
}) {
  const opcode = TACT_MESSAGE_OPCODES.AppRewardPool.ClaimReward;
  const body = beginCell()
    .storeUint(opcode, 32)
    .storeUint(input.seatType === 'reserve' ? 1 : 2, 8)
    .storeUint(input.seatNumber, 16)
    .endCell();

  return encodeMessage('AppRewardPool', 'ClaimReward', opcode, body);
}

export function createMintTest72HMessageCell(input: {
  readonly to: string | Address;
  readonly amount72H: bigint;
}) {
  const opcode = TACT_MESSAGE_OPCODES.TestJetton72H.MintTest72H;
  const to = typeof input.to === 'string' ? Address.parse(input.to) : input.to;
  const body = beginCell()
    .storeUint(opcode, 32)
    .storeAddress(to)
    .storeCoins(to72HJettonUnits(input.amount72H))
    .endCell();

  return encodeMessage('TestJetton72H', 'MintTest72H', opcode, body);
}

export function createBurnTest72HMessageCell(input: {
  readonly amount72H: bigint;
  readonly responseDestination?: string | Address;
  readonly queryId?: bigint;
}) {
  const opcode = TACT_MESSAGE_OPCODES.JettonWallet.Burn;
  const responseDestination =
    typeof input.responseDestination === 'string'
      ? Address.parse(input.responseDestination)
      : input.responseDestination;
  const body = beginCell()
    .storeUint(opcode, 32)
    .storeUint(input.queryId ?? 0n, 64)
    .storeCoins(to72HJettonUnits(input.amount72H))
    .storeAddress(responseDestination ?? null)
    .storeMaybeRef(null)
    .endCell();

  return encodeMessage('JettonWallet', 'JettonBurn', opcode, body);
}
