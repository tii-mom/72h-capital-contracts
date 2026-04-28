export type DeploymentNetwork = 'testnet' | 'mainnet';

export interface VaultAddressMap {
  readonly '72hours': string | null;
  readonly wan: string | null;
  readonly 'multi-millionaire': string | null;
}

export interface NetworkDeploymentConfig {
  readonly network: DeploymentNetwork;
  readonly rpcUrlEnv: string;
  readonly deployerAddressEnv: string;
  readonly deployerMnemonicEnv: string;
  readonly jetton: {
    readonly masterAddressEnv: string;
    readonly modeEnv?: string;
    readonly symbolEnv?: string;
    readonly decimalsEnv?: string;
    readonly testnetMockAllowed: boolean;
    readonly mainnetMasterRequired: boolean;
  };
  readonly contracts: {
    readonly AdminMultisig: string | null;
    readonly CapitalRegistry: string | null;
    readonly Treasury: string | null;
    readonly ReserveVaults: VaultAddressMap;
    readonly AlphaVaults: VaultAddressMap;
  };
}

export const NETWORKS: Readonly<Record<DeploymentNetwork, NetworkDeploymentConfig>> = {
  testnet: {
    network: 'testnet',
    rpcUrlEnv: 'TON_TESTNET_RPC_URL',
    deployerAddressEnv: 'TON_TESTNET_DEPLOYER_ADDRESS',
    deployerMnemonicEnv: 'TON_TESTNET_DEPLOYER_MNEMONIC',
    jetton: {
      masterAddressEnv: 'TON_TESTNET_72H_JETTON_MASTER_ADDRESS',
      modeEnv: 'TON_TESTNET_72H_JETTON_MODE',
      symbolEnv: 'TON_TESTNET_72H_JETTON_SYMBOL',
      decimalsEnv: 'TON_TESTNET_72H_JETTON_DECIMALS',
      testnetMockAllowed: true,
      mainnetMasterRequired: false,
    },
    contracts: {
      AdminMultisig: null,
      CapitalRegistry: null,
      Treasury: null,
      ReserveVaults: {
        '72hours': null,
        wan: null,
        'multi-millionaire': null,
      },
      AlphaVaults: {
        '72hours': null,
        wan: null,
        'multi-millionaire': null,
      },
    },
  },
  mainnet: {
    network: 'mainnet',
    rpcUrlEnv: 'TON_MAINNET_RPC_URL',
    deployerAddressEnv: 'TON_MAINNET_DEPLOYER_ADDRESS',
    deployerMnemonicEnv: 'TON_MAINNET_DEPLOYER_MNEMONIC',
    jetton: {
      masterAddressEnv: 'TON_MAINNET_72H_JETTON_MASTER_ADDRESS',
      testnetMockAllowed: false,
      mainnetMasterRequired: true,
    },
    contracts: {
      AdminMultisig: null,
      CapitalRegistry: null,
      Treasury: null,
      ReserveVaults: {
        '72hours': null,
        wan: null,
        'multi-millionaire': null,
      },
      AlphaVaults: {
        '72hours': null,
        wan: null,
        'multi-millionaire': null,
      },
    },
  },
};
