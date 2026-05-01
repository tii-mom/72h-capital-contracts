# Multi-Millionaire Contracts

Status: dedicated contract workspace for the `multi-millionaire` app.

`multi-millionaire` is the authoritative application for Season War reward accounting. It should feed SeasonClaimV2 Merkle roots, but app-specific contracts must be reviewed and promoted from this contract repository before any deployment plan treats them as production candidates.

## Current V3 Mainnet Boundary

- 72H V3 Jetton Master: `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3`.
- SeasonClaimV2: `EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b`.
- V3 metadata URI: `ipfs://QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC`.
- Display/navigation companion: `/Users/yudeyou/Desktop/72`.
- App data source: `/Users/yudeyou/Desktop/multi-millionaire`.

## Layout

- `legacy/`: frozen archive of draft app contracts copied from `/Users/yudeyou/Desktop/multi-millionaire/contracts/` on 2026-05-01. These files are historical references only.
- `v3/`: reserved workspace for reviewed V3 app-specific contracts that bind the current V3 Jetton Master and pass this repository's promotion gates.
- `../../../tests/apps/multi-millionaire/legacy/`: frozen archive of the tests copied with the legacy contracts.
- `../../../../docs/apps/multi-millionaire/contract-migration-2026-05-01.md`: migration record.

## Migration Rule

When an app contract becomes a production candidate, move or recreate the source under `v3/` and add:

- tests for sender authentication on Jetton callbacks
- tests for bounced amount mismatch
- deployment wrappers
- testnet evidence
- mainnet plan
- audit notes

Do not deploy the legacy draft app contracts from either repository until they pass this process.
