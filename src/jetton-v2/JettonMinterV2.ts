import {
  Address,
  beginCell,
  Cell,
  contractAddress,
  SendMode,
  toNano,
  type Contract,
  type ContractProvider,
  type Sender,
  type Slice,
} from '@ton/core';
import { JETTON_V2_OPCODES } from './constants.js';

export interface JettonMinterV2Config {
  readonly admin: Address | null;
  readonly walletCode: Cell;
  readonly metadataUri: string;
  readonly totalSupply?: bigint;
}

export interface JettonMinterV2Data {
  readonly totalSupply: bigint;
  readonly mintable: boolean;
  readonly adminAddress: Address | null;
  readonly content: Cell;
  readonly walletCode: Cell;
}

export function assertEndParse(slice: Slice) {
  if (slice.remainingBits > 0 || slice.remainingRefs > 0) {
    throw new Error('Unexpected remaining bits or refs in cell.');
  }
}

export function jettonMetadataUriToCell(metadataUri: string) {
  return beginCell().storeStringRefTail(metadataUri).endCell();
}

export function jettonMinterV2ConfigToCell(config: JettonMinterV2Config) {
  return beginCell()
    .storeCoins(config.totalSupply ?? 0n)
    .storeAddress(config.admin)
    .storeRef(config.walletCode)
    .storeRef(jettonMetadataUriToCell(config.metadataUri))
    .endCell();
}

export class JettonMinterV2 implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { readonly code: Cell; readonly data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new JettonMinterV2(address);
  }

  static createFromConfig(config: JettonMinterV2Config, code: Cell, workchain = 0) {
    const data = jettonMinterV2ConfigToCell(config);
    const init = { code, data };
    return new JettonMinterV2(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value = toNano('0.05')) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: JettonMinterV2.topUpMessage(),
    });
  }

  static topUpMessage(queryId: bigint | number = 0n) {
    return beginCell()
      .storeUint(JETTON_V2_OPCODES.topUp, 32)
      .storeUint(queryId, 64)
      .endCell();
  }

  static mintMessage(params: {
    readonly to: Address;
    readonly jettonAmount: bigint;
    readonly from?: Address | null;
    readonly responseAddress?: Address | null;
    readonly forwardTonAmount?: bigint;
    readonly totalTonAmount?: bigint;
    readonly queryId?: bigint | number;
    readonly customPayload?: Cell | null;
  }) {
    const mintBody = beginCell()
      .storeUint(JETTON_V2_OPCODES.internalTransfer, 32)
      .storeUint(params.queryId ?? 0n, 64)
      .storeCoins(params.jettonAmount)
      .storeAddress(params.from ?? null)
      .storeAddress(params.responseAddress ?? null)
      .storeCoins(params.forwardTonAmount ?? 0n)
      .storeMaybeRef(params.customPayload ?? null)
      .endCell();

    return beginCell()
      .storeUint(JETTON_V2_OPCODES.mint, 32)
      .storeUint(params.queryId ?? 0n, 64)
      .storeAddress(params.to)
      .storeCoins(params.totalTonAmount ?? toNano('0.1'))
      .storeRef(mintBody)
      .endCell();
  }

  async sendMint(
    provider: ContractProvider,
    via: Sender,
    params: {
      readonly to: Address;
      readonly jettonAmount: bigint;
      readonly from?: Address | null;
      readonly responseAddress?: Address | null;
      readonly forwardTonAmount?: bigint;
      readonly totalTonAmount?: bigint;
      readonly value?: bigint;
      readonly queryId?: bigint | number;
      readonly customPayload?: Cell | null;
    },
  ) {
    const totalTonAmount = params.totalTonAmount ?? toNano('0.3');
    await provider.internal(via, {
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      value: params.value ?? totalTonAmount + toNano('0.05'),
      body: JettonMinterV2.mintMessage({
        ...params,
        totalTonAmount,
      }),
    });
  }

  static dropAdminMessage(queryId: bigint | number = 0n) {
    return beginCell()
      .storeUint(JETTON_V2_OPCODES.dropAdmin, 32)
      .storeUint(queryId, 64)
      .endCell();
  }

  async sendDropAdmin(provider: ContractProvider, via: Sender, value = toNano('0.05'), queryId: bigint | number = 0n) {
    await provider.internal(via, {
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      value,
      body: JettonMinterV2.dropAdminMessage(queryId),
    });
  }

  async getJettonData(provider: ContractProvider): Promise<JettonMinterV2Data> {
    const result = await provider.get('get_jetton_data', []);
    return {
      totalSupply: result.stack.readBigNumber(),
      mintable: result.stack.readBoolean(),
      adminAddress: result.stack.readAddressOpt(),
      content: result.stack.readCell(),
      walletCode: result.stack.readCell(),
    };
  }

  async getWalletAddress(provider: ContractProvider, owner: Address): Promise<Address> {
    const result = await provider.get('get_wallet_address', [
      { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
    ]);
    return result.stack.readAddress();
  }
}
