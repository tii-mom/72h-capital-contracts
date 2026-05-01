# 72H V3 Wallet and Exchange Token Information

Use this package for wallet, DEX, CEX, block explorer, and listing submissions.

## Basic Token Information

- Token name: `72H`
- Token symbol: `72H`
- Chain: TON
- Network: Mainnet
- Standard: Jetton
- Decimals: `9`
- Total supply: `100,000,000,000 72H`
- Raw total supply: `100000000000000000000`
- Jetton master: `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3`
- Mint authority: removed
- Admin address on Jetton master: `null`
- Mintable flag: `0`

## Official Project Information

- Website: `https://72h.lol`
- Telegram: `https://t.me/the_72h`
- X: `https://x.com/72hour_s`
- Token metadata URI: `ipfs://QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC`
- Token metadata gateway: `https://gateway.pinata.cloud/ipfs/QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC`
- Logo URI: `ipfs://QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4`
- Logo gateway: `https://gateway.pinata.cloud/ipfs/QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4`

## Description

72H is a TON ecosystem token with a fixed 100B supply. The V3 deployment uses a no-mint-authority Jetton master and separate tokenomics contracts for season rewards, presale, ecosystem rewards, development funding, and team vesting. V3 fixes the V2 allocation notification issue by using non-zero Jetton transfer `forward_ton_amount` for allocation transfers.

## Mainnet Tokenomics Contracts

| Contract | Address |
| --- | --- |
| SeasonVault | `EQCkI1atYYWN-2cnJJASJ1nKsu0ZbvCd_EVZQ61KcoIW-13l` |
| SeasonClaimV2 | `EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b` |
| FundVesting | `EQBKuIRplvhYzL9Gbm6GpZqCxMTHApVOZMVs9T1HzXcP7inb` |
| DevelopmentFund | `EQBbRZQj_VJU2r-DAtQcHoDngRC9EBvUHFg4LoB5HXLBv1Yh` |
| PresaleVault | `EQDHSwsiQtB3sdoAaOdJi4kCu32GIHM4BtXd-_EtpE96EYXy` |
| EcosystemTreasury | `EQCy7YpjZJuQAwjCQvQK55dv4p89c5pJUR9vi8nAwoW4a_w7` |
| TeamVesting | `EQC3pNoWZHNmbcazxJV7lzcQH05Zewjl5w1KJhA4OfIPM6cy` |

## Supply Allocation

| Recipient | Amount |
| --- | ---: |
| SeasonVault | `90,000,000,000 72H` |
| SeasonClaimV2 | `0 72H` |
| FundVesting | `0 72H` |
| PresaleVault | `4,500,000,000 72H` |
| EcosystemTreasury | `4,500,000,000 72H` |
| DevelopmentFund | `500,000,000 72H` |
| TeamVesting | `300,000,000 72H` |
| Early users / operations | `200,000,000 72H` |

## Jetton Wallet Balances

| Recipient | Jetton Wallet | Raw balance |
| --- | --- | ---: |
| SeasonVault | `EQClq_b3CeBTPUtjsQWgaIg4dfrjIP2GyTPcYkIMf352BSbt` | `90000000000000000000` |
| SeasonClaimV2 | `EQC3AK8tmvIezR6gd_cdmg4qmrFJOloUhpoWE8HpsSKhjPxY` | `0` |
| FundVesting | `EQBHI_ujpZQVNDj8CVaKMQ6QR2tMVugXaSL46rxgQT7XxnpW` | `0` |
| DevelopmentFund | `EQAmfNJcT0-DZlc1pLWURIJrQKR2xRJQaBjadpSB9wVcYx8T` | `500000000000000000` |
| PresaleVault | `EQBeIBmsLzSkfVwcGl4Donf3Hca2nfta__S3x2n1TMO1g9Vx` | `4500000000000000000` |
| EcosystemTreasury | `EQC6l1XfmSrj50sOWHf5S7xiO_O4_0Xd4v2je2Pr7BLcWnBF` | `4500000000000000000` |
| TeamVesting | `EQABKzYV7XtCAi9RcKGWRL8OAHWEr0lYvNXW_h-W9kJ7sO9X` | `300000000000000000` |
| Early users / operations | `EQD-9WsEEJFTo9yMw2cLOkbN_tnFQuizMRMZzeWOv2E2Zq01` | `200000000000000000` |

## Security and Deployment Evidence

- V3 mainnet public contract information: `docs/72h-v3-mainnet-public-info.md`
- V3 mainnet plan: `deployments/v3-mainnet/72h-v3-tokenomics.mainnet.plan.json`
- V3 post-deploy getter evidence: `deployments/v3-mainnet/72h-v3-mainnet.postdeploy.latest.json`
- Public website JSON source: `integrations/website/72h-v3-mainnet.json`
- Public submission status: `docs/72h-v3-public-submission-status.md`

## Wallet Display Checklist

Wallets should display 72H as a fixed-supply Jetton:

- Jetton master is active.
- `get_jetton_data.total_supply = 100000000000000000000`.
- `get_jetton_data.mintable = 0`.
- `get_jetton_data.admin = null`.
- Metadata points to the final V3 IPFS JSON.
- Logo points to the final IPFS image.
