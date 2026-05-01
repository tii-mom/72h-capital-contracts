# 72H V3 Public Submission Status

Status date: 2026-05-01

## Completed

- V3 mainnet deployment completed.
- V3 post-deploy getter verification passed with `npm run verify:v3-mainnet-postdeploy`.
- V3 mainnet launch gate package verification passed with `npm run verify:mainnet-launch-gates`.
- Current public package prepared:
  - `docs/72h-v3-wallet-exchange-token-info.md`
  - `docs/72h-v3-mainnet-public-info.md`
  - `deployments/v3-mainnet/72h-v3-mainnet.postdeploy.latest.json`
  - `integrations/website/72h-v3-mainnet.json`

## Current Public Facts

- Jetton master: `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3`
- Total supply: `100000000000000000000`
- Decimals: `9`
- Mintable: `0`
- Admin: `null`
- Metadata URI: `ipfs://QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC`
- Logo URI: `ipfs://QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4`

## V2 Freeze

V2 public package files are historical archive only. Do not submit V2 addresses to wallets, explorers, exchanges, DEXes, websites, or product integrations.

Frozen V2 files:

- `docs/72h-v2-mainnet-public-info.md`
- `docs/72h-v2-wallet-exchange-token-info.md`
- `docs/72h-v2-public-submission-status.md`
- `integrations/website/72h-v2-mainnet.json`
- `deployments/72h-v2-mainnet.tonconnect.json`
- `deployments/72h-v2-mainnet-deploy.html`

## Website Production Follow-Up

The website should publish the V3 JSON package and stop presenting V2 as the current contract package:

```text
/contracts/72h-v3-mainnet.json
```

Keep any V2 route only as an explicitly labeled historical archive if the product requires it.

## Wallets, Explorers, DEX, And CEX Follow-Up

- Wallet/explorer verification should use the V3 Jetton master only.
- DEX visibility depends on intentional pool creation, liquidity, metadata ingestion, and platform-specific verification.
- CEX applications should use the V3 fixed-supply, no-mint-authority package and include the GitHub repository plus V3 mainnet evidence.
