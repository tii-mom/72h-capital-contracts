export const H72H_V2_DECIMALS = 9;
export const H72H_V2_SCALE = 1_000_000_000n;
export const H72H_V2_TOTAL_SUPPLY = 100_000_000_000n * H72H_V2_SCALE;
export const H72H_V2_METADATA_URI_PLACEHOLDER = 'ipfs://REPLACE_WITH_FINAL_72H_V2_METADATA_JSON';

export const JETTON_V2_OPCODES = {
  transfer: 0x0f8a7ea5,
  transferNotification: 0x7362d09c,
  internalTransfer: 0x178d4519,
  excesses: 0xd53276db,
  burn: 0x595f07bc,
  burnNotification: 0x7bdd97de,
  provideWalletAddress: 0x2c76b973,
  takeWalletAddress: 0xd1735400,
  topUp: 0xd372158c,
  mint: 0x642b7d07,
  dropAdmin: 0x7431f221,
} as const;

export const JETTON_V2_ERRORS = {
  invalidOp: 72,
  wrongOp: 0xffff,
  notOwner: 73,
  notValidWallet: 74,
  wrongWorkchain: 333,
  balanceError: 47,
  notEnoughGas: 48,
  invalidMessage: 49,
} as const;
