# Contract Source Placeholders

This directory marks the intended TON contract source locations.

The files here are intentionally conservative. `CapitalRegistry.tact`, `ReserveVault.tact`, and `TestJetton.tact` now compile through the Tact toolchain as minimal testnet-oriented shells. The executable TypeScript state machines in `src/contracts/*.ts` are still the richer behavior source of truth until the on-chain implementation catches up.

Current mapping:

- `src/contracts/CapitalRegistry.ts` is the executable registry and seat lifecycle model
- `src/contracts/ReserveVault.ts` is the executable reserve lot and redemption model
- `src/contracts/AlphaVault.ts` is the executable alpha allocation and settlement model
- `src/contracts/TestJetton.ts` is the testnet-only 72H Jetton rehearsal boundary
- `src/contracts/AdminMultisig.ts` exports the executable `AdminAuthority` governance blueprint while the filename remains stable for generated-contract compatibility
- `src/contracts/Treasury.ts` is legacy yield-control scaffolding; `AppRewardPool` is the v1 reward custody path
- `src/types/lifecycle.ts` and `src/utils/capital-lifecycle.ts` carry reusable lifecycle/status helpers
- `src/encoding/transactionPayloadScaffolds.ts` is the current website / API payload-alignment scaffold
- `contracts/CapitalRegistry.tact` and `contracts/ReserveVault.tact` provide the first minimal compiled Reserve path
- `contracts/AlphaVault.tact` mirrors the intended alpha storage and entrypoints and is not compiled yet
- `contracts/TestJetton.tact` is the testnet-only Jetton placeholder scaffold
- `contracts/AdminMultisig.tact` remains the compiled-file governance scaffold for `AdminAuthority`
- `contracts/Treasury.tact` remains legacy governance/yield scaffolding
- `contracts/jetton-v2/*.fc` is the production 72H V2 standard Jetton path
- `contracts/SeasonVault.tact` holds the 90B 72-hour season inventory and routes each 500M round to rewards or fund vesting
- `contracts/SeasonClaim.tact` verifies off-chain reward lists with Merkle proofs and enforces price-stage claim unlocks
- `contracts/FundVesting.tact` locks failed-round fund allocations until public price stages are met
- `contracts/DevelopmentFund.tact` holds normal fund inventory and allows transparent owner-directed withdrawals without price locks
- `contracts/PresaleVault.tact` implements the simple TON-only 3-stage V2 presale
- `contracts/EcosystemTreasury.tact` only funds approved app/reward contracts
- `contracts/TeamVesting.tact` releases team reserve only after price stages are held for 72 hours

Sibling repos now fill the surrounding system boundary:

- `72h-capital-shared` carries shared route, intent, and view types
- `72h-capital-indexer` carries read-model and ingestion scaffolding
- `72h-capital-api` exposes the business API surface
- `72h-capital-admin` carries the operations console
- `72hours` carries the public website and Capital preview UI

The Tact files intentionally do not overclaim implemented behavior. The compiled Reserve path is still minimal: it is useful for testnet message and deployment progression, but it does not yet implement Jetton transfer verification, the full independent lot ledger, audited mature-lot payout dispatch, or registry callback messages.

The transaction payload scaffold also intentionally does not overclaim. Its base64 output is only a wrapped JSON placeholder for downstream integration work, not a TON message cell.

Suggested next step:

- replace each scaffold with a real Tact or FunC source file once the TON toolchain and deployment format are finalized
- keep the module names unchanged
- preserve the invariants locked in `docs/rules.md` and `tests/capital-rules.spec.ts`
