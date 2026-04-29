# SeasonClaimV2 Mainnet Dry-Run Requirements

Status: `DRAFT ONLY - BLOCKED UNTIL TESTNET LEGACY PENDING CLEANUP COMPLETE`

This document defines the requirements for a future mainnet migration dry-run. It is not a generated plan and it must not be used as signing material.

No script may generate a mainnet signing package, TonConnect messages, signing HTML, `stateInit` BOC, or executable payloads until:

- `deployments/season-claim-v2-legacy-bridge.testnet.latest.json` has status `complete`
- testnet legacy pending amount for query `1777387300691001` is `0`
- audit accepts the final cleanup evidence with no P1/P2 blocker
- owner explicitly approves moving from draft planning to dry-run generation

## Objective

The future dry-run must describe a safe, reproducible migration route from the deployed mainnet legacy path to `SeasonClaimV2`:

```text
SeasonVault -> legacy SeasonClaim -> SeasonClaimV2LegacyBridge -> SeasonClaimV2
```

The dry-run must make it easy for an auditor and owner to verify addresses, code hashes, data hashes, Jetton wallet derivations, query namespaces, amounts, and stop conditions before any signing package exists.

## Non-Executable Output Rules

Before all hard gates pass, allowed outputs are limited to human-readable drafts:

- requirements documents
- operator checklists
- audit prompts
- placeholder schemas
- stop-condition lists
- evidence index files

Before all hard gates pass, prohibited outputs include:

- TonConnect JSON
- signing HTML
- base64 `stateInit`
- base64 message payloads
- deploy messages
- bridge claim messages
- bridge forward messages
- public V2 root registration messages
- any file named like a final mainnet deployment package

## Future Dry-Run Inputs

The future dry-run, once unblocked, must require explicit inputs rather than relying on ambiguous defaults.

Required chain facts:

- mainnet V2 Jetton master address
- deployed mainnet `SeasonVault` address
- deployed mainnet legacy `SeasonClaim` address
- production Jetton wallet code hash
- owner/admin wallet address
- intended `SeasonClaimV2` owner
- intended bridge owner
- intended migration amount raw units
- legacy season id used for the bridge leaf
- legacy root and source artifact hash
- unlock-stage evidence hash
- legacy claim query id
- manual forward query id

Required source evidence:

- mainnet deployment evidence: `deployments/72h-v2-mainnet.deployed-2026-04-28.md`
- current audited `SeasonClaimV2` code hash
- current audited `SeasonClaimV2LegacyBridge` code hash
- testnet bridge evidence with final status `complete`
- audit follow-up confirming no P1/P2 blockers
- `multi-millionaire` source artifact for the future public V2 root

## Future Dry-Run Outputs

After the hard gates pass and the owner approves dry-run generation, a dry-run JSON may include:

- generated at timestamp
- network
- mode: `dry-run`
- source commit
- code hashes
- data hashes
- proposed contract addresses
- derived Jetton wallet addresses
- query id namespace checks
- amount and category-total checks
- route diagram
- manual operator checkpoints
- expected getter snapshots before and after each phase
- stop conditions

A dry-run JSON must still not include signing payloads. A separate owner-approved step is required before producing a TonConnect package.

## Required Assertions

The future dry-run script must fail closed if any assertion fails:

- network is mainnet
- deployed mainnet V2 Jetton master matches official evidence
- deployed mainnet `SeasonVault` matches official evidence
- deployed mainnet legacy `SeasonClaim` matches official evidence
- production Jetton wallet code hash matches audited evidence
- `SeasonClaimV2` local code hash matches audit-approved hash
- bridge local code hash matches audit-approved hash
- bridge target is exactly the generated `SeasonClaimV2` address
- bridge Jetton wallet is derived from production wallet code and bridge owner address
- V2 Jetton wallet is derived from production wallet code and `SeasonClaimV2` address
- legacy claim query id is below the legacy sweep namespace
- manual forward query id is in the manual forward namespace
- migration amount is greater than zero
- public V2 root registration is omitted unless V2 funding is already complete

## Required Review Sections

The future dry-run output must contain these review sections:

1. Contract identity
2. Jetton wallet derivation
3. Migration amount
4. Query id namespace
5. Phase ordering
6. Required chain observations
7. Stop conditions
8. Evidence archive checklist
9. Explicit statement that no signing payloads are included

## Current Blocker

The current blocker is chain time on the testnet legacy pending cleanup. The pending query `1777387300691001` cannot be settled until `2026-05-01T14:45:31Z`. Draft-only planning may continue, but executable mainnet work is blocked.

