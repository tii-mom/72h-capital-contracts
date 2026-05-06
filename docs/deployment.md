# Deployment

This repository is now the source of truth for the current 72H V3 mainnet contract facts and future app-contract candidates. V3 is already deployed; this document describes safe planning and verification entrypoints, not permission to sign new mainnet transactions.

## Current Mainnet Source Of Truth

- Official V3 Jetton master: `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3`
- Mainnet facts: `docs/72H_MAINNET_FACTS.json`
- Website integration JSON: `integrations/website/72h-v3-mainnet.json`
- Post-deploy evidence: `deployments/v3-mainnet/72h-v3-mainnet.postdeploy.latest.json`
- V3 TonConnect archive: `deployments/v3-mainnet/72h-v3-mainnet.tonconnect.json`

The V3 TonConnect and HTML files are executed archives. Do not reuse them as fresh signing input.

## Safe Commands

Use these read-only or dry-run commands for the current V3 baseline:

```bash
npm run typecheck
npm run tact:check
npm run build
npm run test
npm run verify:mainnet-launch-gates
npm run verify:v3-mainnet-postdeploy
npm run verify:multi-millionaire-v3-gates
npm run plan:multi-millionaire-deposit-vault:mainnet
```

`npm run plan:mainnet` and `npm run plan:mainnet:tonconnect` point to the V3 planning commands. They are not owner approval and must not be treated as a signing window.

## Environment Placeholders

- `TON_MAINNET_RPC_URL`
- `TON_MAINNET_RPC_API_KEY`
- `TON_MAINNET_72H_JETTON_MASTER_ADDRESS`
- `TON_MAINNET_72H_V3_JETTON_MASTER_ADDRESS`
- `TON_MAINNET_OPERATOR_ADDRESS`
- `TON_MAINNET_MULTI_MILLIONAIRE_DEPOSIT_VAULT_OWNER_ADDRESS`
- `TON_MAINNET_MULTI_MILLIONAIRE_OPERATOR_APPROVAL_RECORD`
- `TON_MAINNET_MULTI_MILLIONAIRE_CANARY_MAX_AMOUNT_RAW`
- `TON_MAINNET_MULTI_MILLIONAIRE_CANARY_WINDOW`
- `TON_MAINNET_MULTI_MILLIONAIRE_CANARY_ALLOWLIST`

Local planning loads `.env.local` and `.env`. Do not commit either file.

## Forbidden Until Separate Approval

- Do not activate `PresaleVault`.
- Do not enable sales UX or route users to `BuyPresale`.
- Do not publish `SeasonClaimV2` roots.
- Do not use V2 or pre-V2 Jetton masters as current mainnet addresses.
- Do not deploy multi-millionaire mainnet app contracts from `contracts/apps/multi-millionaire/v3` until audit/review, testnet canary evidence, owner approval, and a mainnet canary runbook are recorded.

## Archive Notes

Older Capital/Reserve/AppRewardPool and V2 tokenomics commands, manifests, and docs remain historical evidence only. Use explicit legacy or V2 command names if you need to inspect them, and never treat them as `current`, `latest`, or default mainnet material.
