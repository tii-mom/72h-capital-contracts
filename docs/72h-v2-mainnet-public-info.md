# 72H V2 Mainnet Public Contract Information

Status: `FROZEN ARCHIVE - REPLACED BY V3`

Current public package: `docs/72h-v3-mainnet-public-info.md`

Do not use this V2 document for new wallet, website, exchange, DEX, explorer, or product integrations. It is retained only as historical deployment evidence.

This document is a frozen historical reference. Current users, wallets, exchanges, block explorers, and integration partners must use the V3 package.

## Token

- Name: `72H`
- Symbol: `72H`
- Network: TON mainnet
- Decimals: `9`
- Total supply: `100,000,000,000 72H`
- Raw total supply: `100000000000000000000`
- Mintable: `0`
- Admin: `null`
- Status: fixed supply, no mint authority

## Official Links

- Website: `https://72h.lol`
- Telegram: `https://t.me/the_72h`
- X: `https://x.com/72hour_s`
- Metadata URI: `ipfs://QmZkjBvKmHhsh56bPbbnwgPL8844eP5Btke6edbRGjPZNw`
- Metadata gateway: `https://gateway.pinata.cloud/ipfs/QmZkjBvKmHhsh56bPbbnwgPL8844eP5Btke6edbRGjPZNw`
- Logo URI: `ipfs://QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4`
- Logo gateway: `https://gateway.pinata.cloud/ipfs/QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4`

## Mainnet Contracts

| Contract | Address | Purpose |
| --- | --- | --- |
| V2 Jetton Master | `EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg` | Frozen archive only; replaced by V3 |
| SeasonVault | `EQCdSSWPVbwh9zIzhF5pnxwRKw-I8xc4bS1iyiVcbXKfnWe-` | 90B season reward inventory |
| SeasonClaim | `EQCYvg-_oFE8q8cweVScna-WDRzDYol-FBwHKuTcAjcFGonS` | Merkle claim contract for successful season rewards |
| FundVesting | `EQDO0AMsITst5rWGcabJ8OF7Ys079UMPGNOq9H8WtiJakID4` | Failed-round price-locked vesting |
| DevelopmentFund | `EQAPkdB1YJDEsVixATzfDjf--yl0frlKRkLPYHHUv6nVFkEU` | Development fund custody |
| PresaleVault | `EQCj56OaGFtIBgdtQjIacb7s1jlEy93vh-93PU07MDR1vpE9` | Presale inventory and sale logic |
| EcosystemTreasury | `EQARGC33uqypROhxiJMVOeKPYbYRgAEhXUkTxkrK7CrKDP3O` | Ecosystem application reward treasury |
| TeamVesting | `EQD5PnUEuEUYBt1XktTPlvN7HE5n-AIBI4XiAyd4qUgHasrK` | Team vesting custody |

## Allocation

| Recipient | Jetton Wallet | Amount |
| --- | --- | ---: |
| SeasonVault | `EQBgNjSr8gYxl1VUvncCuJ7I4Ikxw9PzVlgfxjsWYEr1ZbmG` | `90,000,000,000 72H` |
| PresaleVault | `EQDcJf-sGJvWS6dG24SUStX9UYg9ZQEvMxXTh4TJfZ7Ww-96` | `4,500,000,000 72H` |
| EcosystemTreasury | `EQAK26kYEphSirToa-wf-CDKwD5xXP2bagTxSf4MMqGghMjJ` | `4,500,000,000 72H` |
| DevelopmentFund | `EQDqGj5qZYujJmkq4Z1Rf4fJiE-mHc6KTuChcz09b_b_Br1l` | `500,000,000 72H` |
| TeamVesting | `EQD8cg3VXw54EQUVcB8nMAj-2z4aO4JgWwJgL-atxkF3nibe` | `300,000,000 72H` |
| Early users / operations | `EQCw3bw5SVmODE2Y5cSMDQHmX8VmP5P_TKSWdPWGO7dEatC1` | `200,000,000 72H` |

## Verification Evidence

- Mainnet deployment evidence: `deployments/72h-v2-mainnet.deployed-2026-04-28.md`
- Mainnet plan: `deployments/72h-v2-tokenomics.mainnet.plan.json`
- TonConnect package used for signing: `deployments/72h-v2-mainnet.tonconnect.json`
- Readiness summary: `docs/72h-v2-mainnet-readiness.md`
- Chinese readiness summary: `docs/72h-v2-mainnet-readiness.zh-CN.md`

Mainnet getter verification confirmed:

- `total_supply = 100000000000000000000`
- `mintable = 0`
- `admin = null`

This means the token has no remaining mint authority.
