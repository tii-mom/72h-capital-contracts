# Owner Custody Runbook

Status: `DRAFT - REQUIRED BEFORE HIGH-RISK OWNER OPERATIONS`

This runbook defines owner operation controls for the deployed 72H V2 contracts and future `SeasonClaimV2` migration work. It is not a signing package.

## Risk Classes

Low-risk operations:

- read-only getter snapshots
- dry-run generation without payloads
- code hash, data hash, and address derivation review
- audit evidence indexing
- testnet-only rehearsals without mainnet signing material

Medium-risk operations:

- producing a mainnet dry-run JSON with no payloads
- preparing a draft TonConnect package after all gates pass but before signing
- updating public documentation that references deployed addresses
- settling expired pending accounting when no high-value funds move

High-risk operations:

- presale activation, stage changes, purchase opening, sweep, or withdrawal
- `SeasonClaim` or `SeasonClaimV2` root registration
- price-stage unlocks
- bridge deployment, legacy claim, manual forward, or bridge target/wallet setup
- any Jetton transfer, owner withdrawal, sweep, or funding action
- any operation that changes production app exporter publishability

High-risk operations require explicit owner approval and two-person review before signing.

## Two-Person Review

Before any medium or high-risk owner action:

1. Reviewer A generates or records the dry-run evidence.
2. Reviewer B independently checks addresses, code hashes, data hashes, amounts, query ids, and target contract state.
3. Both reviewers record approval with timestamp, source commit, evidence paths, and the exact action labels.
4. The signer compares the wallet prompt against the approved payload list immediately before signing.

The signer must stop if wallet UI amounts, destinations, payload count, or valid-until differ from the approved artifact.

## Payload Generation Rules

Before generating payloads:

- confirm the current source commit
- confirm the relevant blocker worklist item is closed
- confirm the latest audit follow-up has no P1/P2 blocker
- confirm the chain is mainnet only when mainnet is intended
- confirm no testnet-only mock contract appears in the package
- confirm no public V2 root appears before V2 funding is complete
- confirm query ids are in the documented namespace
- confirm generated contract addresses match the reviewed dry-run

Do not generate mainnet payloads for `SeasonClaimV2` or `SeasonClaimV2LegacyBridge` while `deployments/season-claim-v2-legacy-bridge.testnet.latest.json` status is not `complete`.

## Signing Checklist

For every signed batch, archive:

- source commit
- script command
- package path and SHA-256 hash
- expected destination addresses
- expected TON values and Jetton amounts
- expected message labels
- wallet screenshot or exported confirmation summary
- signed transaction hashes
- getter snapshots before and after
- reviewer names or handles

Each batch must be independently stoppable. Do not combine presale, root registration, bridge funding, sweep, withdrawal, and unrelated setup in one signing batch.

## Forbidden Until Explicitly Unblocked

- activating `PresaleVault`
- registering a public `SeasonClaimV2` root
- deploying or funding an unaudited bridge
- signing any package containing testnet mocks
- moving high-value owner funds without two-person review
- treating draft exporter artifacts as publishable production roots

## Evidence Format

Use this minimum evidence record for each owner action:

```json
{
  "operationId": "human-readable-id",
  "riskClass": "low|medium|high",
  "network": "mainnet|testnet",
  "sourceCommit": "<git commit>",
  "generatedAt": "<ISO-8601>",
  "approvedAt": "<ISO-8601>",
  "reviewers": ["<reviewer-a>", "<reviewer-b>"],
  "packagePath": "<path-or-null>",
  "packageSha256": "<hash-or-null>",
  "expectedMessages": [],
  "preGetterSnapshot": {},
  "transactionHashes": [],
  "postGetterSnapshot": {},
  "stopConditionsChecked": []
}
```

