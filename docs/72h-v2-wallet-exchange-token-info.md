# 72H V2 Wallet and Exchange Token Information

Status: `FROZEN ARCHIVE - REPLACED BY V3`

Current wallet/exchange package: `docs/72h-v3-wallet-exchange-token-info.md`

Do not submit or integrate the V2 Jetton master as the current 72H token. This file is retained only as historical deployment evidence.

Use the V3 package for wallet, DEX, CEX, block explorer, and listing submissions. This V2 package is frozen archive only.

## Basic Token Information

- Token name: `72H`
- Token symbol: `72H`
- Chain: TON
- Network: Mainnet
- Standard: Jetton
- Decimals: `9`
- Total supply: `100,000,000,000 72H`
- Raw total supply: `100000000000000000000`
- Jetton master: `EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg`
- Mint authority: removed
- Admin address on Jetton master: `null`
- Mintable flag: `0`

## Official Project Information

- Website: `https://72h.lol`
- Telegram: `https://t.me/the_72h`
- X: `https://x.com/72hour_s`
- Token metadata URI: `ipfs://QmZkjBvKmHhsh56bPbbnwgPL8844eP5Btke6edbRGjPZNw`
- Token metadata gateway: `https://gateway.pinata.cloud/ipfs/QmZkjBvKmHhsh56bPbbnwgPL8844eP5Btke6edbRGjPZNw`
- Logo URI: `ipfs://QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4`
- Logo gateway: `https://gateway.pinata.cloud/ipfs/QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4`

## Description

72H is a TON ecosystem token with a fixed 100B supply. The V2 deployment uses a no-mint-authority Jetton master and separate audited tokenomics contracts for season rewards, presale, ecosystem rewards, development funding, and team vesting.

## Mainnet Tokenomics Contracts

| Contract | Address |
| --- | --- |
| SeasonVault | `EQCdSSWPVbwh9zIzhF5pnxwRKw-I8xc4bS1iyiVcbXKfnWe-` |
| SeasonClaim | `EQCYvg-_oFE8q8cweVScna-WDRzDYol-FBwHKuTcAjcFGonS` |
| FundVesting | `EQDO0AMsITst5rWGcabJ8OF7Ys079UMPGNOq9H8WtiJakID4` |
| DevelopmentFund | `EQAPkdB1YJDEsVixATzfDjf--yl0frlKRkLPYHHUv6nVFkEU` |
| PresaleVault | `EQCj56OaGFtIBgdtQjIacb7s1jlEy93vh-93PU07MDR1vpE9` |
| EcosystemTreasury | `EQARGC33uqypROhxiJMVOeKPYbYRgAEhXUkTxkrK7CrKDP3O` |
| TeamVesting | `EQD5PnUEuEUYBt1XktTPlvN7HE5n-AIBI4XiAyd4qUgHasrK` |

## Supply Allocation

| Recipient | Amount |
| --- | ---: |
| SeasonVault | `90,000,000,000 72H` |
| PresaleVault | `4,500,000,000 72H` |
| EcosystemTreasury | `4,500,000,000 72H` |
| DevelopmentFund | `500,000,000 72H` |
| TeamVesting | `300,000,000 72H` |
| Early users / operations | `200,000,000 72H` |

## Security and Deployment Evidence

- Mainnet deployment evidence: `deployments/72h-v2-mainnet.deployed-2026-04-28.md`
- Mainnet public contract information: `docs/72h-v2-mainnet-public-info.md`
- Mainnet readiness summary: `docs/72h-v2-mainnet-readiness.md`
- Public website JSON source: `integrations/website/72h-v2-mainnet.json`
- Public submission status: `docs/72h-v2-public-submission-status.md`
- Misti static-analysis artifact: `audit-artifacts/misti-all-detectors-post-souffle-2026-04-28.json/warnings.json`

## Historical Submission Status

- Tonkeeper asset PR: `https://github.com/tonkeeper/ton-assets/pull/5095`
- Official website V2 route: frozen archive only after the V3 migration.
- OKX listing application: do not submit this V2 package as current.
- STON.fi verification: do not submit this V2 package as current.
- DEX/CEX submissions: use `docs/72h-v3-wallet-exchange-token-info.md` instead.

## Wallet Display Checklist

Wallets should display 72H as a fixed-supply Jetton:

- Jetton master is active.
- `get_jetton_data.total_supply = 100000000000000000000`.
- `get_jetton_data.mintable = 0`.
- `get_jetton_data.admin = null`.
- Metadata points to the final IPFS JSON.
- Logo points to the final IPFS image.
