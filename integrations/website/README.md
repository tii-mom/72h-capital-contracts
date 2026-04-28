# Official Website Integration

This folder contains public contract data that the official website should serve under:

```text
https://72h.lol/contracts/72h-v2-mainnet.json
```

The current website implementation lives in `/Users/yudeyou/Desktop/72hours` and includes:

- `public/contracts/72h-v2-mainnet.json`
- `/contracts` page
- `/token` redirect to `/contracts`

Production deployment is blocked until the Cloudflare Pages deployment account is authenticated through Wrangler or the site branch is merged into the branch Cloudflare deploys.

Expected deploy command after Cloudflare authentication:

```bash
cd /Users/yudeyou/Desktop/72hours
npm run build
npx wrangler pages deploy dist --project-name 72hours
```

