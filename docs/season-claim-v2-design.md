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

## Prior Testnet Evidence

Focused SeasonClaimV2 testnet rehearsal before the bridge receipt change:

- Evidence: `deployments/season-claim-v2.testnet.latest.json`
- Timestamped evidence: `deployments/season-claim-v2.testnet.2026-04-28T09-25-57-992Z.json`
- Deployed testnet SeasonClaimV2: `kQAZgDqwx5LJFseLP0Tf8XQITz5nMKa41taB17zp2jWdiJko`
- Historical testnet code hash: `9a9488a0e2ba150ac6e2e0b9bc4feec93b5a7439059096de202543a3a46ea2c1`
- Rehearsed path: deploy, set Jetton wallet, fund through real V2 testnet Jetton transfer notification, register 128-leaf ref-chain root, unlock, claim, sweep expired season, and true bounced transfer rollback through a testnet-only bouncing Jetton wallet mock.
- Misti all-detectors output: `audit-artifacts/misti-seasonclaim-v2-post-p3-bounce-2026-04-28.json/warnings.json`
- Misti high-severity run: exit code 0, no high/critical findings.

The bridge candidate adds an authenticated `ConfirmSeasonClaimFunding` receipt to `SeasonClaimV2`, so the current local `SeasonClaimV2` code hash is now `99b63712844f6032a34b10e52b2e8daa0eebc2e265603cc2176a5df7f6e02c26`. This supersedes the historical standalone testnet evidence for mainnet planning. A fresh bridge-focused testnet rehearsal is required before any mainnet deployment plan.

## Mainnet Planning Caveat

The currently deployed mainnet `SeasonVault` is already funded and its route setter is locked once funding or allocation is non-zero. A standalone `SeasonClaimV2` deployment does not automatically redirect the existing 90B SeasonVault inventory. Before mainnet use, the deployment plan must explicitly define the funding route for `SeasonClaimV2` rather than assuming the deployed `SeasonVault` can be retargeted.

## Legacy Bridge Candidate

`SeasonClaimV2LegacyBridge` is implemented as a migration candidate in `contracts/SeasonClaimV2LegacyBridge.tact`.

The bridge avoids changing the already-funded mainnet `SeasonVault` route:

1. Existing `SeasonVault` finalizes a season into the deployed legacy `SeasonClaim`.
2. The owner registers the legacy `SeasonClaim` root as a single leaf for the bridge contract address.
3. The bridge claims that single legacy leaf using the existing `ClaimSeasonReward` message.
4. The bridge accepts only the legacy `SeasonClaim` Jetton transfer notification from its configured Jetton wallet.
5. The bridge forwards received 72H to `SeasonClaimV2`.
6. `SeasonClaimV2` sends `ConfirmSeasonClaimFunding` back to the bridge, and the bridge finalizes forwarded accounting only on that authenticated confirmation.

This gives an auditable route from the existing 90B inventory into `SeasonClaimV2` without retargeting `SeasonVault`. The current bridge is conservative: because `SeasonClaimV2` still requires a season to be fully funded before `RegisterSeasonClaim`, public V2 roots should be registered only after the bridge has delivered the full season amount. Supporting progressive 20/40/60/80/100 V2 public claims from partial bridge funding would require a separate audited `SeasonClaimV2` accounting change.

Current local bridge code hash: `82f322cee7dbffe85c2295d43f06734475fa19512651389de93266f8f9ac148a`.

## Next Steps

Before production use:

1. Get audit signoff on the post-P3 implementation, testnet evidence, and `SeasonClaimV2LegacyBridge`.
2. If bridge route is accepted, run a focused testnet bridge rehearsal against deployed testnet contracts.
3. Generate a mainnet deployment or migration plan only after the bridge route is audited.
4. Update public docs/website JSON only after mainnet deployment is complete.
