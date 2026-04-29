# 72H Mainnet Facts Source Draft

Status: draft cross-repo facts source, derived from `deployments/72h-v2-mainnet.deployed-2026-04-28.md` and `deployments/72h-v2-tokenomics.mainnet.plan.json`.

Last aligned: `2026-04-30`

## Authority and Scope

Use this document as the human-readable source of truth for currently deployed 72H V2 mainnet facts across repositories.

Canonical evidence:

- `deployments/72h-v2-mainnet.deployed-2026-04-28.md`
- `deployments/72h-v2-tokenomics.mainnet.plan.json`
- Signing artifacts: `deployments/72h-v2-mainnet.tonconnect.json`, `deployments/72h-v2-mainnet-deploy.html`

Do **not** treat draft runbooks, candidate contracts, testnet manifests, or local code hashes as deployed mainnet facts.

## Deployed Mainnet Facts

Verified at: `2026-04-28T05:22:59Z` (`2026-04-28 13:22:59 CST`)

Network: TON mainnet

### Jetton

| Field | Value |
| --- | --- |
| Official V2 Jetton master | `EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg` |
| Total supply raw | `100000000000000000000` |
| Total supply human | `100,000,000,000 72H` |
| Mintable | `false` / `0` |
| Admin | `null` |
| Admin owner wallet | `EQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQamv` |
| Admin Jetton wallet | `EQAgoErDhUiB40UbFYmlVvDxDx_lQo1AEEjVxyTzghbXXX83` |
| Admin Jetton wallet final balance | `0` |
| Metadata URI | `ipfs://QmZkjBvKmHhsh56bPbbnwgPL8844eP5Btke6edbRGjPZNw` |

Deprecated / voided identifiers:

- Old Jetton master `EQDvE0ffdwvOhILjRJKFd2bIU9t5H9bG3-SKRidqavZjRsw8` is **deprecated / not the active V2 deployed token**. Do not use it in new docs, apps, exchange submissions, wallet metadata, scripts, or public launch materials.
- Legacy signing files `deployments/legacy-mainnet.tonconnect.void-2026-04-28.json` and `deployments/legacy-mainnet-deploy.void-2026-04-28.html` are voided and must not be used.

### Active Core Contracts

| Contract | Mainnet address | State |
| --- | --- | --- |
| V2 Jetton Master | `EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg` | active |
| SeasonVault | `EQCdSSWPVbwh9zIzhF5pnxwRKw-I8xc4bS1iyiVcbXKfnWe-` | active |
| SeasonClaim | `EQCYvg-_oFE8q8cweVScna-WDRzDYol-FBwHKuTcAjcFGonS` | active |
| FundVesting | `EQDO0AMsITst5rWGcabJ8OF7Ys079UMPGNOq9H8WtiJakID4` | active |
| DevelopmentFund | `EQAPkdB1YJDEsVixATzfDjf--yl0frlKRkLPYHHUv6nVFkEU` | active |
| PresaleVault | `EQCj56OaGFtIBgdtQjIacb7s1jlEy93vh-93PU07MDR1vpE9` | active, closed / do not activate without separate approval |
| EcosystemTreasury | `EQARGC33uqypROhxiJMVOeKPYbYRgAEhXUkTxkrK7CrKDP3O` | active |
| TeamVesting | `EQD5PnUEuEUYBt1XktTPlvN7HE5n-AIBI4XiAyd4qUgHasrK` | active |

### Allocation Balances

| Recipient | Owner / contract | Jetton wallet | Verified raw balance | Human amount |
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

## Deployed Facts vs Current Candidate / Draft Work

| Area | Deployed mainnet fact | Current candidate / draft status | Required interpretation |
| --- | --- | --- | --- |
| PresaleVault | `EQCj56OaGFtIBgdtQjIacb7s1jlEy93vh-93PU07MDR1vpE9` is deployed and holds `4,500,000,000 72H`; deployment code hash in the mainnet plan is `d0458deb2bc69870977e003c5da36c2e806cce29422e6720afaa497b0ec3a63b`. | Local `contracts/PresaleVault.tact` has post-deployment hardening and draft launch runbooks. | The local hardened PresaleVault is a **candidate**, not the deployed contract. Do not activate or route users to the deployed PresaleVault without external review and explicit owner approval. |
| SeasonClaim | Legacy `SeasonClaim` is deployed at `EQCYvg-_oFE8q8cweVScna-WDRzDYol-FBwHKuTcAjcFGonS`. | SeasonClaimV2 exists as local/testnet candidate work to address proof-depth scaling. | Mainnet facts still refer to deployed legacy `SeasonClaim` unless a future audited migration is actually deployed and verified. |
| SeasonClaimV2 | No verified mainnet SeasonClaimV2 address is part of the deployed V2 facts. | `contracts/SeasonClaimV2.tact`, stable interface docs, exporter notes, and testnet rehearsal artifacts are draft/candidate materials. | Treat all SeasonClaimV2 addresses, code hashes, roots, wrappers, and exporter settings as **not production mainnet** until final gates pass and a deployment evidence file exists. |
| SeasonClaimV2LegacyBridge | No verified mainnet bridge address is part of the deployed V2 facts. | Bridge route `SeasonVault -> legacy SeasonClaim -> SeasonClaimV2LegacyBridge -> SeasonClaimV2` is a candidate migration plan with testnet phase-1 evidence and pending cleanup gate. | Bridge deployment, claim, manual-forward, and public V2 root work are **blocked / draft-only** until gates pass and owner approval is recorded. |
| Mainnet signing packages | `deployments/72h-v2-mainnet.tonconnect.json` and `deployments/72h-v2-mainnet-deploy.html` are the signed deployed package evidence. | Future dry-run/signing package generation for SeasonClaimV2/bridge/presale remains gated. | Do not conflate generated testnet/draft manifests with deployed mainnet evidence. |

## Cross-Repo Usage Rules

1. Apps, exchange forms, wallet metadata, public pages, and integration docs must use the official V2 Jetton master `EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg`.
2. Any reference to `EQDvE0ffdwvOhILjRJKFd2bIU9t5H9bG3-SKRidqavZjRsw8` must be labeled deprecated or removed.
3. Public production reward claim integrations must not point to SeasonClaimV2 until a mainnet SeasonClaimV2 deployment is verified.
4. Presale UX and integrations must remain disabled unless a separate audited launch route is approved.
5. Draft runbooks may cite candidate code hashes, but must not present them as deployed addresses or deployed facts.
