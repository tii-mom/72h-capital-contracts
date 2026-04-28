# Security Policy

## Mainnet Status

72H V2 is deployed on TON mainnet with fixed supply:

- Jetton master: `EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg`
- Total supply: `100000000000000000000` raw
- Mintable: `0`
- Admin: `null`

Deployment evidence is recorded in `deployments/72h-v2-mainnet.deployed-2026-04-28.md`.

## Reporting Issues

For security reports, include:

- affected contract or script,
- exploit preconditions,
- transaction/message sequence,
- expected impact,
- proof of concept if available.

Do not disclose an active exploit publicly before the project has had time to triage it.

## Scope

In scope:

- `contracts/jetton-v2/*.fc`
- V2 tokenomics contracts in `contracts/*.tact`
- deployment scripts and TonConnect generation scripts
- public deployment evidence and address derivation logic

Out of scope unless explicitly deployed in a future package:

- legacy Capital/Reserve/AppRewardPool package files marked as void
- local-only generated artifacts in ignored `build/` or `dist/`
- testnet-only secrets and `.env.local`

## Secret Handling

Never commit:

- `.env.local`
- wallet mnemonics
- private keys
- RPC API keys
- exchange or deployment credentials

The repository `.gitignore` is configured to exclude these files.
