# Deployments

This directory stores deployment plans, signing-package archives, and network evidence.

## Current Mainnet V3 Files

Use these as the source of truth for the deployed 72H V3 mainnet package:

- `v3-mainnet/72h-v3-mainnet.postdeploy.latest.json`: current post-deploy getter evidence and balances.
- `v3-mainnet/72h-v3-tokenomics.mainnet.plan.json`: current V3 tokenomics plan.
- `v3-mainnet/72h-v3-mainnet.tonconnect.json`: executed V3 TonConnect package archive. Do not reuse it as a new signing input.
- `v3-mainnet/72h-v3-mainnet-deploy.html`: executed V3 local signing UI archive. Do not reuse it as a new signing input.

The deployed Jetton master is:

- `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3`

## Frozen Mainnet V2 Files

These are historical archive only and must not be used for new signing or public integrations:

- `72h-v2-mainnet.deployed-2026-04-28.md`
- `72h-v2-tokenomics.mainnet.plan.json`
- `jetton-v2.mainnet.plan.json`
- `72h-v2-mainnet.tonconnect.json`
- `72h-v2-mainnet-deploy.html`

## Fresh Testnet Evidence

Use these for the final V2 rehearsal baseline:

- `jetton-v2.testnet.latest.json`
- `72h-v2-tokenomics.testnet.latest.json`
- `jetton-v2.testnet.2026-04-28T03-39-57-258Z.json`
- `72h-v2-tokenomics.testnet.2026-04-28T04-01-28-080Z.json`

Older timestamped files are retained as historical evidence.

## Legacy Files

These files are intentionally marked as void for the V2 tokenomics launch and must not be used for new signing:

- `legacy-mainnet.tonconnect.void-2026-04-28.json`
- `legacy-mainnet-deploy.void-2026-04-28.html`

## Operational Rule

Never sign, reuse, or regenerate a mainnet package from this directory without:

1. a fresh source review,
2. a fresh plan/code hash comparison,
3. owner approval,
4. explicit documentation of the new package and reason.

Current public integrations should consume facts from `../docs/72H_MAINNET_FACTS.md` and `../integrations/website/72h-v3-mainnet.json`, not from archived signing payloads.
