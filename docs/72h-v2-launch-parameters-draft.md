# 72H V2 Launch Parameters Draft

Status: `FROZEN ARCHIVE - REPLACED BY V3`

Current mainnet facts: `docs/72H_MAINNET_FACTS.md`

Do not use this V2 launch parameter document for current public integrations or signing decisions.

Status: V2 parameters updated and deployed on mainnet after owner Tonkeeper approval. The five-stage reward unlock schedule, 60-day user claim window, `SeasonClaim` pending/sweep safety fix, JettonTransfer bounce sender/amount authentication, `ReserveVault`/`AppRewardPool` success-finalize sender authentication, and the SeasonVault failed-round FundVesting confirmation path were included in the audited package. Mainnet deployment evidence is recorded in `deployments/72h-v2-mainnet.deployed-2026-04-28.md`.

## Confirmed Wallets

### Admin

- Non-bounceable: `UQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQfRq`
- Bounceable: `EQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQamv`
- Raw: `0:b1274e7279ac155a5b0de527c9fa86da8e08769457df47e3bb79b1ffb3fc2a41`

### Development Fund

- Non-bounceable: `UQB31HYfGtzDDa-cudZolA6g1gNcoxZsxeQoEM4lmhhuo5Bu`
- Bounceable: `EQB31HYfGtzDDa-cudZolA6g1gNcoxZsxeQoEM4lmhhuo82r`
- Raw: `0:77d4761f1adcc30daf9cb9d668940ea0d6035ca3166cc5e42810ce259a186ea3`

### Team

- Non-bounceable: `UQDqA19b4tBQKi7Z_0NS08eWzq-FZ-wsRU4QfzEEKwcoucjV`
- Bounceable: `EQDqA19b4tBQKi7Z_0NS08eWzq-FZ-wsRU4QfzEEKwcouZUQ`
- Raw: `0:ea035f5be2d0502a2ed9ff4352d3c796ceaf8567ec2c454e107f31042b0728b9`

### Presale Proceeds

- Non-bounceable: `UQBGY56JY9gy1V-vnnyOpGoJXLWAcm3LKNAdl9OKShuCe7QA`
- Bounceable: `EQBGY56JY9gy1V-vnnyOpGoJXLWAcm3LKNAdl9OKShuCe-nF`
- Raw: `0:46639e8963d832d55faf9e7c8ea46a095cb580726dcb28d01d97d38a4a1b827b`

### Early Users / Operations

- Non-bounceable: `UQDqA19b4tBQKi7Z_0NS08eWzq-FZ-wsRU4QfzEEKwcoucjV`
- Same as team wallet for initial manual distribution.

## Project Metadata Found In Website Repo

- Website: `https://72h.lol`
- Telegram: `https://t.me/the_72h`
- X: `https://x.com/72hour_s`
- Logo source path: `/Users/yudeyou/Desktop/72hours/public/brand/72hours-logo.png`
- Logo public URL candidate: `https://72h.lol/brand/72hours-logo.png`
- PWA icon URL: `https://72h.lol/pwa-512.png`
- TonConnect manifest: `https://72h.lol/tonconnect-manifest.json`
- Logo IPFS URI: `ipfs://QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4`
- Final metadata URI: `ipfs://QmZkjBvKmHhsh56bPbbnwgPL8844eP5Btke6edbRGjPZNw`

The V2 Jetton deployment plan must use the final immutable metadata URI above.

## Locked Supply Allocation

Total supply is fixed at `100,000,000,000 72H`.

- `90,000,000,000 72H`: `SeasonVault`
- `4,500,000,000 72H`: `PresaleVault`
- `4,500,000,000 72H`: `EcosystemTreasury`
- `500,000,000 72H`: `DevelopmentFund`
- `300,000,000 72H`: `TeamVesting`
- `200,000,000 72H`: early users / operations wallet

The V2 Jetton master remains standard and fixed-supply. These allocations are handled by separate recipient contracts or the explicitly listed operations wallet.

## Presale Parameters

Presale is TON-only in V1. Buyers pay the TON purchase amount and the transaction gas. Presale start and close are controlled by the admin wallet; there is no fixed wall-clock start or end time in the initial deployment parameters.

### Stage Prices

- Stage 1: `1 TON = 10,072 72H`
- Stage 2: `1 TON = 7,200 72H`
- Stage 3: `1 TON = 3,500 72H`

Each stage sells `1,500,000,000 72H`.

If all stages sell out:

- Stage 1 raises about `148,927.720 TON`
- Stage 2 raises about `208,333.333 TON`
- Stage 3 raises about `428,571.429 TON`
- Total raises about `785,832.482 TON`

### Wallet Cap

Confirmed cumulative cap per wallet:

- `7,200,000 72H`

This means one wallet can spend:

- Stage 1 full cap: about `714.853 TON`
- Stage 2 full cap: `1,000 TON`
- Stage 3 full cap: about `2,057.143 TON`

Note: this is a high fundraising target. Keep it only if the community and liquidity plan can support it.

### Unsold Tokens

Any unsold presale `72H` is swept to the unlocked `DevelopmentFund` contract after presale closes.

It does not go to the admin wallet or team wallet. It is not price-locked.

Only failed-round allocations from the 90B SeasonVault go to price-locked `FundVesting`.

## 90B Season Reward Unlock Parameters

Successful 4-hour season rounds accrue inside `SeasonVault`; after all 18 rounds in a season are recorded, owner finalizes the successful season total to `SeasonClaim`. Failed rounds transfer inventory to `FundVesting`; the round stays pending until `FundVesting` confirms the real Jetton transfer was received.

Successful rewards are not airdropped. Users claim with a Merkle proof and pay their own gas. `multi-millionaire` is the source app for personal deposit, team deposit, referral, and leaderboard accounting; `/Users/yudeyou/Desktop/72` is display/navigation only.

`SeasonClaim` and failed-round `FundVesting` use the same cumulative price unlock schedule:

- Stage 1: price `>= $0.01`, held for 72 hours, cumulative unlock `20%`
- Stage 2: price `>= $0.03`, held for 72 hours, cumulative unlock `40%`
- Stage 3: price `>= $0.05`, held for 72 hours, cumulative unlock `60%`
- Stage 4: price `>= $0.07`, held for 72 hours, cumulative unlock `80%`
- Stage 5: price `>= $0.10`, held for 72 hours, cumulative unlock `100%`

`SeasonClaim` claim window is 60 days. Expired claim rounds can be swept only after the 60-day window plus a 72-hour bounce grace period, and only after pending claim transfers for that round have been bounced or owner-settled after grace.

## Testnet Rehearsal Baseline

- Testnet deployment wallet is loaded from the contracts repository `.env.local`.
- Current testnet V2 Jetton manifest: `deployments/jetton-v2.testnet.latest.json`
- Current testnet V2 tokenomics evidence: `deployments/72h-v2-tokenomics.testnet.latest.json`
- Current testnet V2 Jetton master: `kQDJqdAP9DR5NGV7EDg6T78EuNqmuKsbpEhQJSrFxTm8rjtK`
- Minter code hash: `779489f7cadb181403156694116baa342c0fe32c0cf5ce3b84a1ef4e652ed5e9`
- Wallet code hash: `ba2918c8947e9b25af9ac1b883357754173e5812f807a3d6e642a14709595395`
- Current testnet V2 tokenomics evidence completed at: `2026-04-28T04:01:28.080Z`
- Current testnet SeasonClaim code hash: `8ae1ab7f8b4d1631e3999ffaa9d452ae6a58f262bc3cb8fb2c8c56d01b3c526e`
- Current testnet FundVesting code hash: `46384d8a81b5c3f95ec46085d87cb32c727fefaf0528aa054c2b9bf907525eb8`

Current regenerated mainnet tokenomics code hashes:

- SeasonVault: `7c7de509936c3eb2bdff7eb2b9a20fdc529c68f55c21da4f69b6614c68b8d0a1`
- SeasonClaim: `8ae1ab7f8b4d1631e3999ffaa9d452ae6a58f262bc3cb8fb2c8c56d01b3c526e`
- FundVesting: `46384d8a81b5c3f95ec46085d87cb32c727fefaf0528aa054c2b9bf907525eb8`
- DevelopmentFund: `12147e52cbb3267f61f67016c2711a767e0e2f30d8dc8ea084a3a889ca67926b`
- PresaleVault: `d0458deb2bc69870977e003c5da36c2e806cce29422e6720afaa497b0ec3a63b`
- EcosystemTreasury: `151c7ff421e39eb71216a81bb21402da81a4a5ca87a1641a0c20d85537a8228b`
- TeamVesting: `22bb04a706182d7d73770f0e35c6000f8eb6264c0fbe02489706a5dd09c64793`

Current post-redesign testnet evidence:

- SeasonVault: `kQDO6EIylsZff48kCNji0mdjrpeFlDQz681quAyFyns-Bd44`
- SeasonClaim: `kQBd5rP4rtz9jByQG3hntvdqT__zzLyHAiMvSGNiST3T5SeF`
- FundVesting: `kQDE3XDJ9qyyhFhH3nMBKYNJqlUb6J0PUP24f0r5JqVGUZjs`
- PresaleVault: `kQAomKOiWMwaURt-A-DPGWj9TI2UNL1GHnD998HmmJsQpJFC`
- Tokenomics actions sent: `57`
- Final post-burn supply: `99999999999000000000`
- Mainnet plan, testnet plan, and testnet evidence code hashes and allocation raw values match.
- Refreshed mainnet TonConnect package: `deployments/72h-v2-mainnet.tonconnect.json`, generated at `2026-04-28T04:02:13.986Z`.

## Mainnet Deployment Status

- Mainnet deployment completed through `deployments/72h-v2-mainnet-deploy.html`.
- Deployment evidence: `deployments/72h-v2-mainnet.deployed-2026-04-28.md`.
- Final V2 Jetton state: total supply `100000000000000000000` raw, `mintable=0`, `admin=null`.
- All 8 core contracts are active and allocation balances match the refreshed mainnet plan.
- Official DEX pool address after presale.
