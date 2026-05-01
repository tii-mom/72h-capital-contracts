# 72H V2 Public Submission Status

Status: `FROZEN ARCHIVE - REPLACED BY V3`

Current submission status: `docs/72h-v3-public-submission-status.md`

Do not use V2 addresses for new public submissions. This file records the historical V2 submission attempt and Tonkeeper PR outcome only.

Status date: 2026-04-30

## Historical Outcome

- Mainnet deployment completed and verified.
- Public GitHub repository published: `https://github.com/tii-mom/72h-capital-contracts`.
- Wallet and exchange token information package prepared: `docs/72h-v2-wallet-exchange-token-info.md`.
- Historical V2 website implementation prepared in `/Users/yudeyou/Desktop/72hours`:
  - `public/contracts/72h-v2-mainnet.json`
  - `/contracts` page
  - `/token` redirect to `/contracts`
- Website build passed locally with `npm run build` on 2026-04-30.
- Historical V2 contract JSON was live: `https://72h.lol/contracts/72h-v2-mainnet.json` returned HTTP 200 on 2026-04-30. It must not be used as the current/default contract JSON after the V3 migration.
- Historical V2 contracts page was live: `https://72h.lol/contracts` returned HTTP 200 on 2026-04-30. The current/default page must now present V3.
- Tonkeeper asset PR submitted: `https://github.com/tonkeeper/ton-assets/pull/5095`; status checked 2026-04-30: PR is closed, not merged. Maintainer feedback: token needs more development before verification / return after future development.

## Website Production Status

The historical V2 contract information URL was live during the V2 submission attempt:

```text
https://72h.lol/contracts/72h-v2-mainnet.json
```

Verified on 2026-04-30:

```bash
curl -fsS https://72h.lol/contracts/72h-v2-mainnet.json
curl -fsS https://72h.lol/contracts
```

Current note: `/token` is intended as a convenience redirect to `/contracts`; local static build now emits `dist/token/index.html` with canonical `/contracts/`. Deploy that website build before using `/token` in public submissions.

## Wallets And Explorers

TON token verification is driven by the public token asset list. The first 72H Tonkeeper PR added Jetton metadata under `jettons/72H.yaml`, but it was closed unmerged with maintainer feedback that the token needs more development before verification. Treat wallet verification as a follow-up after public product/community/liquidity evidence improves; do not assume Tonkeeper verification is active.

Historical V2 facts from the closed wallet review:

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

## Historical Archive Package

Retain these files only as frozen V2 archive evidence:

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
