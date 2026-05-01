# 72H V3 Mainnet Public Contract Information

Status date: 2026-05-01

This is the current public reference for users, wallets, exchanges, block explorers, and integration partners. V3 is a new mainnet asset line and replaces the V2 public package.

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
- Metadata URI: `ipfs://QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC`
- Metadata gateway: `https://gateway.pinata.cloud/ipfs/QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC`
- Logo URI: `ipfs://QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4`
- Logo gateway: `https://gateway.pinata.cloud/ipfs/QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4`

## Mainnet Contracts

| Contract | Address | Purpose |
| --- | --- | --- |
| V3 Jetton Master | `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3` | Official 72H Jetton master |
| SeasonVault | `EQCkI1atYYWN-2cnJJASJ1nKsu0ZbvCd_EVZQ61KcoIW-13l` | 90B season reward inventory |
| SeasonClaimV2 | `EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b` | Merkle claim contract for finalized season rewards |
| FundVesting | `EQBKuIRplvhYzL9Gbm6GpZqCxMTHApVOZMVs9T1HzXcP7inb` | Failed-round price-locked vesting |
| DevelopmentFund | `EQBbRZQj_VJU2r-DAtQcHoDngRC9EBvUHFg4LoB5HXLBv1Yh` | Development fund custody |
| PresaleVault | `EQDHSwsiQtB3sdoAaOdJi4kCu32GIHM4BtXd-_EtpE96EYXy` | Presale inventory and sale logic |
| EcosystemTreasury | `EQCy7YpjZJuQAwjCQvQK55dv4p89c5pJUR9vi8nAwoW4a_w7` | Ecosystem application reward treasury |
| TeamVesting | `EQC3pNoWZHNmbcazxJV7lzcQH05Zewjl5w1KJhA4OfIPM6cy` | Team vesting custody |

## Allocation

| Recipient | Jetton Wallet | Amount |
| --- | --- | ---: |
| SeasonVault | `EQClq_b3CeBTPUtjsQWgaIg4dfrjIP2GyTPcYkIMf352BSbt` | `90,000,000,000 72H` |
| SeasonClaimV2 | `EQC3AK8tmvIezR6gd_cdmg4qmrFJOloUhpoWE8HpsSKhjPxY` | `0 72H` |
| FundVesting | `EQBHI_ujpZQVNDj8CVaKMQ6QR2tMVugXaSL46rxgQT7XxnpW` | `0 72H` |
| PresaleVault | `EQBeIBmsLzSkfVwcGl4Donf3Hca2nfta__S3x2n1TMO1g9Vx` | `4,500,000,000 72H` |
| EcosystemTreasury | `EQC6l1XfmSrj50sOWHf5S7xiO_O4_0Xd4v2je2Pr7BLcWnBF` | `4,500,000,000 72H` |
| DevelopmentFund | `EQAmfNJcT0-DZlc1pLWURIJrQKR2xRJQaBjadpSB9wVcYx8T` | `500,000,000 72H` |
| TeamVesting | `EQABKzYV7XtCAi9RcKGWRL8OAHWEr0lYvNXW_h-W9kJ7sO9X` | `300,000,000 72H` |
| Early users / operations | `EQD-9WsEEJFTo9yMw2cLOkbN_tnFQuizMRMZzeWOv2E2Zq01` | `200,000,000 72H` |

## Verification Evidence

- V3 mainnet plan: `deployments/v3-mainnet/72h-v3-tokenomics.mainnet.plan.json`
- V3 TonConnect package: `deployments/v3-mainnet/72h-v3-mainnet.tonconnect.json`
- V3 post-deploy getter evidence: `deployments/v3-mainnet/72h-v3-mainnet.postdeploy.latest.json`
- Verification command: `npm run verify:v3-mainnet-postdeploy`
- Website JSON source: `integrations/website/72h-v3-mainnet.json`

Post-deploy getter verification confirmed on 2026-05-01:

- `total_supply = 100000000000000000000`
- `mintable = 0`
- `admin = null`
- all V3 contracts are `active`
- SeasonClaimV2 and FundVesting Jetton wallets are verified at `0` initial balance
- PresaleVault funded accounting and Jetton wallet balance both equal `4500000000000000000`

V2 contract information is frozen as historical archive only. Do not use V2 addresses for new wallet, website, exchange, or product integrations.
