# SeasonClaimV2 Design

Status: SeasonClaimV2 is deployed in the current V3 mainnet package at `EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b`. The manual-forward legacy bridge material in this document is frozen V2 archive context and must not be used for current V3 signing, bridge transactions, or public roots.

`SeasonClaimV2` addresses the proof-depth limit discovered during the `multi-millionaire` Season War exporter rehearsal. The deployed `SeasonClaim` reads all Merkle proof entries from a single cell. Because each entry is `siblingOnLeft bool + sibling uint256`, that format fits only three proof levels and roughly eight leaves.

## Change

`SeasonClaimV2` keeps the same reward model and accounting surface as `SeasonClaim`:

- season root registration
- 50/25/15/10 category total checks
- price-stage unlocks at 20/40/60/80/100 percent
- per-leaf cumulative claim accounting
- pending claim tracking
- bounce sender authentication
- bounced amount validation before rollback
- expired season sweep behavior

The only intended contract-level change is scalable proof traversal.

## Proof Format

The verifier still reads entries in claim order:

```text
siblingOnLeft: bool
sibling: uint256
```

For compatibility, a proof may still place several entries in one cell. For scale, the proof may continue through a single reference:

```text
cell(entry_0, optional ref -> cell(entry_1, optional ref -> ...))
```

The verifier rejects malformed tails:

- leftover bits that do not form a full entry
- more than one continuation reference in a proof cell
- empty continuation cells appended before or after valid proof entries

This supports deep Merkle paths while keeping the leaf schema, root hash, and claim message shape stable.

## Tests

`tests/season-claim-v2.spec.ts` covers:

- 128-leaf ref-chain proof claim
- wrong deep proof rejection
- legacy single-cell proof compatibility
- duplicate claim behavior
- wrong bounce sender does not roll back
- correct bounce sender with wrong amount does not roll back
- correct bounce sender with correct amount rolls back

`tests/season-claim-v2-legacy-bridge.spec.ts` covers:

- real legacy `SeasonClaim` payout with `forwardTonAmount: 0`
- no bridge contract notification on the legacy payout path
- bridge-owned Jetton wallet balance increase
- owner-triggered `ForwardBridgeWalletToV2` funding into `SeasonClaimV2`
- authenticated `ConfirmSeasonClaimFunding` finalization
- insufficient bridge wallet balance bounce rollback
- wrong amount, forged confirm, and duplicate manual forward query rejection
- legacy `SettleSeasonClaimPending` cleanup after bounce grace

## Prior Testnet Evidence

Focused SeasonClaimV2 testnet rehearsal before the bridge receipt change:

- Evidence: `deployments/season-claim-v2.testnet.latest.json`
- Timestamped evidence: `deployments/season-claim-v2.testnet.2026-04-28T09-25-57-992Z.json`
- Deployed testnet SeasonClaimV2: `kQAZgDqwx5LJFseLP0Tf8XQITz5nMKa41taB17zp2jWdiJko`
- Historical testnet code hash: `9a9488a0e2ba150ac6e2e0b9bc4feec93b5a7439059096de202543a3a46ea2c1`
- Rehearsed path: deploy, set Jetton wallet, fund through real V2 testnet Jetton transfer notification, register 128-leaf ref-chain root, unlock, claim, sweep expired season, and true bounced transfer rollback through a testnet-only bouncing Jetton wallet mock.
- Misti all-detectors output: `audit-artifacts/misti-seasonclaim-v2-post-p3-bounce-2026-04-28.json/warnings.json`
- Misti high-severity run: exit code 0, no high/critical findings.

The bridge candidate adds an authenticated `ConfirmSeasonClaimFunding` receipt to `SeasonClaimV2`, so the current local `SeasonClaimV2` code hash is now `99b63712844f6032a34b10e52b2e8daa0eebc2e265603cc2176a5df7f6e02c26`. This supersedes the historical standalone testnet evidence for mainnet planning.

## Bridge-Focused Testnet Evidence

Manual-forward bridge rehearsal phase 1 completed on testnet:

- Evidence: `deployments/season-claim-v2-legacy-bridge.testnet.latest.json`
- Timestamped evidence: `deployments/season-claim-v2-legacy-bridge.testnet.2026-04-28T14-46-27-843Z.json`
- Status: `bridge-forward-complete-pending-legacy-settle`
- Legacy SeasonClaim: `kQBFDtxtg2HXPBFoSvPMy0KwyZq4jI294bfwL35NixnDUtH4`
- SeasonClaimV2: `kQDEELj9KCzdqT07sVp4FRnbZRo-QhjS5ig0N6lcpJDGcn0H`
- Bridge: `kQAXCCNSnY_MmBJwjrJi4zRIvli1p1zi1GtP7L0wf0WaP_l5`
- Bridge Jetton wallet: `kQA5J_1iZ5HPIyFF0nL_4qScWAq-B_QvZGu1ctmjTCY-K157`
- V2 Jetton wallet: `kQCJbmU0LEqcflqQFrqIiDv8GfXYuFx9Iu6ndAUmZDIAgKyD`
- Legacy claim query id: `1777387300691001`
- Manual forward query id: `16191587300691002`
- Rehearsal amount: `1_000_000_000` raw units
- Bridge code hash: `86f767f5d56675c0b9c11c76f949022e4ddc1b12cb318a3c5f0a1105c3b83c76`
- SeasonClaimV2 code hash: `99b63712844f6032a34b10e52b2e8daa0eebc2e265603cc2176a5df7f6e02c26`

Verified getter snapshot:

- legacy `claimed72H = 1000000000`
- legacy `pendingClaimAmount = 1000000000`
- bridge `forwardedToV272H = 1000000000`
- bridge `pendingForward72H = 0`
- bridge `completedForwardAmount = 1000000000`
- SeasonClaimV2 `funded72H = 1000000000`
- bridge Jetton wallet balance is `0`
- SeasonClaimV2 Jetton wallet balance is `1000000000`

The remaining final gate is the legacy `SeasonClaim.SettleSeasonClaimPending(1777387300691001)` call after `2026-05-01T14:45:31Z`. Until that call clears legacy pending state and updates evidence status to `complete`, the bridge evidence is treated as phase 1 complete, final settle gate pending.

Audit follow-up after phase 1 concluded:

- no new P1/P2 blocker
- manual-forward design removes the legacy notification P1
- phase 1 evidence is sufficient for non-executable mainnet runbook preparation
- legacy pending cleanup was a V2 archive gate; do not use it to produce current V3 signing packages, bridge transactions, or public roots
- local verification reported by the audit thread: `npm run build`, focused bridge tests, `npm run lint`, and Misti high severity passed

## Frozen V2 Planning Caveat

This caveat applies to the frozen V2 line. Current V3 mainnet facts are in `docs/72H_MAINNET_FACTS.md`, with V3 `SeasonVault` and `SeasonClaimV2` deployed together. The V2 `SeasonVault` was already funded and its route setter locked once funding or allocation was non-zero, so a standalone `SeasonClaimV2` deployment could not automatically redirect the existing V2 90B SeasonVault inventory.

## Frozen Legacy Bridge Candidate

`SeasonClaimV2LegacyBridge` is implemented as a migration candidate in `contracts/archive/v2/SeasonClaimV2LegacyBridge.tact`.

The bridge avoids changing the already-funded mainnet `SeasonVault` route:

1. Existing `SeasonVault` finalizes a season into the deployed legacy `SeasonClaim`.
2. The owner registers the legacy `SeasonClaim` root as a single leaf for the bridge contract address.
3. The bridge claims that single legacy leaf using the existing `ClaimSeasonReward` message.
4. The legacy `SeasonClaim` sends its claim payout with `forwardTonAmount: 0`, so the bridge contract itself does not receive a Jetton transfer notification.
5. The operator confirms on chain that the bridge-owned Jetton wallet balance increased.
6. The owner calls `ForwardBridgeWalletToV2(queryId, amount72H)` on the bridge.
7. The bridge sends a Jetton transfer from its configured Jetton wallet to the fixed `SeasonClaimV2` address.
8. `SeasonClaimV2` receives the real funding notification and sends `ConfirmSeasonClaimFunding` back to the bridge; the bridge finalizes forwarded accounting only on that authenticated confirmation.

This was a V2 archive route from the existing V2 90B inventory into `SeasonClaimV2` without retargeting `SeasonVault`. Do not use it as the current V3 funding route.

Bridge hardening after audit review:

- bridge wallet and V2 target configuration lock permanently after the first legacy claim attempt
- legacy claim query ids must stay below the legacy `SeasonClaim` sweep namespace `7207000600000000`
- manual forward query ids must be `>= 14414200000000000`
- `forwardToV2` rejects pending and already-completed query collisions
- the bridge does not attest legacy success from notifications; wallet balance confirmation is an operator checkpoint
- if the bridge wallet balance is insufficient, the bridge wallet bounces the Jetton transfer and the bridge clears the pending forward
- unauthenticated `JettonExcesses` do not finalize bridge forwarding

Legacy pending cleanup runbook:

1. After the bridge legacy claim transaction succeeds, record the legacy claim `queryId`.
2. Confirm the bridge Jetton wallet balance increased by the expected claim amount or the currently unlocked partial amount.
3. Perform `ForwardBridgeWalletToV2(queryId, amount72H)` only after that balance check.
4. After the legacy claim's 72-hour bounce grace has elapsed, call `SettleSeasonClaimPending(queryId)` on the legacy `SeasonClaim`.
5. Verify `getPendingClaimAmount(queryId) == 0` before any later legacy sweep workflow.

Current local bridge code hash: `86f767f5d56675c0b9c11c76f949022e4ddc1b12cb318a3c5f0a1105c3b83c76`.

## Next Steps

Before production use:

1. Keep drafting mainnet migration runbook and audit follow-up materials under `BLOCKED UNTIL TESTNET LEGACY PENDING CLEANUP COMPLETE`.
2. Complete the legacy pending cleanup after the 72-hour bounce grace.
3. Update bridge-focused testnet evidence to `complete` after `SettleSeasonClaimPending` clears the legacy pending amount.
4. Generate any mainnet signing package only after the bridge route is audited and the bridge-focused testnet rehearsal, including pending cleanup, passes.
5. Update public docs/website JSON only after mainnet deployment is complete.
