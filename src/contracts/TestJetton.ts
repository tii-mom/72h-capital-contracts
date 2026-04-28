import type { ContractBlueprint } from '../types/blueprint.js';

export interface TestJettonConfig {
  readonly symbol: '72H';
  readonly decimals: 9;
  readonly networkScope: 'testnet-only';
  readonly masterAddressEnv: 'TON_TESTNET_72H_JETTON_MASTER_ADDRESS';
  readonly mintAuthority: 'deployer';
  readonly mainnetAllowed: false;
}

export const testJettonBlueprint: ContractBlueprint<TestJettonConfig> = {
  name: 'TestJetton72H',
  purpose:
    'Testnet-only 72H Jetton placeholder used to rehearse Reserve and Reward Pool flows before the official mainnet 72H Jetton is wired.',
  config: {
    symbol: '72H',
    decimals: 9,
    networkScope: 'testnet-only',
    masterAddressEnv: 'TON_TESTNET_72H_JETTON_MASTER_ADDRESS',
    mintAuthority: 'deployer',
    mainnetAllowed: false,
  },
  invariants: [
    'TestJetton72H is testnet-only and must never be referenced by mainnet deployment manifests.',
    'The symbol and decimals mirror the production 72H interface: symbol=72H, decimals=9.',
    'Test minting is limited to deployment rehearsal and wallet/vault funding simulation.',
    'Production Reserve and Reward Pool flows must use the official mainnet 72H Jetton master address.',
  ],
  storage: [
    {
      name: 'totalSupply',
      type: 'uint',
      description: 'Testnet-only minted supply for Reserve and Reward Pool rehearsal.',
    },
    {
      name: 'balances',
      type: 'map<owner, amount>',
      description: 'Test holder balances for local and testnet flow validation.',
    },
    {
      name: 'mintAuthority',
      type: 'address',
      description: 'Test deployer or governed signer allowed to mint test 72H.',
    },
  ],
  entrypoints: [
    {
      name: 'mintTest72H',
      sender: 'admin',
      description: 'Mints test-only 72H for Reserve custody, reward-pool funding, and wallet rehearsals.',
    },
    {
      name: 'transfer',
      sender: 'user',
      description: 'Transfers test-only 72H using the same user-paid gas assumption as production flows.',
    },
    {
      name: 'burnTest72H',
      sender: 'user',
      description: 'Burns test-only 72H to clean up rehearsal balances.',
    },
  ],
  events: [
    {
      name: 'TestJettonMinted',
      description: 'Test-only 72H has been minted for rehearsal use.',
    },
    {
      name: 'TestJettonTransferred',
      description: 'Test-only 72H has moved between rehearsal wallets or vaults.',
    },
    {
      name: 'TestJettonBurned',
      description: 'Test-only 72H has been burned after rehearsal use.',
    },
  ],
  nextImplementationSteps: [
    'Replace this blueprint with a real testnet Jetton master and wallet implementation or an audited standard implementation.',
    'Record the deployed testnet Jetton master address in TON_TESTNET_72H_JETTON_MASTER_ADDRESS.',
    'Keep mainnet manifests pinned to TON_MAINNET_72H_JETTON_MASTER_ADDRESS only.',
  ],
};
