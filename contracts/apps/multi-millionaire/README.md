# Multi-Millionaire Contracts

Status: planning and migration boundary.

`multi-millionaire` is the authoritative application for the 90B successful-round reward accounting. It should feed SeasonClaim Merkle roots but should not deploy unreviewed app contracts directly from its application repository.

## Accepted 90B Role

- Personal deposit pool: 50%.
- Team deposit pool: 25%.
- Referral/new-user pool: 15%.
- Leaderboard pool: 10%.
- Claim path: deployed `SeasonClaim`.
- Display/navigation companion: `/Users/yudeyou/Desktop/72`.
- Production-scale claim path: pending `SeasonClaimV2` testnet rehearsal and audit.

## Migration Rule

When an app contract becomes a production candidate, move or recreate the source here and add:

- tests for sender authentication on Jetton callbacks
- tests for bounced amount mismatch
- deployment wrappers
- testnet evidence
- mainnet plan
- audit notes

Do not deploy the draft app contracts from `/Users/yudeyou/Desktop/multi-millionaire/contracts/` until they pass this process.
