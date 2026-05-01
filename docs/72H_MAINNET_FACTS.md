# 72H Mainnet Facts Source

Status: current V3 facts source; V2 is frozen archive.

Last aligned: `2026-05-01`

## Authority and Scope

Use this document as the human-readable source of truth for current 72H mainnet facts across repositories.

Canonical V3 evidence:

- `deployments/v3-mainnet/72h-v3-tokenomics.mainnet.plan.json`
- `deployments/v3-mainnet/72h-v3-mainnet.tonconnect.json`
- `deployments/v3-mainnet/72h-v3-mainnet.postdeploy.latest.json`
- `docs/72h-v3-mainnet-public-info.md`
- `integrations/website/72h-v3-mainnet.json`

Do not treat V2 documents or V2 signing packages as current public facts. V2 is historical archive only.

## Current Deployed Mainnet Facts

Verified at: `2026-05-01T16:15:36.246Z`

Network: TON mainnet

### Jetton

| Field | Value |
| --- | --- |
| Official V3 Jetton master | `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3` |
| Total supply raw | `100000000000000000000` |
| Total supply human | `100,000,000,000 72H` |
| Mintable | `false` / `0` |
| Admin | `null` |
| Admin owner wallet | `EQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQamv` |
| Metadata URI | `ipfs://QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC` |
| Wallet code hash | `ba2918c8947e9b25af9ac1b883357754173e5812f807a3d6e642a14709595395` |

Frozen archive identifiers:

- V2 Jetton master `EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg` is replaced by V3. Do not use it in new docs, apps, exchange submissions, wallet metadata, scripts, or public launch materials.
- Old pre-V2 Jetton master `EQDvE0ffdwvOhILjRJKFd2bIU9t5H9bG3-SKRidqavZjRsw8` remains deprecated.

### Active Core Contracts

| Contract | Mainnet address | State |
| --- | --- | --- |
| V3 Jetton Master | `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3` | active |
| SeasonVault | `EQCkI1atYYWN-2cnJJASJ1nKsu0ZbvCd_EVZQ61KcoIW-13l` | active |
| SeasonClaimV2 | `EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b` | active |
| FundVesting | `EQBKuIRplvhYzL9Gbm6GpZqCxMTHApVOZMVs9T1HzXcP7inb` | active |
| DevelopmentFund | `EQBbRZQj_VJU2r-DAtQcHoDngRC9EBvUHFg4LoB5HXLBv1Yh` | active |
| PresaleVault | `EQDHSwsiQtB3sdoAaOdJi4kCu32GIHM4BtXd-_EtpE96EYXy` | active, inactive / do not activate without separate approval |
| EcosystemTreasury | `EQCy7YpjZJuQAwjCQvQK55dv4p89c5pJUR9vi8nAwoW4a_w7` | active |
| TeamVesting | `EQC3pNoWZHNmbcazxJV7lzcQH05Zewjl5w1KJhA4OfIPM6cy` | active |

### Allocation Balances

| Recipient | Owner / contract | Jetton wallet | Verified raw balance | Human amount |
| --- | --- | --- | ---: | ---: |
| SeasonVault | `EQCkI1atYYWN-2cnJJASJ1nKsu0ZbvCd_EVZQ61KcoIW-13l` | `EQClq_b3CeBTPUtjsQWgaIg4dfrjIP2GyTPcYkIMf352BSbt` | `90000000000000000000` | `90,000,000,000 72H` |
| PresaleVault | `EQDHSwsiQtB3sdoAaOdJi4kCu32GIHM4BtXd-_EtpE96EYXy` | `EQBeIBmsLzSkfVwcGl4Donf3Hca2nfta__S3x2n1TMO1g9Vx` | `4500000000000000000` | `4,500,000,000 72H` |
| EcosystemTreasury | `EQCy7YpjZJuQAwjCQvQK55dv4p89c5pJUR9vi8nAwoW4a_w7` | `EQC6l1XfmSrj50sOWHf5S7xiO_O4_0Xd4v2je2Pr7BLcWnBF` | `4500000000000000000` | `4,500,000,000 72H` |
| DevelopmentFund | `EQBbRZQj_VJU2r-DAtQcHoDngRC9EBvUHFg4LoB5HXLBv1Yh` | `EQAmfNJcT0-DZlc1pLWURIJrQKR2xRJQaBjadpSB9wVcYx8T` | `500000000000000000` | `500,000,000 72H` |
| TeamVesting | `EQC3pNoWZHNmbcazxJV7lzcQH05Zewjl5w1KJhA4OfIPM6cy` | `EQABKzYV7XtCAi9RcKGWRL8OAHWEr0lYvNXW_h-W9kJ7sO9X` | `300000000000000000` | `300,000,000 72H` |
| Early users / operations | `EQDqA19b4tBQKi7Z_0NS08eWzq-FZ-wsRU4QfzEEKwcouZUQ` | `EQD-9WsEEJFTo9yMw2cLOkbN_tnFQuizMRMZzeWOv2E2Zq01` | `200000000000000000` | `200,000,000 72H` |

Zero-initial tokenomics wallets:

- SeasonClaimV2 Jetton wallet `EQC3AK8tmvIezR6gd_cdmg4qmrFJOloUhpoWE8HpsSKhjPxY` is expected balance `0`.
- FundVesting Jetton wallet `EQBHI_ujpZQVNDj8CVaKMQ6QR2tMVugXaSL46rxgQT7XxnpW` is expected balance `0`.

## V3 Verification Rules

1. Apps, exchange forms, wallet metadata, public pages, and integration docs must use the official V3 Jetton master `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3`.
2. V2 addresses must be labeled frozen archive or removed from current public flows.
3. Presale UX and integrations must remain disabled unless a separate audited launch route is approved.
4. Season rewards must only be finalized to SeasonClaimV2 after all required game season records and Merkle roots are produced and reviewed.
5. Public production contract JSON should be `/contracts/72h-v3-mainnet.json`.
6. `contracts/apps/multi-millionaire/v3/` is only a reserved production-candidate workspace. It is not deployed and must not be represented as a live contract set.
