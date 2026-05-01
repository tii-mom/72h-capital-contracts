# Contracts

This directory contains the TON smart contract sources for 72H.

## Folder Layout

- `jetton-v2/`: production Func Jetton master and wallet implementation used by the current V3 token.
- `deployed/v3-core/`: Tact sources for the currently deployed V3 mainnet tokenomics package.
- `apps/`: application-specific contracts grouped by product. These are not part of the core V3 deployment unless separately reviewed and deployed.
- `supporting/`: reusable, historical, or system-adjacent contracts kept for audits, tests, and future planning.
- `archive/`: frozen replaced contracts. Do not use these for new integrations or signing packages.
- `testnet/`: testnet-only mocks and harness contracts.

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
- `apps/`: future application-specific chain contracts, organized by application.

Current mainnet deployment evidence is recorded in `../deployments/v3-mainnet/72h-v3-mainnet.postdeploy.latest.json`.

## Supporting And Legacy Contracts

These contracts remain in the repository because they are part of the broader 72H Capital system or earlier audit work:

- `supporting/CapitalRegistry.tact`
- `supporting/ReserveVault.tact`
- `supporting/AppRewardPool.tact`
- `supporting/AlphaVault.tact`
- `supporting/AdminMultisig.tact`
- `supporting/Treasury.tact`
- `supporting/TestJetton.tact`

Frozen V2 archive contracts live under:

- `archive/v2/SeasonClaim.tact`
- `archive/v2/SeasonClaimV2LegacyBridge.tact`

They are not part of the deployed V3 tokenomics mainnet package unless a future deployment explicitly includes them.

## Application Contracts

Future application-specific contracts should live under an app-specific folder in this repository, for example:

```text
contracts/apps/multi-millionaire/
contracts/apps/price-dashboard-72/
```

Application frontend and backend repositories should not become the source of truth for chain contracts. They should consume addresses, ABI/wrapper artifacts, and public JSON from this repository.

The first application planning documents are:

- `apps/multi-millionaire/README.md`
- `apps/price-dashboard-72/README.md`
- `../docs/apps/multi-millionaire-900b-reward-integration.md`
