import {
  Address,
  beginCell,
  Cell,
  contractAddress,
  SendMode,
  type Contract,
  type ContractProvider,
  type Sender,
  type Slice,
} from '@ton/core';
import { JETTON_V2_OPCODES } from './constants.js';

export interface JettonWalletV2Config {
  readonly ownerAddress: Address;
  readonly jettonMasterAddress: Address;
}

export interface JettonWalletV2Data {
  readonly balance: bigint;
  readonly owner: Address;
  readonly minter: Address;
  readonly walletCode: Cell;
}

export function jettonWalletV2ConfigToCell(config: JettonWalletV2Config): Cell {
  return beginCell()
    .storeUint(0, 4)
    .storeCoins(0)
    .storeAddress(config.ownerAddress)
    .storeAddress(config.jettonMasterAddress)
    .endCell();
}

export class JettonWalletV2 implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { readonly code: Cell; readonly data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new JettonWalletV2(address);
  }

  static createFromConfig(config: JettonWalletV2Config, code: Cell, workchain = 0) {
    const data = jettonWalletV2ConfigToCell(config);
    const init = { code, data };
    return new JettonWalletV2(contractAddress(workchain, init), init);
  }

  async getWalletData(provider: ContractProvider): Promise<JettonWalletV2Data> {
    const result = await provider.get('get_wallet_data', []);
    return {
      balance: result.stack.readBigNumber(),
      owner: result.stack.readAddress(),
      minter: result.stack.readAddress(),
      walletCode: result.stack.readCell(),
    };
  }

  async getJettonBalance(provider: ContractProvider) {
    const state = await provider.getState();
    if (state.state.type !== 'active') {
      return 0n;
    }

    return (await this.getWalletData(provider)).balance;
  }

  static transferMessage(params: {
    readonly jettonAmount: bigint;
    readonly to: Address;
    readonly responseAddress: Address | null;
    readonly customPayload?: Cell | null;
    readonly forwardTonAmount?: bigint;
    readonly forwardPayload?: Cell | Slice | null;
    readonly queryId?: bigint | number;
  }) {
    const forwardPayload = params.forwardPayload ?? null;
    const byRef = forwardPayload instanceof Cell;
    const body = beginCell()
      .storeUint(JETTON_V2_OPCODES.transfer, 32)
      .storeUint(params.queryId ?? 0n, 64)
      .storeCoins(params.jettonAmount)
      .storeAddress(params.to)
      .storeAddress(params.responseAddress)
      .storeMaybeRef(params.customPayload ?? null)
      .storeCoins(params.forwardTonAmount ?? 0n)
      .storeBit(byRef);

    if (byRef) {
      body.storeRef(forwardPayload);
    } else if (forwardPayload) {
      body.storeSlice(forwardPayload);
    }

    return body.endCell();
  }

  async sendTransfer(
    provider: ContractProvider,
    via: Sender,
    params: {
      readonly value: bigint;
      readonly jettonAmount: bigint;
      readonly to: Address;
      readonly responseAddress: Address | null;
      readonly customPayload?: Cell | null;
      readonly forwardTonAmount?: bigint;
      readonly forwardPayload?: Cell | Slice | null;
      readonly queryId?: bigint | number;
    },
  ) {
    await provider.internal(via, {
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      value: params.value,
      body: JettonWalletV2.transferMessage(params),
    });
  }

  static burnMessage(params: {
    readonly jettonAmount: bigint;
    readonly responseAddress: Address | null;
    readonly customPayload?: Cell | null;
    readonly queryId?: bigint | number;
  }) {
    return beginCell()
      .storeUint(JETTON_V2_OPCODES.burn, 32)
      .storeUint(params.queryId ?? 0n, 64)
      .storeCoins(params.jettonAmount)
      .storeAddress(params.responseAddress)
      .storeMaybeRef(params.customPayload ?? null)
      .endCell();
  }

  async sendBurn(
    provider: ContractProvider,
    via: Sender,
    params: {
      readonly value: bigint;
      readonly jettonAmount: bigint;
      readonly responseAddress: Address | null;
      readonly customPayload?: Cell | null;
      readonly queryId?: bigint | number;
    },
  ) {
    await provider.internal(via, {
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      value: params.value,
      body: JettonWalletV2.burnMessage(params),
    });
  }
}
