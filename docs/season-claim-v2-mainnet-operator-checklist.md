# SeasonClaimV2 Mainnet Operator Checklist

Status: `DRAFT ONLY - BLOCKED UNTIL TESTNET LEGACY PENDING CLEANUP COMPLETE`

This checklist is for human operation planning. It is not a transaction plan and contains no signing payloads.

## Phase 0 - Hard Gate Review

Do not proceed to dry-run generation unless every item is true:

- latest testnet bridge evidence status is `complete`
- testnet legacy pending query `1777387300691001` amount is `0`
- audit follow-up after final cleanup reports no P1/P2 blocker
- owner approves moving from draft planning to dry-run generation
- current branch and source commit are recorded
- `npm run lint` passes
- `npm run build` passes
- Misti high severity reports no errors
- Misti all-detectors artifact is archived

Stop if any item is false.

## Phase 1 - Draft Dry-Run Review

After the hard gate passes, generate only a dry-run JSON first. Do not generate TonConnect JSON or signing HTML in this phase.

Review:

- generated mainnet `SeasonClaimV2` address
- generated bridge address
- `SeasonClaimV2` code hash
- bridge code hash
- `SeasonClaimV2` data hash
- bridge data hash
- V2 Jetton wallet derivation
- bridge Jetton wallet derivation
- owner/admin addresses
- legacy `SeasonClaim` address
- deployed mainnet `SeasonVault` address
- query id namespace checks
- migration amount raw units
- legacy season id
- legacy root source artifact
- unlock-stage evidence hash

Stop if any address, hash, owner, amount, or query id differs from the reviewed draft.

## Phase 2 - Owner Approval Before Signing Package

Before any signing package is generated, the owner must approve:

- dry-run JSON path
- exact source commit
- exact `SeasonClaimV2` address
- exact bridge address
- exact code hashes
- exact migration amount
- exact query ids
- exact phase order
- stop conditions

This approval must be recorded in the repository evidence notes.

## Phase 3 - Signing Package Generation

This phase is still blocked today. When unblocked and owner-approved, generate signing material in separate batches so each step can be inspected and stopped independently.

Suggested batch separation:

1. deploy `SeasonClaimV2`
2. deploy bridge
3. set `SeasonClaimV2` Jetton wallet
4. set bridge Jetton wallet
5. set bridge `SeasonClaimV2` target
6. register legacy bridge leaf/root
7. unlock the relevant legacy claim stage
8. bridge claims the legacy leaf
9. owner manually forwards bridge wallet inventory to V2
10. after 72-hour legacy bounce grace, settle legacy pending
11. only after V2 funding is complete, register public V2 roots

Do not batch unrelated phases together. A failed or unexpected observation must stop the run before the next batch.

## Phase 4 - Pre-Bridge Observations

Before bridge claims the legacy leaf, record:

- legacy `SeasonClaim` getter state
- bridge getter state
- `SeasonClaimV2` getter state
- bridge Jetton wallet balance
- `SeasonClaimV2` Jetton wallet balance
- owner wallet balance
- relevant legacy season total
- relevant unlock percentage
- expected currently claimable amount

Stop if expected claimable amount is zero or does not match the migration phase being executed.

## Phase 5 - After Legacy Claim

After bridge claims the legacy leaf, record:

- transaction hash
- bridge Jetton wallet balance
- legacy pending amount by query id
- legacy pending opened-at timestamp
- bridge `legacyClaimRequested72H`
- bridge `pendingForward72H`
- `SeasonClaimV2.funded72H`

Continue only if the bridge Jetton wallet balance increased by the amount intended for manual forward.

## Phase 6 - Manual Forward To V2

Before calling `ForwardBridgeWalletToV2`, confirm:

- caller is owner
- bridge target is fixed to `SeasonClaimV2`
- bridge Jetton wallet is correct
- bridge wallet balance is at least the forward amount
- no bridge pending forward exists
- manual forward query id has not been used

After forward, record:

- bridge `pendingForward72H`
- bridge `forwardedToV272H`
- bridge completed amount by query id
- `SeasonClaimV2.funded72H`
- bridge Jetton wallet balance
- `SeasonClaimV2` Jetton wallet balance

Stop if pending forward remains non-zero after the expected confirmation window.

## Phase 7 - Legacy Pending Cleanup

The legacy pending cleanup must wait for the legacy 72-hour bounce grace after the claim. The current testnet cleanup for query `1777387300691001` is a controlled exception to the general owner-operation block only after `2026-05-01T14:45:31Z` (`2026-05-01 22:45:31 Asia/Shanghai`), and only if it clears expired pending accounting without registering roots, enabling presale, or moving high-value funds.

Before cleanup:

- confirm `now > pendingOpenedAt + 72h`
- confirm pending amount is still present
- confirm no bounce has already cleared the pending state

After cleanup:

- confirm pending amount by query id is `0`
- confirm pending opened-at is `0`
- record transaction hash
- archive getter snapshot

## Phase 8 - Public V2 Root Publication

Only publish public V2 roots after V2 funding is complete.

Before public root registration:

- confirm `SeasonClaimV2.funded72H` covers the full season total
- confirm app exporter uses `SeasonClaimV2` address in the leaf domain
- confirm app exporter uses V2 ref-chain proof format for large recipient sets
- confirm category totals sum to the season total
- confirm risk filtering and wallet verification source artifact is archived

Stop if any source artifact is missing.

## Universal Stop Conditions

Stop immediately if:

- a P1/P2 finding is raised
- a generated address differs from the reviewed dry-run
- a code hash differs from the reviewed dry-run
- a data hash differs from the reviewed dry-run
- bridge Jetton wallet balance does not increase after legacy claim
- bridge wallet balance is below intended forward amount
- `SeasonClaimV2` funding does not increase after manual forward
- bridge pending forward does not clear
- legacy pending cleanup is attempted before 72 hours
- public root publication is attempted before V2 funding is complete
