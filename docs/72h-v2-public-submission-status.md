# 72H V2 Public Submission Status

Status date: 2026-04-28

## Completed

- Mainnet deployment completed and verified.
- Public GitHub repository published: `https://github.com/tii-mom/72h-capital-contracts`.
- Wallet and exchange token information package prepared: `docs/72h-v2-wallet-exchange-token-info.md`.
- Official website implementation prepared in `/Users/yudeyou/Desktop/72hours`:
  - `public/contracts/72h-v2-mainnet.json`
  - `/contracts` page
  - `/token` redirect to `/contracts`
- Website build passed locally with `npm run build`.
- Tonkeeper asset PR submitted: `https://github.com/tonkeeper/ton-assets/pull/5095`.

## Blocked Until Website Production Deploy

The production URL is not live yet:

```text
https://72h.lol/contracts/72h-v2-mainnet.json
```

Current check returns `404`. The local build contains the file, but Cloudflare Wrangler is not authenticated in this workspace, so direct production deployment cannot be completed by Codex right now.

After Cloudflare authentication, deploy the website with:

```bash
cd /Users/yudeyou/Desktop/72hours
npm run build
npx wrangler pages deploy dist --project-name 72hours
```

Then verify:

```bash
curl -fsS https://72h.lol/contracts/72h-v2-mainnet.json
curl -fsS https://72h.lol/contracts
```

## Wallets And Explorers

TON token verification is driven by the public token asset list. The 72H Tonkeeper PR adds the Jetton metadata under `jettons/72H.yaml`; after maintainers merge it, wallets and explorers that consume the asset list should be able to display the token as verified.

Important public facts for wallet review:

- Jetton master: `EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg`
- Total supply: `100000000000000000000`
- Decimals: `9`
- Mintable: `0`
- Admin: `null`
- Metadata URI: `ipfs://QmZkjBvKmHhsh56bPbbnwgPL8844eP5Btke6edbRGjPZNw`
- Logo URI: `ipfs://QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4`

## OKX, DEX, And CEX Follow-Up

OKX listing requires its official listing application and account flow. The data package is ready, but Codex cannot submit it without the project owner's exchange/login identity.

DEX follow-up should happen after liquidity is intentionally created:

- STON.fi verification requires a PR with correct contract data and logo.
- DeDust/other DEX visibility depends on pool creation, liquidity, metadata ingestion, and any platform-specific verification.
- CEX applications should use the same fixed-supply, no-mint-authority package and include the GitHub repository plus mainnet evidence.

## Submission Package

Use these files as the single source package:

- `docs/72h-v2-wallet-exchange-token-info.md`
- `docs/72h-v2-mainnet-public-info.md`
- `deployments/72h-v2-mainnet.deployed-2026-04-28.md`
- `integrations/website/72h-v2-mainnet.json`

## External References

- Cloudflare Pages direct upload: `https://developers.cloudflare.com/pages/get-started/direct-upload/`
- Wrangler Pages deploy command: `https://developers.cloudflare.com/workers/wrangler/commands/pages/`
- TON token verification flow: `https://docs.ton.org/standard/tokens/overview`
- TON Jetton metadata fields: `https://docs.ton.org/standard/tokens/metadata`
- Tonkeeper asset list: `https://github.com/tonkeeper/ton-assets`
- STON.fi token verification note: `https://stonfi.zendesk.com/hc/en-us/articles/20935577704732-How-can-I-verify-my-token-on-STON-fi`
- OKX token listing application: `https://www.okx.com/en-us/token-listing-apply`
