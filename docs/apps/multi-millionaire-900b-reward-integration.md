# Multi-Millionaire 90B Season Reward Integration

This document records the accepted application-level design for the 90B SeasonVault reward allocation.

## Source Of Truth

`multi-millionaire` is the allocation source for successful round rewards because it controls the user behavior that matters:

- personal 72H deposits
- squad/team deposits
- referral activation and new-user conversion
- personal and squad leaderboards

`/Users/yudeyou/Desktop/72` is a display and navigation surface. It should show price, season status, claimable estimates, countdowns, and links into `multi-millionaire`; it must not become the authoritative reward accounting source.

## Chain Contracts

The deployed chain path is:

```text
SeasonVault -> SeasonClaim -> user wallet
```

Successful rounds are accumulated by `SeasonVault`. At season finalization, the owner transfers the season's successful-round amount into `SeasonClaim`. `SeasonClaim` then validates a season Merkle root and lets users claim under the price-stage unlock rules.

Failed rounds are not paid to users. They are routed to `FundVesting` under the failed-round rule.

## Allocation Math

Total inventory:

```text
90,000,000,000 72H = 10 seasons x 18 rounds x 500,000,000 72H
```

Per successful round:

| Pool | Share | Amount |
| --- | ---: | ---: |
| Personal deposit | 50% | 250,000,000 72H |
| Team deposit | 25% | 125,000,000 72H |
| Referral/new user | 15% | 75,000,000 72H |
| Leaderboard | 10% | 50,000,000 72H |
| Total | 100% | 500,000,000 72H |

Note: an earlier written amount of `300,000,000 72H` for the 50% personal pool is mathematically inconsistent with a 500M round budget. The implemented and audited rule is 50/25/15/10, which means `250M/125M/75M/50M`.

For a season with `N` successful rounds, the SeasonClaim totals must be:

```text
personal = N x 250,000,000 72H
team = N x 125,000,000 72H
referral = N x 75,000,000 72H
leaderboard = N x 50,000,000 72H
total = N x 500,000,000 72H
```

## Off-Chain Allocation Rules

The multi-millionaire backend should export one row per `(seasonId, recipientWallet)` with four pool amounts:

- `personalAmountRaw`
- `teamAmountRaw`
- `referralAmountRaw`
- `leaderboardAmountRaw`

The total is computed, not user-supplied.

Production exports must:

- require a verified primary recipient wallet
- include only chain-verified lock positions
- deduplicate each recipient by season
- exclude or quarantine open/reviewing risk flags
- use deterministic tie-breakers for leaderboards
- verify that all four pool totals exactly match the successful-round budget before publishing the Merkle root

Current `multi-millionaire` exporter v1 uses this contribution formula:

```text
user_contribution = sum(confirmed_locked_amount_raw for positions in successfulWaveIds)
```

This means each included successful-wave position has `eligible_successful_round_count = 1`. If the final product rule needs one lock to count across multiple successful rounds, the app exporter must change to:

```text
position_contribution = confirmed_locked_amount_raw x eligible_successful_round_count
```

The app database does not yet persist season round success metadata or per-position round eligibility, so `successfulWaveIds` remains an explicit operator input for v1.

## SeasonClaimV2 Evaluation

The deployed `SeasonClaim` proof format is a single cell containing consecutive `siblingOnLeft bool + sibling uint256` pairs. That fits at most 3 proof levels, so it supports roughly 8 leaves. `multi-millionaire` now fail-fast rejects exports above that capacity and only supports small rehearsal artifacts against the deployed contract.

`SeasonClaimV2` is now deployed in the current V3 mainnet package at `EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b`. It supports proof continuation through references while preserving the same leaf schema, reward accounting, category totals, price-stage unlocks, and bounce safety properties. Earlier V2 testnet and bridge-focused rehearsals remain historical evidence only.

Before a real public 90B reward root is registered, the remaining blocker is app-side season data, Merkle export review, funding verification, and explicit owner approval. Current V3 contract facts are in `docs/72H_MAINNET_FACTS.md`; V2 funding-route notes below are frozen archive context only.

Frozen V2 candidate route: `SeasonClaimV2LegacyBridge` let the existing legacy `SeasonClaim` register a single bridge leaf and let the bridge claim that legacy leaf. The deployed legacy claim payout used `forwardTonAmount: 0`, so the bridge contract could not wait for a legacy Jetton transfer notification. Instead, the operator had to confirm the bridge-owned Jetton wallet balance increase on chain, then the owner called `ForwardBridgeWalletToV2(queryId, amount72H)`. `SeasonClaimV2` sent an authenticated `ConfirmSeasonClaimFunding` receipt after it received the real funding notification, so bridge forwarding was not finalized by unauthenticated Jetton excesses. This route is retained only as V2 archive context.

Operational bridge notes:

- bridge wallet and V2 target configuration lock after the first legacy claim attempt
- manual forward query ids must be `>= 14414200000000000`
- duplicate pending or completed manual forward query ids are rejected
- insufficient bridge wallet balance causes the Jetton transfer to bounce and clears the bridge pending forward
- after the legacy claim succeeds, the old `SeasonClaim` still needs `SettleSeasonClaimPending(queryId)` after the 72-hour bounce grace before later sweep workflows

Bridge-focused testnet rehearsal phase 1 completed in `deployments/season-claim-v2-legacy-bridge.testnet.latest.json`: legacy payout funded the bridge Jetton wallet, owner manual-forwarded to `SeasonClaimV2`, and bridge finalized on `ConfirmSeasonClaimFunding`. This remains V2 archive evidence; do not generate V2 signing packages, bridge transactions, or public V2 roots from it.

Any final production route must preserve:

- the current leaf domain: `appId`, Jetton Master, claim contract address, `seasonId`, recipient wallet, four pool amounts, computed total
- duplicate-claim protection by leaf hash
- category total checks for 50/25/15/10
- pending claim and bounce safety from the deployed `SeasonClaim`
- tests for large proof depths well above production recipient counts

Current candidate notes are in `docs/season-claim-v2-design.md`.

## Existing Multi-Millionaire Work

The current app repo already has a draft SeasonClaim-compatible helper at:

```text
/Users/yudeyou/Desktop/multi-millionaire/server/src/services/seasonRewards.ts
```

It currently matches the deployed SeasonClaim leaf direction:

- `appId = 1`
- token address
- SeasonClaim address
- `seasonId uint8`
- wallet
- four pool amounts
- computed total

Before production claim activation, the app repo still needs an operator export job, durable archive of source rows/proofs, admin review UI, and tests around risk filtering and deterministic allocation.

The current draft exporter and configuration gate for future `SeasonClaimV2` publication is recorded in `docs/apps/multi-millionaire-seasonclaim-v2-exporter-config-checklist.md`. It keeps manifests non-publishable until app-side season data, Merkle exports, funding verification, and owner approval are complete against the V3 contract facts.

The app-side non-publishable 128-leaf V2 rehearsal artifact has been regenerated against the bridge-focused testnet `SeasonClaimV2` address `kQDEELj9KCzdqT07sVp4FRnbZRo-QhjS5ig0N6lcpJDGcn0H` at `/Users/yudeyou/Desktop/multi-millionaire/tmp/season-war/rehearsal-v2-large`. It is accepted as exporter/proof-format evidence only; production publication remains blocked by the final legacy pending cleanup and later mainnet funding gates.

## Application Contract Boundary

Future chain contracts for multi-millionaire must be migrated into:

```text
contracts/apps/multi-millionaire/
```

The app repo may keep frontend, backend, indexer, and export logic. Chain source code, wrappers, deployment scripts, and evidence should live in this repository once the contracts are production candidates.

The existing app contracts in `/Users/yudeyou/Desktop/multi-millionaire/contracts/` are not part of the deployed 72H V2 core package and should not be deployed to mainnet until they are migrated, hardened, tested, and audited here.

Known hardening requirement before any app-contract deployment:

- outbound JettonTransfer success and bounce flows must authenticate the configured Jetton wallet sender
- bounce rollback must verify the bounced amount equals the pending amount
- forged success/finalize messages must not clear pending state or mutate accounting
