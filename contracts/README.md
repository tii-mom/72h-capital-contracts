# Contracts

This directory contains the TON smart contract sources for 72H.

## Mainnet V2 Contracts

The deployed 72H V2 mainnet package consists of the fixed-supply Jetton plus these tokenomics contracts:

- `jetton-v2/*.fc`: production Jetton master and wallet implementation.
- `SeasonVault.tact`: custody for the 90B season reward inventory.
- `SeasonClaim.tact`: Merkle claim contract for successful season rewards.
- `SeasonClaimV2.tact`: not deployed; candidate scalable-proof replacement for large Season War claim sets.
- `FundVesting.tact`: price-stage vesting for failed-round inventory.
- `DevelopmentFund.tact`: development fund custody.
- `PresaleVault.tact`: TON-only staged presale custody and sale logic.
- `EcosystemTreasury.tact`: approved ecosystem application funding.
- `TeamVesting.tact`: price-stage team vesting custody.
- `apps/`: future application-specific chain contracts, organized by application.

Mainnet deployment evidence is recorded in `../deployments/72h-v2-mainnet.deployed-2026-04-28.md`.

## Supporting And Legacy Contracts

These contracts remain in the repository because they are part of the broader 72H Capital system or earlier audit work:

- `CapitalRegistry.tact`
- `ReserveVault.tact`
- `AppRewardPool.tact`
- `AlphaVault.tact`
- `AdminMultisig.tact`
- `Treasury.tact`
- `TestJetton.tact`

They are not part of the deployed 8-contract V2 tokenomics mainnet package unless a future deployment explicitly includes them.

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
