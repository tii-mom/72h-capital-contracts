# SeasonClaimV2 Design

Status: implemented candidate, testnet rehearsed, not mainnet deployed.

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

## Testnet Evidence

Latest focused SeasonClaimV2 testnet rehearsal:

- Evidence: `deployments/season-claim-v2.testnet.latest.json`
- Timestamped evidence: `deployments/season-claim-v2.testnet.2026-04-28T09-25-57-992Z.json`
- Deployed testnet SeasonClaimV2: `kQAZgDqwx5LJFseLP0Tf8XQITz5nMKa41taB17zp2jWdiJko`
- Testnet code hash: `9a9488a0e2ba150ac6e2e0b9bc4feec93b5a7439059096de202543a3a46ea2c1`
- Rehearsed path: deploy, set Jetton wallet, fund through real V2 testnet Jetton transfer notification, register 128-leaf ref-chain root, unlock, claim, sweep expired season, and true bounced transfer rollback through a testnet-only bouncing Jetton wallet mock.
- Misti all-detectors output: `audit-artifacts/misti-seasonclaim-v2-post-p3-bounce-2026-04-28.json/warnings.json`
- Misti high-severity run: exit code 0, no high/critical findings.

## Mainnet Planning Caveat

The currently deployed mainnet `SeasonVault` is already funded and its route setter is locked once funding or allocation is non-zero. A standalone `SeasonClaimV2` deployment does not automatically redirect the existing 90B SeasonVault inventory. Before mainnet use, the deployment plan must explicitly define the funding route for `SeasonClaimV2` rather than assuming the deployed `SeasonVault` can be retargeted.

## Next Steps

Before production use:

1. Get audit signoff on the post-P3 implementation and testnet evidence.
2. Confirm the production funding route for `SeasonClaimV2`, given the deployed mainnet `SeasonVault` route lock.
3. Generate a mainnet deployment or migration plan only after the funding route is selected and audited.
4. Update public docs/website JSON only after mainnet deployment is complete.
