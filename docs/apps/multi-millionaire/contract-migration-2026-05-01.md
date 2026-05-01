# Multi-Millionaire Contract Migration Record

Date: 2026-05-01

Source repository: `/Users/yudeyou/Desktop/multi-millionaire`

Destination repository: `/Users/yudeyou/Desktop/72h-capital-contracts`

## What Moved

The following draft app contracts were copied into a frozen archive:

- `contracts/lock_vault.tact` -> `contracts/apps/multi-millionaire/legacy/lock_vault.tact`
- `contracts/merkle_claim.tact` -> `contracts/apps/multi-millionaire/legacy/merkle_claim.tact`
- `contracts/test_jetton.tact` -> `contracts/apps/multi-millionaire/legacy/test_jetton.tact`

The related local tests were copied into the matching legacy test archive:

- `tests/LockVault.spec.ts` -> `tests/apps/multi-millionaire/legacy/LockVault.spec.ts`
- `tests/MerkleClaim.spec.ts` -> `tests/apps/multi-millionaire/legacy/MerkleClaim.spec.ts`
- `tests/TestJetton.spec.ts` -> `tests/apps/multi-millionaire/legacy/TestJetton.spec.ts`

## Current Status

The migrated contracts are frozen legacy references. They are not current V3 mainnet contracts and must not be treated as deployable production sources.

The dedicated V3 workspace is `contracts/apps/multi-millionaire/v3/`. Future production candidates should be implemented or promoted there only after they bind the current V3 configuration and pass this repository's tests, deployment rehearsal, mainnet plan, and audit gates.

Current V3 runtime facts:

- 72H V3 Jetton Master: `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3`
- SeasonClaimV2: `EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b`
- Metadata URI: `ipfs://QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC`
- Logo URI: `ipfs://QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4`

## Local App Repository Boundary

The source files remain in `/Users/yudeyou/Desktop/multi-millionaire/contracts/` as a legacy mirror because that application repository still has local build and test scripts that reference the paths directly.

Do not use the app repository's local contract folder as the source of truth for current mainnet contracts. Use this contract repository for contract promotion, and use the app repository only for runtime configuration, public contract JSON, token metadata display, indexing, and Season War export data.

## Safety Notes

No chain write, wallet signature, claim activation, presale activation, or funds movement was performed as part of this migration.
