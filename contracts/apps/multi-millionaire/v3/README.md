# Multi-Millionaire V3 App Contracts

Status: production-candidate draft, not deployed.

Use this directory for app-specific contracts that are intentionally aligned with the current 72H V3 mainnet set:

- 72H V3 Jetton Master: `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3`
- SeasonClaimV2: `EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b`

`MultiMillionaireDepositVault.tact` is the V3 target-deposit candidate for Multi-Millionaire:

- users choose one supported USD9 goal on first deposit
- the goal cannot be lowered or changed during the active cycle
- deposits remain in the vault-owned Jetton wallet
- there is no time-based unlock
- after the active balance reaches the selected USD goal at a fresh applied price, the user may withdraw the full active balance once
- `JettonExcesses` finalizes pending withdrawals, and matching bounced `JettonTransfer` messages restore active state

Before any deployment or production promotion, this contract still needs:

- explicit V3 address binding or constructor configuration
- sender-authentication tests for Jetton callbacks: covered locally by
  `tests/apps/multi-millionaire/v3/MultiMillionaireDepositVault.spec.ts`
- bounced-transfer and amount-mismatch tests: covered locally by
  `tests/apps/multi-millionaire/v3/MultiMillionaireDepositVault.spec.ts`
- deployment wrappers
- testnet evidence at
  `deployments/apps/multi-millionaire/v3/deposit-vault.testnet.latest.json`
- mainnet plan
- audit notes

Run the pre-mainnet app gate before any mainnet package includes this contract:

```bash
npm run verify:multi-millionaire-v3-gates
```

The gate intentionally fails until the testnet evidence file exists with
`status: "complete"` and all required testnet checks marked true.

Do not perform chain writes, wallet signatures, claim activation, presale activation, or funds movement from this workspace without a separate explicit approval.
