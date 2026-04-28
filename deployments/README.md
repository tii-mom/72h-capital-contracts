# Deployments

This directory stores deployment plans, signing packages, and network evidence.

## Current Mainnet V2 Files

Use these as the source of truth for the deployed 72H V2 mainnet package:

- `72h-v2-mainnet.deployed-2026-04-28.md`: final deployment evidence and balances.
- `72h-v2-tokenomics.mainnet.plan.json`: refreshed mainnet tokenomics plan.
- `jetton-v2.mainnet.plan.json`: fixed-supply Jetton mainnet plan.
- `72h-v2-mainnet.tonconnect.json`: TonConnect package used for signing.
- `72h-v2-mainnet-deploy.html`: local signing UI used for the deployment.

The deployed Jetton master is:

- `EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg`

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

Never sign or regenerate a mainnet package from this directory without:

1. a fresh source review,
2. a fresh plan/code hash comparison,
3. owner approval,
4. explicit documentation of the new package and reason.
