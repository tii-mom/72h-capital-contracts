# 72H Capital Contracts

Official smart contract repository for the 72H V2 mainnet token and tokenomics contracts on TON.

## Mainnet Status

72H V2 is deployed and verified on mainnet.

- Token: `72H`
- Decimals: `9`
- Total supply: `100,000,000,000 72H`
- Raw total supply: `100000000000000000000`
- Mint authority: removed
- Jetton master `admin`: `null`
- Jetton master `mintable`: `0`
- Deployment evidence: [`deployments/72h-v2-mainnet.deployed-2026-04-28.md`](deployments/72h-v2-mainnet.deployed-2026-04-28.md)
- Public token and contract information: [`docs/72h-v2-mainnet-public-info.md`](docs/72h-v2-mainnet-public-info.md)
- Wallet/exchange submission package: [`docs/72h-v2-wallet-exchange-token-info.md`](docs/72h-v2-wallet-exchange-token-info.md)
- Public submission status: [`docs/72h-v2-public-submission-status.md`](docs/72h-v2-public-submission-status.md)
- Official website JSON source: [`integrations/website/72h-v2-mainnet.json`](integrations/website/72h-v2-mainnet.json)

## Mainnet Addresses

| Contract | Address |
| --- | --- |
| V2 Jetton Master | `EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg` |
| SeasonVault | `EQCdSSWPVbwh9zIzhF5pnxwRKw-I8xc4bS1iyiVcbXKfnWe-` |
| SeasonClaim | `EQCYvg-_oFE8q8cweVScna-WDRzDYol-FBwHKuTcAjcFGonS` |
| FundVesting | `EQDO0AMsITst5rWGcabJ8OF7Ys079UMPGNOq9H8WtiJakID4` |
| DevelopmentFund | `EQAPkdB1YJDEsVixATzfDjf--yl0frlKRkLPYHHUv6nVFkEU` |
| PresaleVault | `EQCj56OaGFtIBgdtQjIacb7s1jlEy93vh-93PU07MDR1vpE9` |
| EcosystemTreasury | `EQARGC33uqypROhxiJMVOeKPYbYRgAEhXUkTxkrK7CrKDP3O` |
| TeamVesting | `EQD5PnUEuEUYBt1XktTPlvN7HE5n-AIBI4XiAyd4qUgHasrK` |

## Allocation

| Recipient | Amount |
| --- | ---: |
| SeasonVault | `90,000,000,000 72H` |
| PresaleVault | `4,500,000,000 72H` |
| EcosystemTreasury | `4,500,000,000 72H` |
| DevelopmentFund | `500,000,000 72H` |
| TeamVesting | `300,000,000 72H` |
| Early users / operations | `200,000,000 72H` |

The allocation sum equals the fixed total supply.

## Repository Scope

This repository contains:

- V2 Jetton Func contracts in `contracts/jetton-v2/`
- V2 tokenomics Tact contracts:
  - `SeasonVault`
  - `SeasonClaim`
  - `FundVesting`
  - `DevelopmentFund`
  - `PresaleVault`
  - `EcosystemTreasury`
  - `TeamVesting`
- Legacy and supporting contracts used for earlier Reserve/AppRewardPool work
- Mainnet and testnet deployment plans and evidence
- Audit artifacts and readiness documents
- Public website, wallet, explorer, and exchange integration notes
- Future app contract folders under `contracts/apps/`
- Integration tests and deployment scripts

Application-specific future contracts should be added under app-specific folders in this contracts repository, while frontend and backend application repositories should consume the public addresses and ABI/wrapper artifacts from here.

## Verification

Mainnet verification completed:

- V2 Jetton master is active.
- All 7 V2 tokenomics contracts are active.
- Jetton `get_jetton_data` returns the fixed supply.
- Jetton `admin=null`.
- Jetton `mintable=0`.
- Admin Jetton wallet final balance is `0`.
- Final allocation balances match `deployments/72h-v2-tokenomics.mainnet.plan.json`.

Local validation used before mainnet deployment:

```bash
npm run tact:build
npm run lint
npm run build
npm test
```

Static analysis baseline:

- Misti all-detectors artifact: `audit-artifacts/misti-all-detectors-post-souffle-2026-04-28.json/warnings.json`
- Latest audit/review status is summarized in `docs/72h-v2-mainnet-readiness.md`.

## Metadata

- Website: `https://72h.lol`
- Telegram: `https://t.me/the_72h`
- X: `https://x.com/72hour_s`
- Final metadata URI: `ipfs://QmZkjBvKmHhsh56bPbbnwgPL8844eP5Btke6edbRGjPZNw`
- Logo URI: `ipfs://QmNzFgWkVCxuJJBym1hoDq5tG4PwFBT8mUMMXdPefb23S4`

## Application Integration

- Multi-millionaire 90B reward plan: [`docs/apps/multi-millionaire-900b-reward-integration.md`](docs/apps/multi-millionaire-900b-reward-integration.md)
- Blocker follow-up and launch gates: [`docs/72h-v2-blocker-follow-up-worklist.md`](docs/72h-v2-blocker-follow-up-worklist.md)
- Owner custody runbook: [`docs/owner-custody-runbook.md`](docs/owner-custody-runbook.md)
- Presale launch runbook: [`docs/presale-vault-launch-runbook.md`](docs/presale-vault-launch-runbook.md)
- SeasonClaimV2 stable interface draft: [`docs/season-claim-v2-stable-interface.md`](docs/season-claim-v2-stable-interface.md)
- App contract boundary: [`contracts/apps/README.md`](contracts/apps/README.md)

## Development

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run lint
npm run build
npm run tact:check
npm run tact:build
npm test
```

Mainnet transaction packages in this repository are evidence and historical deployment artifacts. Do not sign old or regenerated packages without a new owner approval and a fresh review.
