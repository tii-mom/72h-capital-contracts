# Adjusted Final Launch Evidence Tasks - 2026-04-30

Status: `ACTIVE - PRE-CLEANUP PREPARATION ONLY`

This document replaces the informal task request with execution boundaries that match the current repository state. It does not authorize mainnet transactions.

## Hard Prohibitions

Do not send mainnet transactions.

Do not generate or sign mainnet payloads for:

- `SeasonClaimV2` deployment or public root registration
- `SeasonClaimV2LegacyBridge` deployment, claim, or manual forward
- `PresaleVault` activation, buy, sweep, or withdrawal
- any high-value owner transfer

Do not execute testnet legacy pending cleanup before `2026-05-01T14:45:31Z` (`2026-05-01 22:45:31 Asia/Shanghai`).

## Current State

Bridge evidence:

- manifest: `deployments/season-claim-v2-legacy-bridge.testnet.latest.json`
- status: `bridge-forward-complete-pending-legacy-settle`
- legacy pending query id: `1777387300691001`
- earliest cleanup time: `2026-05-01T14:45:31Z`

Presale state:

- deployed mainnet `PresaleVault` remains closed
- hardened local `PresaleVault` candidate code hash differs from the deployed mainnet code hash
- presale launch requires a separate audited funding/sale route

## Allowed Now

The following work is allowed before the cleanup timestamp:

1. Maintain runbooks and evidence checklists.
2. Run local build, typecheck, tests, interface assertions, and launch gate assertions.
3. Run Misti high-severity and all-detectors analysis on the exact working tree.
4. Summarize static-analysis output without treating all warnings as blockers.
5. Prepare two-person review materials for the future testnet cleanup.
6. Prepare presale hardened candidate audit notes and mainnet funding-route options.
7. Prepare owner custody evidence format and signing checklist.

## Future Testnet Cleanup Step

After `2026-05-01T14:45:31Z`, and only under two-person review:

1. Confirm query id `1777387300691001`.
2. Record getter snapshot before settle:
   - pending amount
   - openedAt
   - settleNotBefore
3. Execute only `SettleSeasonClaimPending(1777387300691001)` on testnet.
4. Record transaction hash and getter snapshot after settle.
5. Update `deployments/season-claim-v2-legacy-bridge.testnet.latest.json` to status `complete` only if pending amount is zero.
6. Archive timestamped evidence manifest.

No root registration, bridge mainnet action, presale action, or high-value transfer may be combined with this cleanup.

## Required Verification Commands

Run before reporting readiness:

```bash
npm run tact:build
npm run tact:check
npm run typecheck
npm test
npm run assert:season-claim-v2-interface
npm run verify:mainnet-launch-gates
npx @nowarp/misti@latest --min-severity high tact.config.json
```

Run all-detectors for evidence, allowing non-zero exit when warnings are emitted:

```bash
npx @nowarp/misti@latest -A -o json -O audit-artifacts/misti-exact-code-YYYY-MM-DD.json contracts
```

Summarize:

- tool version if available
- high/critical count
- total warning count
- warning categories
- whether any P1/P2 blocker is identified by review

## Remaining Go/No-Go Gates

Mainnet V2 claim route remains blocked until:

- testnet cleanup evidence status is `complete`
- audit accepts final cleanup evidence with no P1/P2 blocker
- exact-code Misti high/all-detectors evidence is archived
- owner custody evidence is complete
- mainnet dry-run and signing packages are separately approved

Presale remains blocked until:

- hardened presale candidate is externally reviewed
- mainnet sale/funding route is selected and audited
- owner custody/multisig controls are operational
- launch gate script passes on the final signing package

## Current Execution Snapshot

Recorded on `2026-04-30 Asia/Shanghai`.

Completed:

- `npm run tact:build`: passed; emitted only a Node `MaxListenersExceededWarning`.
- `npm run tact:check`: passed for all configured Tact projects.
- `npm run typecheck`: passed.
- `npm test`: passed, 9 test files / 71 tests.
- `npm run assert:season-claim-v2-interface`: passed.
- `npm run verify:mainnet-launch-gates`: passed while preserving the expected `SeasonClaimV2` executable mainnet block at status `bridge-forward-complete-pending-legacy-settle`.
- `npx @nowarp/misti@latest --min-severity high tact.config.json`: passed, no errors found.
- `npx @nowarp/misti@latest -A -o json -O audit-artifacts/misti-exact-code-2026-04-30 contracts`: wrote `audit-artifacts/misti-exact-code-2026-04-30/warnings.json` and exited non-zero because warnings were emitted.

All-detectors warning summary:

- total warnings: 529
- severity >= 8: 0
- severity 3: 31
- severity 2: 496
- severity 1: 2
- detector counts: `PreferredStdlibApi` 398, `UnboundMap` 82, `SuboptimalSend` 27, `PreferGlobalFunction` 16, `UnusedExpressionResult` 3, `AsmIsUsed` 2, `TransitiveImport` 1

No testnet cleanup transaction was executed in this snapshot because the cleanup timestamp has not arrived. No mainnet transaction, signing payload, or launch action was generated.
