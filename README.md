# 72H Capital Contracts

Official smart contract repository for the current 72H V3 mainnet token and tokenomics contracts on TON.

## Mainnet Status

72H V3 is deployed and verified on mainnet. V2 is frozen as historical archive and must not be used for new public integrations.

- Token: `72H`
- Decimals: `9`
- Total supply: `100,000,000,000 72H`
- Raw total supply: `100000000000000000000`
- Mint authority: removed
- Jetton master `admin`: `null`
- Jetton master `mintable`: `0`
- V3 post-deploy evidence: [`deployments/v3-mainnet/72h-v3-mainnet.postdeploy.latest.json`](deployments/v3-mainnet/72h-v3-mainnet.postdeploy.latest.json)
- Public token and contract information: [`docs/72h-v3-mainnet-public-info.md`](docs/72h-v3-mainnet-public-info.md)
- Wallet/exchange submission package: [`docs/72h-v3-wallet-exchange-token-info.md`](docs/72h-v3-wallet-exchange-token-info.md)
- Public submission status: [`docs/72h-v3-public-submission-status.md`](docs/72h-v3-public-submission-status.md)
- Official website JSON source: [`integrations/website/72h-v3-mainnet.json`](integrations/website/72h-v3-mainnet.json)

## Mainnet Addresses

| Contract | Address |
| --- | --- |
| V3 Jetton Master | `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3` |
| SeasonVault | `EQCkI1atYYWN-2cnJJASJ1nKsu0ZbvCd_EVZQ61KcoIW-13l` |
| SeasonClaimV2 | `EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b` |
| FundVesting | `EQBKuIRplvhYzL9Gbm6GpZqCxMTHApVOZMVs9T1HzXcP7inb` |
| DevelopmentFund | `EQBbRZQj_VJU2r-DAtQcHoDngRC9EBvUHFg4LoB5HXLBv1Yh` |
| PresaleVault | `EQDHSwsiQtB3sdoAaOdJi4kCu32GIHM4BtXd-_EtpE96EYXy` |
| EcosystemTreasury | `EQCy7YpjZJuQAwjCQvQK55dv4p89c5pJUR9vi8nAwoW4a_w7` |
| TeamVesting | `EQC3pNoWZHNmbcazxJV7lzcQH05Zewjl5w1KJhA4OfIPM6cy` |

## Allocation

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

The allocation sum equals the fixed total supply.

## Repository Scope

This repository contains:

- Jetton Func contracts in `contracts/jetton-v2/` used by the current V3 asset line.
- V3 tokenomics Tact contracts:
  - `contracts/deployed/v3-core/SeasonVault.tact`
  - `contracts/deployed/v3-core/SeasonClaimV2.tact`
  - `contracts/deployed/v3-core/FundVesting.tact`
  - `contracts/deployed/v3-core/DevelopmentFund.tact`
  - `contracts/deployed/v3-core/PresaleVault.tact`
  - `contracts/deployed/v3-core/EcosystemTreasury.tact`
  - `contracts/deployed/v3-core/TeamVesting.tact`
- V2 archive contracts in `contracts/archive/`.
- Supporting contracts in `contracts/supporting/` used for earlier Reserve/AppRewardPool work. These are not current signing inputs.
- Mainnet and testnet deployment plans and evidence.
- Audit artifacts and readiness documents.
- Public website, wallet, explorer, and exchange integration notes.
- Future app contract folders under `contracts/apps/`.
- Integration tests and deployment scripts.

Application-specific future contracts should be added under app-specific folders in this contracts repository, while frontend and backend application repositories should consume the public addresses and ABI/wrapper artifacts from here.

`contracts/apps/multi-millionaire/v3/` is a reserved production-candidate workspace only. Nothing in that folder is considered deployed or approved for mainnet until it has tests, wrappers, testnet evidence, a reviewed mainnet plan, and explicit owner approval.

## Verification

Mainnet V3 verification completed:

- V3 Jetton master is active.
- All 7 V3 tokenomics contracts are active.
- Jetton `get_jetton_data` returns the fixed supply.
- Jetton `admin=null`.
- Jetton `mintable=0`.
- PresaleVault funded accounting and Jetton wallet balance both equal `4,500,000,000 72H`.
- Final allocation balances match `deployments/v3-mainnet/72h-v3-tokenomics.mainnet.plan.json`.

Current restrictions:

- Do not activate PresaleVault or point sales UX at it without a separate audited launch approval.
- Do not publish SeasonClaimV2 roots until the game season export, Merkle root, and owner approval are complete.
- Do not use V2 or legacy Capital/Reserve/AppRewardPool artifacts as current signing entries.

Current validation commands:

```bash
npm run lint
npm run build
npm run verify:mainnet-launch-gates
npm run verify:v3-mainnet-postdeploy
```

## Metadata

- Website: `https://72h.lol`
- Telegram: `https://t.me/the_72h`
- X: `https://x.com/72hour_s`
- Final V3 metadata URI: `ipfs://QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC`
- Logo URI: `ipfs://QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4`

## Application Integration

- Current mainnet facts: [`docs/72H_MAINNET_FACTS.md`](docs/72H_MAINNET_FACTS.md)
- V3 contract facts freeze note: [`docs/72h-v3-contract-facts-freeze-note.md`](docs/72h-v3-contract-facts-freeze-note.md)
- Multi-millionaire 90B reward plan: [`docs/apps/multi-millionaire-900b-reward-integration.md`](docs/apps/multi-millionaire-900b-reward-integration.md)
- Owner custody runbook: [`docs/owner-custody-runbook.md`](docs/owner-custody-runbook.md)
- Presale launch runbook: [`docs/presale-vault-launch-runbook.md`](docs/presale-vault-launch-runbook.md)
- SeasonClaimV2 stable interface draft: [`docs/season-claim-v2-stable-interface.md`](docs/season-claim-v2-stable-interface.md)
- App contract boundary: [`contracts/apps/README.md`](contracts/apps/README.md)

## Development

Install dependencies:

```bash
npm install
```
