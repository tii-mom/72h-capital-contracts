# Official Website Integration

This folder contains public contract data that the official website should serve under:

```text
https://72h.lol/contracts/72h-v3-mainnet.json
```

The old `/contracts/72h-v2-mainnet.json` route may remain only as a clearly labeled frozen archive.

The V3 JSON may be used for public token facts and read-only contract display. It must not be treated as approval to activate presale, publish SeasonClaimV2 roots, or represent app-specific `multi-millionaire/v3` contracts as deployed.

The current website implementation lives in `/Users/yudeyou/Desktop/72hours` and includes:

- `public/contracts/72h-v3-mainnet.json`
- `public/contracts/72h-v2-mainnet.json` only if it is clearly labeled as frozen archive
- `/contracts` page
- `/token` redirect to `/contracts`

Production deployment is blocked until the Cloudflare Pages deployment account is authenticated through Wrangler or the site branch is merged into the branch Cloudflare deploys.

Expected deploy command after Cloudflare authentication:

```bash
cd /Users/yudeyou/Desktop/72hours
npm run build
npx wrangler pages deploy dist --project-name 72hours
```
