# SeasonClaimV2 Mainnet Migration Runbook Draft

Status: `BLOCKED UNTIL TESTNET LEGACY PENDING CLEANUP COMPLETE`

This is a planning draft only. It must not be used to sign, send, or publish mainnet migration transactions until the bridge-focused testnet evidence is updated to `complete` after the legacy pending cleanup.

Audit follow-up status: draft-only mainnet preparation is allowed. The audit thread found no new P1/P2 blocker after testnet phase 1, but explicitly confirmed that legacy pending cleanup complete remains a hard gate before any mainnet signing package, deployment, bridge transaction, or public V2 root publication.

## Purpose

The deployed mainnet `SeasonVault` already holds the 90B season reward inventory and cannot be retargeted to a new claim contract after funding. `SeasonClaimV2` fixes the large-recipient proof-depth problem, but it needs an audited funding route from the already-deployed legacy path.

The candidate route is:

```text
SeasonVault -> legacy SeasonClaim -> SeasonClaimV2LegacyBridge -> SeasonClaimV2
```

This route preserves the deployed `SeasonVault -> legacy SeasonClaim` path and uses the bridge to move claimed legacy inventory into `SeasonClaimV2`.

## Hard Gates

No mainnet TonConnect package, signing HTML, contract deployment, bridge claim, bridge forward, or public V2 reward root publication may proceed until all gates pass.

1. `BLOCKED UNTIL TESTNET LEGACY PENDING CLEANUP COMPLETE`
2. `deployments/season-claim-v2-legacy-bridge.testnet.latest.json` status is `complete`.
3. Testnet legacy `getPendingClaimAmount(1777387300691001) == 0`.
4. Audit thread accepts phase 1 evidence plus final pending cleanup evidence with no P1/P2 blockers.
5. `npm run lint`, `npm run build`, Misti all-detectors, and Misti high-severity run pass on the exact code used for planning.
6. Owner explicitly approves moving from draft planning to mainnet dry-run.
7. Owner separately approves any mainnet signing package after reviewing generated addresses, code hashes, data hashes, and amounts.

## Current Testnet Evidence

- Evidence: `deployments/season-claim-v2-legacy-bridge.testnet.latest.json`
- Timestamped evidence: `deployments/season-claim-v2-legacy-bridge.testnet.2026-04-28T14-46-27-843Z.json`
- Current status: `bridge-forward-complete-pending-legacy-settle`
- Legacy pending cleanup not before: `2026-05-01T14:45:31Z`
- Legacy claim query id: `1777387300691001`
- Manual forward query id: `16191587300691002`
- Rehearsal amount: `1000000000` raw units
- Bridge code hash: `86f767f5d56675c0b9c11c76f949022e4ddc1b12cb318a3c5f0a1105c3b83c76`
- SeasonClaimV2 code hash: `99b63712844f6032a34b10e52b2e8daa0eebc2e265603cc2176a5df7f6e02c26`

Phase 1 has verified that the legacy zero-forward payout funds the bridge Jetton wallet, the bridge does not rely on legacy notifications, owner manual-forward sends real Jettons to `SeasonClaimV2`, `SeasonClaimV2` confirms funding, and bridge pending forward state finalizes.

The final testnet gate is the legacy `SettleSeasonClaimPending(queryId)` cleanup after the 72-hour bounce grace.

## Audit Follow-Up Decision

The audit thread reviewed the phase 1 evidence and concluded:

- no new P1/P2 blocker
- the old legacy-notification P1 is removed by the manual-forward design
- `ForwardBridgeWalletToV2` is owner-only
- bridge forwards only through the configured `bridgeJettonWallet`
- destination is fixed to `SeasonClaimV2`
- confirmation is accepted only from fixed `SeasonClaimV2` with matching amount
- bounce is accepted only from fixed `bridgeJettonWallet` with matching amount, then clears pending
- `legacyClaimRequested72H` and `expectedAvailableToForward72H` are operator checkpoints, not proof of wallet balance
- insufficient bridge wallet balance is handled by wallet bounce and pending cleanup, not by overfunding V2

The audit thread also confirmed that phase 1 evidence is enough to continue this runbook as a non-executable planning draft while final legacy pending cleanup is gated by chain time.

This decision does not authorize mainnet signing or deployment. The hard gates above still apply.

## App Exporter Preparation Status

`multi-millionaire` regenerated the non-publishable V2 large rehearsal artifact against the bridge-focused testnet `SeasonClaimV2` address:

```text
/Users/yudeyou/Desktop/multi-millionaire/tmp/season-war/rehearsal-v2-large
```

The accepted manifest uses `season-claim-v2`, `ref-chain:siblingOnLeft-bool+sibling-uint256`, `production_root_publishable: false`, and the testnet `SeasonClaimV2` address `kQDEELj9KCzdqT07sVp4FRnbZRo-QhjS5ig0N6lcpJDGcn0H`. It keeps the legacy mainnet v1 `SeasonClaim` address in its separate legacy field and does not emit the v1-only `seasonClaimProofCellBase64` alias for V2 leaves.

This is exporter/proof-format evidence only. It does not change the hard gate for mainnet signing, deployment, bridge transactions, or public V2 root publication.

## Mainnet Draft Preparation Allowed Before Final Gate

These preparation tasks are allowed while the final testnet cleanup gate is pending:

1. Review and update this runbook.
2. Prepare audit prompts and evidence summaries.
3. Draft the mainnet dry-run script requirements in `docs/season-claim-v2-mainnet-dry-run-requirements.md`.
4. Draft operator checklists for balances, query ids, and stop conditions in `docs/season-claim-v2-mainnet-operator-checklist.md`.
5. Prepare `multi-millionaire` exporter configuration notes for the future `SeasonClaimV2` address in `docs/apps/multi-millionaire-seasonclaim-v2-exporter-config-checklist.md`.
6. Prepare public documentation wording that says V2 public roots must not be published before V2 funding is complete.

These tasks must not create executable mainnet signing payloads.

Related planning documents:

- `docs/season-claim-v2-mainnet-dry-run-requirements.md`
- `docs/season-claim-v2-mainnet-operator-checklist.md`
- `docs/apps/multi-millionaire-seasonclaim-v2-exporter-config-checklist.md`

## Mainnet Execution Outline

This section is intentionally draft-only. Replace all candidate addresses and amounts with generated evidence after the hard gates pass.

1. Deploy `SeasonClaimV2`.
2. Deploy `SeasonClaimV2LegacyBridge`.
3. Derive and verify the `SeasonClaimV2` Jetton wallet from the production Jetton wallet code.
4. Derive and verify the bridge Jetton wallet from the production Jetton wallet code.
5. Configure `SeasonClaimV2` with its Jetton wallet.
6. Configure bridge with its bridge Jetton wallet.
7. Configure bridge with the fixed `SeasonClaimV2` target.
8. Register a legacy `SeasonClaim` season/root that gives the bridge address a single leaf for the migration amount.
9. Unlock the corresponding legacy claim amount according to the approved price-stage evidence.
10. Have bridge claim the legacy leaf.
11. Confirm on chain that the bridge Jetton wallet balance increased by the expected amount.
12. Owner calls `ForwardBridgeWalletToV2(queryId, amount72H)`.
13. Confirm `SeasonClaimV2` Jetton wallet balance increased by the expected amount.
14. Confirm bridge `pendingForward72H == 0` and `completedForwardAmountByQuery(queryId) == amount72H`.
15. After the legacy 72-hour bounce grace, call legacy `SettleSeasonClaimPending(queryId)`.
16. Confirm legacy pending amount for the query is zero before any later legacy sweep workflow.
17. Only after V2 funding is complete, register public `SeasonClaimV2` roots for real users.

## Required Operator Checks

Before any bridge claim:

- Confirm mainnet `SeasonVault` and legacy `SeasonClaim` addresses match deployed evidence.
- Confirm `SeasonClaimV2` code hash matches the audited hash.
- Confirm bridge code hash matches the audited hash.
- Confirm bridge target is the intended `SeasonClaimV2` address.
- Confirm bridge Jetton wallet is derived from production V2 Jetton wallet code.
- Confirm V2 Jetton wallet is derived from production V2 Jetton wallet code.
- Confirm legacy claim query id does not collide with sweep namespace.
- Confirm manual forward query id is in the manual forward namespace.

Before manual forward:

- Confirm bridge Jetton wallet balance increased by the expected legacy payout amount.
- Confirm bridge `pendingForward72H == 0`.
- Confirm `SeasonClaimV2` funded amount has not already included this migration.
- Confirm owner wallet is the only signer for `ForwardBridgeWalletToV2`.

Before public V2 root publication:

- Confirm `SeasonClaimV2.funded72H` is at least the full season amount being registered.
- Confirm `SeasonClaimV2` public root uses the V2 claim contract address in the leaf domain.
- Confirm `multi-millionaire` exported proof format is V2 ref-chain proof, not legacy single-cell proof for large recipient sets.

## Stop Conditions

Stop immediately and do not continue signing if any condition is true:

- Testnet final pending cleanup evidence is missing or not `complete`.
- Audit thread reports a P1/P2 blocker.
- Any generated mainnet address differs from the reviewed dry-run plan.
- Any code hash differs from the reviewed/audited hash.
- Bridge Jetton wallet balance does not increase after legacy claim.
- `SeasonClaimV2` funding does not increase after manual forward.
- Bridge pending forward remains non-zero after expected confirmation window.
- A bounce clears bridge pending forward, indicating insufficient bridge wallet balance or a transfer failure.
- Any unexpected Jetton wallet address or owner is observed.

## Evidence To Archive

For each approved mainnet phase, archive:

- generated dry-run plan
- TonConnect signing package
- signed transaction hashes
- contract addresses
- code hashes and data hashes
- Jetton wallet derivation evidence
- getter snapshots before and after each phase
- bridge wallet balance snapshots
- `SeasonClaimV2` wallet balance snapshots
- legacy pending cleanup query id and final pending amount
- audit thread approval summary

## Current Non-Executable Status

This runbook is intentionally non-executable today. The only approved next on-chain action is the testnet legacy pending cleanup after `2026-05-01T14:45:31Z`.
