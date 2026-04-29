# 72H V2 Blocker Follow-Up Worklist

Status: `ACTIVE - MAINNET EXECUTION BLOCKED`

This document converts the current review blockers into follow-up work. It is a planning and tracking document only. It does not authorize mainnet signing, presale activation, public `SeasonClaimV2` root registration, bridge funding, or high-value owner operations.

Current date context: `2026-04-29 Asia/Shanghai`.

Latest adjusted task boundary: `docs/adjusted-final-launch-evidence-tasks-2026-04-30.md`.

## Mainnet Launch Gates

Allowed before all gates pass:

- read-only public display and documentation updates
- dry-run requirements and non-executable dry-run schemas
- code hash and data hash checks
- Jetton wallet derivation checks
- audit prompts and evidence summaries
- local tests, testnet rehearsals, and static analysis
- testnet legacy pending cleanup dry-run

Forbidden before all gates pass:

- presale launch or presale activation
- public `SeasonClaimV2` root registration
- unaudited bridge deployment, claim, or forward on mainnet
- any high-value owner transfer, sweep, withdrawal, or funding operation
- mainnet TonConnect JSON, signing HTML, `stateInit`, or payload generation for `SeasonClaimV2` or `SeasonClaimV2LegacyBridge`
- production exporter root publication for large V2 recipient sets

Controlled exception:

- The testnet legacy pending cleanup for query `1777387300691001` may be executed after `2026-05-01T14:45:31Z` (`2026-05-01 22:45:31 Asia/Shanghai`) if it only clears expired pending accounting, does not register a root, does not enable presale, and does not move high-value funds.

## Work Items

| ID | Blocker | Required output | Gate |
| --- | --- | --- | --- |
| B1 | Testnet legacy pending cleanup is time-gated. | Dry-run evidence now; after `2026-05-01T14:45:31Z`, settle query `1777387300691001` under two-person review and archive tx hash, getter before/after, and updated manifest status `complete`. | Blocks all executable mainnet V2/bridge work. |
| B2 | Existing mainnet `SeasonVault` cannot be retargeted to standalone `SeasonClaimV2`. | Audited adapter route `SeasonVault -> legacy SeasonClaim -> SeasonClaimV2LegacyBridge -> SeasonClaimV2`, including contract source, code/data hash, wallet derivation, dry-run plan, testnet rehearsal, and Misti high-severity evidence. | Blocks public V2 root and bridge funding. |
| B3 | `PresaleVault` needs extra regression coverage and fixes around reopen, sweep, and pending withdraw. | Local candidate now hardens authenticated excess finalization, settled-only withdrawal, sweep/reopen inventory accounting, and query reuse; next output is external audit plus a mainnet funding route because the deployed mainnet `PresaleVault` is not upgradeable. | Blocks presale activation and presale owner operations. |
| B4 | Owner custody process needs explicit risk classes. | Owner custody runbook with operation tiers, two-person review, payload generation checks, signing checklist, forbidden actions, and evidence archive format. | Blocks high-risk owner transactions. |
| B5 | Stable V2 interface needs a published contract for app/backoffice consumers. | Versioned wrappers/ABI/opcodes/getters/errors/events document, pinned code hashes, and a script assertion for accidental interface drift. | Blocks app integration promotion beyond draft. |
| B6 | Mainnet signing package must exclude testnet mocks and gated V2 actions. | Scripted manifest/package check that fails if testnet mocks, V2 public root, bridge deployment, or bridge transaction strings appear in mainnet package files before the final gate. | Blocks signing package review. |
| B7 | Final verification bundle is incomplete until B1-B6 are closed. | `npm run tact:build`, targeted tests, key/full Vitest, Misti high severity, mainnet gate checks, and evidence manifest review. | Blocks final launch approval. |

## Current Owner-Action Boundary

The only owner-like action listed here that can become executable before mainnet V2 launch is B1, and only on testnet after the exact grace timestamp. It must be treated as accounting cleanup, not as a launch action.

All mainnet presale, root registration, bridge funding, sweep, withdrawal, or high-value owner actions remain blocked until their specific gates pass and owner approval is recorded.

The current presale-specific route is tracked in `docs/presale-vault-launch-runbook.md`.
