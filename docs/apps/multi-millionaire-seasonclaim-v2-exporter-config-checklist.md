# Multi-Millionaire SeasonClaimV2 Exporter Config Checklist

Status: `DRAFT ONLY - BLOCKED UNTIL TESTNET LEGACY PENDING CLEANUP COMPLETE`

This checklist is for `multi-millionaire` exporter and configuration planning only. It is not a deployment plan, signing package, root publication approval, or permission to edit production environment variables.

Do not produce a publishable SeasonClaimV2 root until:

- `deployments/season-claim-v2-legacy-bridge.testnet.latest.json` has status `complete`
- testnet legacy pending query `1777387300691001` amount is `0`
- audit accepts the final cleanup evidence with no P1/P2 blocker
- `SeasonClaimV2` is deployed on mainnet and funded for the public season amount being registered
- owner explicitly approves the public V2 root publication step

## Current Non-Publishable Rehearsal Artifact

The `multi-millionaire` thread regenerated and locally validated a non-publishable V2 large rehearsal artifact with the bridge-focused testnet `SeasonClaimV2` address.

Artifact:

```text
/Users/yudeyou/Desktop/multi-millionaire/tmp/season-war/rehearsal-v2-large
```

Accepted rehearsal fields:

| Field | Value |
| --- | --- |
| root | `0x193640462ca21e8a3914908cc5f6d2dbc48a0284dba8113b1b6672733d434492` |
| leaf count | `128` |
| chain id | `ton-testnet` |
| claim contract version | `season-claim-v2` |
| proof format | `ref-chain:siblingOnLeft-bool+sibling-uint256` |
| production root publishable | `false` |
| source evidence | `deployments/season-claim-v2-legacy-bridge.testnet.latest.json` |
| source evidence status | `bridge-forward-complete-pending-legacy-settle` |
| selected claim contract | `kQDEELj9KCzdqT07sVp4FRnbZRo-QhjS5ig0N6lcpJDGcn0H` |
| SeasonClaimV2 testnet | `kQDEELj9KCzdqT07sVp4FRnbZRo-QhjS5ig0N6lcpJDGcn0H` |
| bridge testnet | `kQAXCCNSnY_MmBJwjrJi4zRIvli1p1zi1GtP7L0wf0WaP_l5` |
| retained legacy SeasonClaim mainnet field | `EQCYvg-_oFE8q8cweVScna-WDRzDYol-FBwHKuTcAjcFGonS` |

Local acceptance checks:

- manifest and operator registration artifact both set `production_root_publishable: false`
- all 128 leaves include canonical `proofCellBase64`
- no V2 leaf emits the legacy `seasonClaimProofCellBase64` alias
- V2 manifest omits `max_supported_single_cell_leaves`
- all leaf proofs have depth `7`, matching a 128-leaf tree
- manifest keeps the legacy v1 `season_claim_address` separate from the selected V2 address
- operator registration artifact targets the bridge-focused testnet `SeasonClaimV2` address

This artifact is accepted only as exporter/proof-format evidence. It is not a chain rehearsal, root publication artifact, mainnet deployment artifact, or signing input.

## Scope

Allowed before the final settle gate:

- document future exporter settings
- document future manifest fields
- document stop conditions
- prepare source artifact and review checklist wording
- review current `multi-millionaire` helper behavior

Not allowed before the final settle gate:

- editing production `.env` files
- generating publishable roots
- registering public V2 roots
- generating mainnet signing payloads
- sending bridge claim or manual-forward transactions
- publishing a public claim URL that points users to an unfunded V2 root

## Current Contract Facts

Use these facts when reviewing exporter inputs:

| Field | Value | Status |
| --- | --- | --- |
| V3 Jetton master | `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3` | current mainnet |
| SeasonVault | `EQCkI1atYYWN-2cnJJASJ1nKsu0ZbvCd_EVZQ61KcoIW-13l` | current mainnet |
| Frozen V2 SeasonClaim | `EQCYvg-_oFE8q8cweVScna-WDRzDYol-FBwHKuTcAjcFGonS` | historical archive |
| Frozen V2 Jetton master | `EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg` | historical archive |
| SeasonClaimV2 | `EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b` | current mainnet |
| SeasonClaimV2LegacyBridge | unset | future audited mainnet address only |

The legacy `SEASON_CLAIM_ADDRESS` value may continue to point to the deployed legacy SeasonClaim for v1 small rehearsal exports. It must not be repurposed as the current V3 claim address without an explicit app-side migration review.

## Future Environment Placeholders

These names are planning placeholders only. Do not add them to production `.env` until the mainnet dry-run and owner approval are complete.

```text
SEASON_CLAIM_VERSION=season-claim-v2
SEASON_CLAIM_V2_ADDRESS=EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b
SEASON_CLAIM_V2_BRIDGE_ADDRESS=<audited-mainnet-bridge-address>
SEASON_CLAIM_PROOF_FORMAT=ref-chain:siblingOnLeft-bool+sibling-uint256
SEASON_CLAIM_ROOT_PUBLISHABLE=false
SEASON_CLAIM_V2_FUNDING_STATUS=blocked-pending-testnet-legacy-settle
SEASON_CLAIM_V2_FUNDING_EVIDENCE_PATH=/Users/yudeyou/Desktop/72h-capital-contracts/deployments/season-claim-v2-legacy-bridge.testnet.latest.json
```

Default behavior must stay fail-closed:

- v1 exports use `season-claim-v1` and single-cell proof format
- v1 exports reject trees above 8 leaves
- v2 exports use `season-claim-v2` and ref-chain proof format
- v2 exports default to `production_root_publishable: false`
- v2 exports require an explicit `SeasonClaimV2` address for leaf hashing
- any missing V2 funding evidence keeps publication blocked

## Required Manifest Fields

Every future V2 manifest should include these fields or equivalent data:

- `claim_contract_version`
- `proof_format`
- `production_root_publishable`
- `chain_id`
- `token_address`
- `season_vault_address`
- `legacy_season_claim_address`
- `season_claim_v2_address`
- `season_claim_v2_bridge_address`
- `season_claim_v2_code_hash`
- `season_claim_v2_bridge_code_hash`
- `v2_funding_status`
- `v2_funding_evidence_path`
- `v2_funding_evidence_hash`
- `source_artifact_hash`
- `source_export_generated_at`
- `season_id`
- `successful_round_count`
- `leaf_count`
- `pool_totals_raw`
- `round_budget_raw`
- `recipient_wallet_verification_source`
- `risk_filter_snapshot`

For v1 manifests only:

- include `max_supported_single_cell_leaves`
- include `seasonClaimProofCellBase64` only as a legacy alias equal to `proofCellBase64`

For v2 manifests:

- do not emit `seasonClaimProofCellBase64`
- set `proofCellBase64` to the ref-chain proof cell
- bind every leaf to the deployed mainnet `SeasonClaimV2` address
- leave `production_root_publishable: false` until V2 funding is complete

## Allocation Checks

The exporter must preserve the existing Season War allocation math:

| Pool | Share | Per successful round raw amount |
| --- | ---: | ---: |
| personal | 50% | `250000000000000000` |
| team | 25% | `125000000000000000` |
| referral | 15% | `75000000000000000` |
| leaderboard | 10% | `50000000000000000` |
| total | 100% | `500000000000000000` |

For a season with `N` successful rounds, the manifest totals must be:

```text
personal = N * 250000000000000000
team = N * 125000000000000000
referral = N * 75000000000000000
leaderboard = N * 50000000000000000
total = N * 500000000000000000
```

Stop if any pool total does not match exactly.

## Source Artifact Requirements

Before publishing any public V2 root, archive:

- successful round list and source of finality
- source rows before risk filtering
- quarantine rows and reasons
- verified wallet snapshot
- chain-verified lock position snapshot
- referral eligibility snapshot
- squad/team eligibility snapshot
- leaderboard query snapshot and deterministic tie-breakers
- final leaves with amounts
- proof artifact
- manifest
- Merkle root
- source artifact hash
- exporter source commit

The app must not rely on `/Users/yudeyou/Desktop/72` as the reward accounting source. The accounting source remains `multi-millionaire`.

## Operator Export Flow

Draft-only flow before final settle gate:

1. Freeze the intended successful round list.
2. Export source rows from `multi-millionaire`.
3. Generate a non-publishable V2 preview manifest with `production_root_publishable: false`.
4. Confirm leaf count, pool totals, proof format, and leaf contract address.
5. Archive preview artifacts for audit review.

Publishable flow after all gates pass:

1. Confirm testnet legacy pending cleanup evidence status is `complete`.
2. Confirm audit has no P1/P2 blocker after final cleanup.
3. Confirm mainnet `SeasonClaimV2` and bridge addresses match the reviewed dry-run.
4. Confirm mainnet `SeasonClaimV2` is funded for the full public season total.
5. Generate the publishable V2 manifest with the deployed `SeasonClaimV2` address.
6. Confirm `production_root_publishable: true` only after funding evidence is attached.
7. Register the public V2 root only through the owner-approved signing process.

## Stop Conditions

Stop exporter publication immediately if any condition is true:

- testnet legacy pending cleanup evidence is missing or not `complete`
- audit reports a P1/P2 blocker
- `SeasonClaimV2` mainnet address is missing
- bridge mainnet address is missing when bridge migration evidence is required
- manifest uses an old testnet `SeasonClaimV2` address
- manifest uses legacy SeasonClaim address for a V2 public root
- v2 proof format is not `ref-chain:siblingOnLeft-bool+sibling-uint256`
- v2 manifest emits `seasonClaimProofCellBase64`
- v1 manifest has more than 8 leaves
- pool totals do not match 50/25/15/10 exactly
- any recipient lacks a verified primary wallet
- any open or reviewing risk flag remains in the publishable leaf set
- `SeasonClaimV2.funded72H` is below the manifest total
- V2 Jetton wallet balance is below the manifest total
- owner has not approved root publication after reviewing evidence

## Cross-Repository References

Contracts repo source of truth:

- `/Users/yudeyou/Desktop/72h-capital-contracts/docs/apps/multi-millionaire-900b-reward-integration.md`
- `/Users/yudeyou/Desktop/72h-capital-contracts/docs/season-claim-v2-mainnet-migration-runbook.md`
- `/Users/yudeyou/Desktop/72h-capital-contracts/docs/season-claim-v2-mainnet-operator-checklist.md`

App repo references:

- `/Users/yudeyou/Desktop/multi-millionaire/docs/contracts/season-war-rewards.md`
- `/Users/yudeyou/Desktop/multi-millionaire/server/src/services/seasonRewards.ts`
