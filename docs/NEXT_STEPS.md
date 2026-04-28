# Next Steps

This is the project-owner checklist after the 72H V2 mainnet deployment.

## Public Verification

- Add the GitHub repository link to the official website.
- Add a public website route for contract information, backed by `/contracts/72h-v2-mainnet.json`.
- Confirm Tonviewer, Tonscan, Tonkeeper, OKX Wallet, and other major wallets display the token metadata correctly.
- Confirm wallets show no mint authority or mint-warning state.

## Wallet And Exchange Submission

- Use `docs/72h-v2-wallet-exchange-token-info.md` as the base submission package.
- Include the public GitHub repository and final deployment evidence.
- Include the final metadata and logo gateway URLs.
- Maintain one canonical contact path for exchange/wallet follow-up.

## Application Contracts

- Put future application contracts in this repository under app-specific folders.
- Recommended first folders:
  - `contracts/apps/multi-millionaire/`
  - `contracts/apps/price-game-72/`
- Keep application frontend/backend repositories focused on UI, APIs, indexers, and off-chain accounting.
- Let app repositories consume this contracts repository as the chain source of truth.

## Operational Controls

- Do not generate or sign new mainnet packages without a fresh review.
- Keep old TonConnect packages marked as void.
- Keep `.env.local` and all private deployment credentials out of git.
- Record every future mainnet operation as a timestamped evidence file.

## Near-Term Product Work

- Wire `multi-millionaire` reward accounting to the SeasonClaim leaf schema.
- Publish `/contracts/72h-v2-mainnet.json` on the official website.
- Add a user-facing `/contracts` or `/token` page.
- Prepare presale activation runbook before enabling `PresaleVault`.
- Prepare DEX pool address documentation after presale/liquidity setup.
