# 72H Ecosystem Target Architecture - 2026-04-30

Status: `CONFIRMED BY OWNER`

This document is the cross-repository product boundary decision for the 72H ecosystem.

## Decision Summary

72H is one ecosystem, not a collection of unrelated app folders.

Confirmed target architecture:

```text
72hours
= official trust layer, public explanation, contracts, ecosystem navigation

multi-millionaire
= Season War main application
  - Lock
  - Squad
  - Live / War Room
  - Rewards / Claim
  - Share
  - Admin / Ops

wan
= standalone 72H utility application
  - VPN / traffic / orders / downloads / account

72h-capital-contracts
= chain facts, contracts, deployment evidence, audit evidence, integration JSON

/72
= retired historical demo/internal reference

72/72h-battle-radar
= visual prototype and migration source for multi-millionaire War Room; not standalone production
```

## Product Boundary Decisions

1. `/Users/yudeyou/Desktop/72` is retired as a public/user-facing entry.
2. `/Users/yudeyou/Desktop/72/72h-battle-radar` will not be independently launched as a production product.
3. Battle Radar becomes a `Live / War Room` module inside `/Users/yudeyou/Desktop/multi-millionaire`.
4. `multi-millionaire` is the Season War participation and reward source of truth.
5. `72h-capital-contracts` is the chain facts source of truth.
6. `72hours` stays as official site / trust layer / navigation layer, not a complex participation app.
7. `wan` remains an independent utility app proving 72H usage, not a Season War subpage.

## Why

A folder is not a product. A product is a repeated user job and value loop.

Users do not care whether the repo is called `72`, `multi-millionaire`, or `72hours`. They care about:

- Can I participate?
- What round/wave am I in?
- Is my wallet eligible?
- Did my lock count?
- Which squad am I in?
- What is my rank?
- What reward is pending, claimable, claimed, or blocked?
- Why is something disabled?
- Which data is live, which is demo, and what is the source?

Because those actions and data belong to `multi-millionaire`, the Battle Radar should live there as a module, not as a separate app.

## Source Of Truth

### Chain Facts

Owned by `72h-capital-contracts`:

- V2 Jetton Master
- SeasonVault
- SeasonClaim / future SeasonClaimV2 decision
- FundVesting
- total supply / mint authority / admin status
- deployed addresses
- deployment evidence
- audit evidence

### Season War User / Allocation Facts

Owned by `multi-millionaire`:

- wallet binding
- lock positions
- wave/round participation
- squads
- referrals / new-user contribution
- leaderboard
- risk quarantine
- reward allocation exports
- snapshot / Merkle root / proof artifacts
- claim preview and claim receipt state

### Display / Navigation

Owned by relevant UI surfaces:

- `72hours`: explain, verify, route users.
- `multi-millionaire`: let users act and see live participation/reward state.
- `wan`: let users use 72H for utility service.
- `72h-battle-radar`: prototype only until migrated.

## Target User Journey

1. User lands on `72hours`.
2. User verifies official 72H token and understands ecosystem.
3. User clicks `Join Season War` and enters `multi-millionaire`.
4. User connects wallet.
5. User sees:
   - current wave/round
   - time left
   - eligibility
   - lock status
   - squad status/rank
   - reward status
   - next action
6. User locks / joins squad / invites / checks rewards.
7. User may later claim only if official claim list, proof, claim contract, and claim window are live.
8. User may use 72H in `wan` as a separate utility app.

## War Room Module Requirements

The migrated War Room must show first-screen user answers:

1. Current wave / round.
2. Time left.
3. My eligibility.
4. My lock / participation status.
5. My squad and rank.
6. My reward state.
7. Claim/proof state.
8. Next best action.
9. Data source and freshness.
10. Risk/quarantine reason if blocked.

Avoid production use of militarized or misleading labels. Prefer:

- `Live 72H Wave`
- `War Room`
- `Reward Status`
- `Proof Status`
- `Squad Progress`
- `Wave Event Feed`

## Required Battle Radar Read Model

Minimum API/read-model fields:

- `seasonId`
- `waveId`
- `roundNumber`
- `chainRoundId`
- `status`: `pending | active | success | failed | settling | finalized`
- `timeLeftSeconds`
- `sourceFreshnessSeconds`
- `indexerWatermark`
- `evidenceHash`
- `snapshotId`
- `merkleRoot`
- `rootPublishable`
- `claimContractVersion`
- `claimContractAddress`
- `proofStatus`
- `riskStatus`
- `riskReason`
- `myEligibility`
- `myLockAtomic`
- `mySquadId`
- `mySquadRank`
- `myRewardPendingAtomic`
- `myRewardClaimableAtomic`
- `myRewardClaimedAtomic`
- `nextAction`

## No-Go Boundaries

Do not:

- Treat `/72` fixture API as production.
- Treat `72h-battle-radar` fixtures as live state.
- Publish standalone Battle Radar as a production user entry.
- Generate allocation, Merkle roots, or proofs from Battle Radar.
- Claim SeasonClaimV2 is live before gates pass.
- Suggest Presale is open.

## 7-Day Execution Plan

### Day 1 — Boundary and repo markers

- Add/align docs in `72`, `72h-battle-radar`, `multi-millionaire`, and `72hours`.
- Make `/72` visibly internal/demo-only.

### Day 2 — Read-model/API contract

- Add `multi-millionaire` Season War read-model spec.
- Normalize `seasonId`, `waveId`, `roundNumber`, `chainRoundId`.

### Day 3 — Backend read API skeleton

- Add read-only endpoints behind safe/demo data if needed.
- No write paths, no claim actions.

### Day 4 — Frontend War Room plan

- Design `multi-millionaire` navigation: `Lock / Squad / Live / Rewards / Share`.
- Define mobile-first first screen.

### Day 5 — Component migration

- Migrate selected radar components from `72h-battle-radar` into `multi-millionaire` as `Live / War Room` components.
- Keep source labels and demo/live mode visible.

### Day 6 — Website navigation alignment

- Update `72hours` ecosystem navigation:
  - `Join Season War` -> multi-millionaire
  - `Use 72H on WAN` -> WAN
  - `Verify Contracts` -> contracts page

### Day 7 — QA / release gate

- Verify no public `/72` entry.
- Verify War Room consumes read model only.
- Verify no fixture/demo value appears as live data.
- Verify production copy does not imply presale or claim is open.
