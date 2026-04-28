# SeasonClaimV2 Design

Status: implemented candidate, not deployed.

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

## Next Steps

Before production use:

1. Run full local validation.
2. Update the `multi-millionaire` exporter to emit ref-chain proof cells for production manifests.
3. Run a large dry-run artifact with realistic recipient counts.
4. Deploy `SeasonClaimV2` to testnet.
5. Run testnet funding/register/claim/bounce/sweep rehearsal.
6. Send the implementation and evidence to audit.
7. Only after audit signoff, generate a mainnet deployment plan and update public docs/website JSON with the new claim contract address.

