# 72H V2 Mainnet Deployment Evidence

Status: deployed and verified on mainnet.

Verified at: `2026-04-28T05:22:59Z` (`2026-04-28 13:22:59 CST`)

Signing package:

- `deployments/72h-v2-mainnet.tonconnect.json`
- `deployments/72h-v2-mainnet-deploy.html`

Do not use legacy files:

- `deployments/legacy-mainnet.tonconnect.void-2026-04-28.json`
- `deployments/legacy-mainnet-deploy.void-2026-04-28.html`

## Core Contracts

All 8 core contracts are active on mainnet.

| Contract | Address | State |
| --- | --- | --- |
| V2 Jetton Master | `EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg` | active |
| SeasonVault | `EQCdSSWPVbwh9zIzhF5pnxwRKw-I8xc4bS1iyiVcbXKfnWe-` | active |
| SeasonClaim | `EQCYvg-_oFE8q8cweVScna-WDRzDYol-FBwHKuTcAjcFGonS` | active |
| FundVesting | `EQDO0AMsITst5rWGcabJ8OF7Ys079UMPGNOq9H8WtiJakID4` | active |
| DevelopmentFund | `EQAPkdB1YJDEsVixATzfDjf--yl0frlKRkLPYHHUv6nVFkEU` | active |
| PresaleVault | `EQCj56OaGFtIBgdtQjIacb7s1jlEy93vh-93PU07MDR1vpE9` | active |
| EcosystemTreasury | `EQARGC33uqypROhxiJMVOeKPYbYRgAEhXUkTxkrK7CrKDP3O` | active |
| TeamVesting | `EQD5PnUEuEUYBt1XktTPlvN7HE5n-AIBI4XiAyd4qUgHasrK` | active |

## Jetton Final State

Mainnet getter `get_jetton_data` verified:

- total supply: `100000000000000000000` raw (`100,000,000,000 72H`)
- mintable: `0`
- admin: `null`

This confirms the token was minted once and mint authority was dropped.

Admin Jetton wallet:

- owner wallet: `EQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQamv`
- Jetton wallet: `EQAgoErDhUiB40UbFYmlVvDxDx_lQo1AEEjVxyTzghbXXX83`
- final balance: `0`

## Allocation Balances

All planned allocation balances were verified on mainnet.

| Recipient | Owner / Contract | Jetton Wallet | Verified Raw Balance | Human Amount |
| --- | --- | --- | ---: | ---: |
| SeasonVault | `EQCdSSWPVbwh9zIzhF5pnxwRKw-I8xc4bS1iyiVcbXKfnWe-` | `EQBgNjSr8gYxl1VUvncCuJ7I4Ikxw9PzVlgfxjsWYEr1ZbmG` | `90000000000000000000` | `90,000,000,000 72H` |
| PresaleVault | `EQCj56OaGFtIBgdtQjIacb7s1jlEy93vh-93PU07MDR1vpE9` | `EQDcJf-sGJvWS6dG24SUStX9UYg9ZQEvMxXTh4TJfZ7Ww-96` | `4500000000000000000` | `4,500,000,000 72H` |
| EcosystemTreasury | `EQARGC33uqypROhxiJMVOeKPYbYRgAEhXUkTxkrK7CrKDP3O` | `EQAK26kYEphSirToa-wf-CDKwD5xXP2bagTxSf4MMqGghMjJ` | `4500000000000000000` | `4,500,000,000 72H` |
| DevelopmentFund | `EQAPkdB1YJDEsVixATzfDjf--yl0frlKRkLPYHHUv6nVFkEU` | `EQDqGj5qZYujJmkq4Z1Rf4fJiE-mHc6KTuChcz09b_b_Br1l` | `500000000000000000` | `500,000,000 72H` |
| TeamVesting | `EQD5PnUEuEUYBt1XktTPlvN7HE5n-AIBI4XiAyd4qUgHasrK` | `EQD8cg3VXw54EQUVcB8nMAj-2z4aO4JgWwJgL-atxkF3nibe` | `300000000000000000` | `300,000,000 72H` |
| Early users / operations | `EQDqA19b4tBQKi7Z_0NS08eWzq-FZ-wsRU4QfzEEKwcouZUQ` | `EQCw3bw5SVmODE2Y5cSMDQHmX8VmP5P_TKSWdPWGO7dEatC1` | `200000000000000000` | `200,000,000 72H` |

Zero-initial tokenomics wallets:

- SeasonClaim Jetton wallet `EQDG-7nBFsEG6qcVkDD2Kx5zByqvVK3m5xyAy_8qVBEx2IQe` is uninitialized, expected balance `0`.
- FundVesting Jetton wallet `EQB6A_MVCuqupDYxfKX9x_F-PE74Iq-AvnrMzGjiK3HR6LF3` is uninitialized, expected balance `0`.

## Signed Batches

All batches in `deployments/72h-v2-mainnet-deploy.html` were signed and verified:

1. Deploy V2 Jetton master
2. Mint fixed total supply to admin Jetton wallet
3. Drop V2 Jetton admin
4. Deploy tokenomics contracts A
5. Deploy tokenomics contracts B
6. Set contract Jetton wallets A
7. Set contract Jetton wallets B
8. Set tokenomics post-deploy routes
9. Allocate V2 supply A
10. Allocate V2 supply B

Representative verified transaction hashes:

- SeasonVault set wallet: `jC5wQRG5vTouFMFvWO/n0Tbalea23riPUh5POzwVcik=`
- PresaleVault set wallet: `mJGR4kNNQoimcUgPVg6zu0cAM73wQoDPhflf4k9lO40=`
- SeasonVault route set: `GXZ0F/GQdratyCNyzhDVWFv/+wAFrl68cqo3bQGfhpg=`
- Final allocation transfers from admin Jetton wallet:
  - `aRTrF0vjE0qOMX/eGK990/adZETq+qglF6ZXPpPZiZM=`
  - `ksJzzi4qIS3L+AdeAk6i0rbjzG+ik8thXqpJ9LaywiY=`
  - `nZ5QswJMQOSeDQWprXpNSyHeASefZn7NKhIT2LxVu5s=`

## Final Conclusion

The V2 fixed-supply Jetton and the 7 V2 tokenomics contracts are deployed on mainnet. Supply, admin removal, contract activation, route setup transactions, and final allocation balances have been verified against `deployments/72h-v2-tokenomics.mainnet.plan.json`.
