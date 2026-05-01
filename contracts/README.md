# Contracts

This directory contains the TON smart contract sources for 72H.

## Folder Layout

- `jetton-v2/`: production Func Jetton master and wallet implementation used by the current V3 token.
- `deployed/v3-core/`: Tact sources for the currently deployed V3 mainnet tokenomics package.
- `supporting/TestJetton.tact`: compile-time Jetton message definitions reused by the V3 Tact contracts.

## Mainnet V3 Contracts

The deployed 72H V3 mainnet package consists of the fixed-supply Jetton plus these tokenomics contracts:

- `jetton-v2/*.fc`: production Jetton master and wallet implementation used by V3.
- `deployed/v3-core/SeasonVault.tact`: custody for the 90B season reward inventory.
- `deployed/v3-core/SeasonClaimV2.tact`: Merkle claim contract for finalized season rewards.
- `deployed/v3-core/FundVesting.tact`: price-stage vesting for failed-round inventory.
- `deployed/v3-core/DevelopmentFund.tact`: development fund custody.
- `deployed/v3-core/PresaleVault.tact`: TON-only staged presale custody and sale logic.
- `deployed/v3-core/EcosystemTreasury.tact`: approved ecosystem application funding.
- `deployed/v3-core/TeamVesting.tact`: price-stage team vesting custody.

Current mainnet deployment evidence is recorded in `../deployments/v3-mainnet/72h-v3-mainnet.postdeploy.latest.json`.

## Excluded From This Publish

V2 archive contracts, legacy Capital/Reserve/AppRewardPool contracts, testnet mocks, and app-specific production candidates are not included in the current V3 public facts publish.
