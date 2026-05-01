# 72H V3 Contract Facts Freeze Note

Status: frozen public V3 token facts for cross-repository integration.

Freeze time: `2026-05-01T16:30:07.511Z`

Use this note for website, WAN, Terminal, and `multi-millionaire` integration updates. This note is read-only public fact material. It is not a signing package, app-contract approval, root publication approval, presale approval, or owner operation approval.

## Canonical Sources

- Human-readable facts: `docs/72H_MAINNET_FACTS.md`
- Machine-readable facts: `docs/72H_MAINNET_FACTS.json`
- Website JSON source: `integrations/website/72h-v3-mainnet.json`
- Post-deploy evidence: `deployments/v3-mainnet/72h-v3-mainnet.postdeploy.latest.json`
- V3 plan archive: `deployments/v3-mainnet/72h-v3-tokenomics.mainnet.plan.json`
- Metadata JSON: `metadata/72h-v3.metadata.final.json`

## Token Facts

| Field | Value |
| --- | --- |
| Network | TON mainnet |
| Token | `72H` |
| Decimals | `9` |
| V3 Jetton Master | `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3` |
| Total supply raw | `100000000000000000000` |
| Total supply human | `100,000,000,000 72H` |
| Mintable | `false` / `0` |
| Admin | `null` |
| Metadata URI | `ipfs://QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC` |
| Logo URI | `ipfs://QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4` |

## V3 Core Contracts

| Contract | Address | Status |
| --- | --- | --- |
| SeasonVault | `EQCkI1atYYWN-2cnJJASJ1nKsu0ZbvCd_EVZQ61KcoIW-13l` | active |
| SeasonClaimV2 | `EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b` | active, no public roots published by this freeze |
| FundVesting | `EQBKuIRplvhYzL9Gbm6GpZqCxMTHApVOZMVs9T1HzXcP7inb` | active |
| DevelopmentFund | `EQBbRZQj_VJU2r-DAtQcHoDngRC9EBvUHFg4LoB5HXLBv1Yh` | active |
| PresaleVault | `EQDHSwsiQtB3sdoAaOdJi4kCu32GIHM4BtXd-_EtpE96EYXy` | active contract, presale inactive |
| EcosystemTreasury | `EQCy7YpjZJuQAwjCQvQK55dv4p89c5pJUR9vi8nAwoW4a_w7` | active |
| TeamVesting | `EQC3pNoWZHNmbcazxJV7lzcQH05Zewjl5w1KJhA4OfIPM6cy` | active |

## Allocation Balances

| Recipient | Jetton wallet | Raw balance |
| --- | --- | ---: |
| SeasonVault | `EQClq_b3CeBTPUtjsQWgaIg4dfrjIP2GyTPcYkIMf352BSbt` | `90000000000000000000` |
| SeasonClaimV2 | `EQC3AK8tmvIezR6gd_cdmg4qmrFJOloUhpoWE8HpsSKhjPxY` | `0` |
| FundVesting | `EQBHI_ujpZQVNDj8CVaKMQ6QR2tMVugXaSL46rxgQT7XxnpW` | `0` |
| DevelopmentFund | `EQAmfNJcT0-DZlc1pLWURIJrQKR2xRJQaBjadpSB9wVcYx8T` | `500000000000000000` |
| PresaleVault | `EQBeIBmsLzSkfVwcGl4Donf3Hca2nfta__S3x2n1TMO1g9Vx` | `4500000000000000000` |
| EcosystemTreasury | `EQC6l1XfmSrj50sOWHf5S7xiO_O4_0Xd4v2je2Pr7BLcWnBF` | `4500000000000000000` |
| TeamVesting | `EQABKzYV7XtCAi9RcKGWRL8OAHWEr0lYvNXW_h-W9kJ7sO9X` | `300000000000000000` |
| Early users / operations | `EQD-9WsEEJFTo9yMw2cLOkbN_tnFQuizMRMZzeWOv2E2Zq01` | `200000000000000000` |

## Forbidden Boundaries

- V2 is frozen archive only. Do not use V2 addresses in current website, wallet, exchange, app, or Terminal integrations.
- Legacy Capital/Reserve/AppRewardPool packages must not be signed, reused, or presented as current launch material.
- PresaleVault must not be activated. Do not call `SetPresaleActive(active: true)`, enable sales UX, or route users to `BuyPresale` without separate audited launch approval and explicit owner approval.
- SeasonClaimV2 root publication requires separate owner approval after reviewed game export, Merkle root evidence, and publication runbook approval.
- App-specific contracts are not included in this V3 public facts publish and must not be represented as live chain infrastructure.

## Verification Recorded

The following checks passed for this freeze:

- `npm run typecheck`
- `npm run tact:check`
- `npm run test`
- `npm run verify:v3-mainnet-postdeploy`

Latest post-deploy result:

- `status = deployed-and-postdeploy-verified`
- `failures = []`
- V3 Jetton fixed supply confirmed
- mint authority removed
- all seven V3 tokenomics contracts active
