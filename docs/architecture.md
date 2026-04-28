# Architecture

## Overview

`72H Capital` uses five contract modules with clear responsibilities:

The executable behavior today lives in `src/contracts/*.ts`. The files in `contracts/*.tact` are aligned scaffolds only and should be read as layout and lifecycle notes, not deployable chain code.

The wider system is split across sibling repos:

- `72h-capital-shared`: common route, intent, and view types
- `72h-capital-indexer`: read-model ingestion and query surface
- `72h-capital-api`: business API and intent orchestration
- `72h-capital-admin`: operations console and governance actions
- `72hours`: website and preview experience

The contract repo also exposes shared lifecycle helpers in `src/types/lifecycle.ts` and `src/utils/capital-lifecycle.ts` so registry, reserve, alpha, and payload scaffolds use the same seat vocabulary.

1. `AdminAuthority`
   - governs privileged actions
   - approves config changes, reward-pool controls, and emergency pauses
2. `CapitalRegistry`
   - stores seat identity and lifecycle
   - enforces per-app seat caps
   - coordinates app slugs and vault references
3. `ReserveVault`
   - handles `Priority Reserve Allocation`
   - tracks lot-based deposits
   - custodies principal and redeems mature lots from the same vault
4. `AlphaVault`
   - handles `Alpha Allocation`
   - tracks non-redeemable principal
   - manages settlement cycles and completion after 72 weeks
5. `AppRewardPool`
   - receives app-scoped `72H` rewards
   - pays Reserve and Alpha reward claims by weight and cadence

Testnet additionally uses `TestJetton72H` as a rehearsal-only Jetton boundary. It mirrors the production symbol and decimals for wallet, Reserve, and Reward Pool testing, but it is not part of the production contract set and must never appear in mainnet manifests.

## Data model

### CapitalRegistry

- app metadata
- reserve seat identities
- alpha seat identities
- lifecycle status
- linked vault addresses

### ReserveVault

- reserve lots per holder
- unlock timestamps per lot
- mature-lot principal redemption records
- no liquidity queue state
- active and historical seat transitions

### AlphaVault

- alpha positions per holder
- top-up ledger
- settlement cycles every 7 weeks
- completed status after 72 weeks

### AppRewardPool

- app-scoped reward funding
- Reserve reward claims at weight 1 and 7-day cadence
- Alpha reward claims at weight 10 and 7-week cadence
- no principal custody

### TestJetton72H

- testnet-only symbol and decimals
- rehearsal balances
- mint authority for test liquidity
- no production reuse

### AdminAuthority

- administrator signer
- approval threshold fixed to 1
- pending operations
- execution log

## Cross-contract invariants

- `CapitalRegistry` is the source of truth for seat existence and lifecycle status.
- `ReserveVault` never creates more than 72 reserve seats per app.
- `AlphaVault` never creates more than 9 alpha seats per app.
- `ReserveVault` never releases a seat identifier once assigned.
- `AlphaVault` never exposes principal redemption.
- `AppRewardPool` only distributes `72H` rewards and never custodies principal.
- `TestJetton72H` is testnet-only; mainnet uses the official 72H Jetton master.
- privileged state changes flow through `AdminAuthority`.
