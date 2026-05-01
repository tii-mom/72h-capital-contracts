# Security Policy

## Mainnet Status

72H V3 is the current deployed 72H token on TON mainnet with fixed supply:

- Jetton master: `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3`
- Total supply: `100000000000000000000` raw
- Mintable: `0`
- Admin: `null`
- Metadata URI: `ipfs://QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC`

Deployment evidence is recorded in `deployments/v3-mainnet/72h-v3-mainnet.postdeploy.latest.json`.
V2 evidence remains frozen archive only and must not be used as current mainnet configuration.

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
- V3 tokenomics contracts in `contracts/deployed/v3-core/*.tact`
- deployment scripts and TonConnect generation scripts
- public deployment evidence and address derivation logic

Out of scope unless explicitly deployed in a future package:

- archived contracts in `contracts/archive/`
- supporting Capital/Reserve/AppRewardPool package files in `contracts/supporting/`
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
