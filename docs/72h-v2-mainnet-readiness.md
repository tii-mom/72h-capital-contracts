# 72H V2 Mainnet Readiness

Status: `FROZEN ARCHIVE - REPLACED BY V3`

Current mainnet facts: `docs/72H_MAINNET_FACTS.md`

Do not use this V2 readiness document for current public integrations or signing decisions.

Status: deployed and verified on mainnet after owner Tonkeeper approval. The fixed-supply Jetton was minted once, mint authority was dropped, all 7 V2 tokenomics contracts are active, and final allocation balances match the refreshed mainnet plan.

Date: 2026-04-28

Mainnet deployment evidence: `deployments/72h-v2-mainnet.deployed-2026-04-28.md`

## Archived V2 Deployment

This archived mainnet deployment is the V2 fixed-supply Jetton plus V2 tokenomics contracts:

- V2 Jetton Func sources: `contracts/jetton-v2/*.fc`
- V2 tokenomics Tact contracts: `contracts/deployed/v3-core/SeasonVault.tact`, `contracts/archive/v2/SeasonClaim.tact`, `contracts/deployed/v3-core/FundVesting.tact`, `contracts/deployed/v3-core/DevelopmentFund.tact`, `contracts/deployed/v3-core/PresaleVault.tact`, `contracts/deployed/v3-core/EcosystemTreasury.tact`, `contracts/deployed/v3-core/TeamVesting.tact`
- V2 integration tests: `tests/jetton-v2.spec.ts`, `tests/72h-v2-tokenomics.spec.ts`
- V2 testnet rehearsal script: `scripts/rehearse-72h-v2-tokenomics-testnet.ts`
- V2 mainnet dry-run plan script: `scripts/plan-72h-v2-tokenomics-mainnet.ts`

Do not treat the legacy Capital/Reserve/AppRewardPool TonConnect package as the V2 tokenomics deployment package. The old files were moved out of the default signing names to `deployments/legacy-mainnet.tonconnect.void-2026-04-28.json` and `deployments/legacy-mainnet-deploy.void-2026-04-28.html`.

## Completed Evidence

Local verification completed:

```bash
npm run tact:build
npm run lint
npm run build
```

Result:

- TypeScript typecheck passed.
- Tact `--check` passed.
- Tact build passed.
- TypeScript build passed.
- Vitest passed: 7 test files, 65 tests.

Post-redesign local verification on 2026-04-28:

- `SeasonVault` successful rounds accrue inside the season until owner finalizes an 18-round season.
- `SeasonClaim` registers one season root with fixed personal/team/referral/leaderboard totals.
- `multi-millionaire` generates matching SeasonClaim leaves with app id `1`, token address, SeasonClaim address, season id, wallet, four pool amounts, and total amount.
- `/Desktop/72` is display/navigation only and is not an allocation source.

Fresh post-season-redesign testnet V2 evidence:

- Jetton manifest: `deployments/jetton-v2.testnet.latest.json`
- Tokenomics evidence: `deployments/72h-v2-tokenomics.testnet.latest.json`
- Timestamped Jetton manifest: `deployments/jetton-v2.testnet.2026-04-28T03-39-57-258Z.json`
- Timestamped tokenomics evidence: `deployments/72h-v2-tokenomics.testnet.2026-04-28T04-01-28-080Z.json`
- Testnet V2 Jetton master: `kQDJqdAP9DR5NGV7EDg6T78EuNqmuKsbpEhQJSrFxTm8rjtK`
- Testnet SeasonVault: `kQDO6EIylsZff48kCNji0mdjrpeFlDQz681quAyFyns-Bd44`
- Testnet SeasonClaim: `kQBd5rP4rtz9jByQG3hntvdqT__zzLyHAiMvSGNiST3T5SeF`
- Testnet FundVesting: `kQDE3XDJ9qyyhFhH3nMBKYNJqlUb6J0PUP24f0r5JqVGUZjs`
- Testnet PresaleVault: `kQAomKOiWMwaURt-A-DPGWj9TI2UNL1GHnD998HmmJsQpJFC`

Post-season-redesign testnet rehearsal completed:

```bash
TON_TESTNET_ALLOW_JETTON_V2_DEPLOY_SEND=true TON_V2_METADATA_URI="https://72h.lol/testnet/72h-v2-season-reward-confirm-2026-04-28.json" npm run jetton-v2:deploy:testnet:send
TON_TESTNET_ALLOW_72H_V2_TOKENOMICS_REHEARSAL_SEND=true npm run rehearse:v2-tokenomics:testnet:send
```

The fresh final getter evidence confirmed:

- V2 Jetton supply after test burn: `99999999999000000000`
- V2 Jetton `mintable=false`
- V2 Jetton `adminAddress=null`
- SeasonVault season 1 finalized `8500000000000000000` raw user rewards after 17 successful rounds and 1 failed round.
- FundVesting received the failed-round `500000000000000000` raw amount and withdrew the stage-1 unlocked `100000000000000000` raw amount.
- SeasonClaim registered the four-pool totals and paid the stage-1 claim path.
- DevelopmentFund, PresaleVault, EcosystemTreasury, and TeamVesting all reached expected rehearsal states.
- The 7 tokenomics code hashes and allocation raw values match the refreshed mainnet plan.

## Mainnet Dry-Run Plans

Generated dry-run plans:

- `deployments/jetton-v2.mainnet.plan.json`
- `deployments/72h-v2-tokenomics.mainnet.plan.json`

The V2 TonConnect package used for mainnet deployment:

- `deployments/72h-v2-mainnet.tonconnect.json`
- `deployments/72h-v2-mainnet-deploy.html`
- Generated at: `2026-04-28T04:02:13.986Z`

Archived planned V2 mainnet Jetton master:

- `EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg`

Archived planned V2 tokenomics contract addresses:

- SeasonVault: `EQCdSSWPVbwh9zIzhF5pnxwRKw-I8xc4bS1iyiVcbXKfnWe-`
- SeasonClaim: `EQCYvg-_oFE8q8cweVScna-WDRzDYol-FBwHKuTcAjcFGonS`
- FundVesting: `EQDO0AMsITst5rWGcabJ8OF7Ys079UMPGNOq9H8WtiJakID4`
- DevelopmentFund: `EQAPkdB1YJDEsVixATzfDjf--yl0frlKRkLPYHHUv6nVFkEU`
- PresaleVault: `EQCj56OaGFtIBgdtQjIacb7s1jlEy93vh-93PU07MDR1vpE9`
- EcosystemTreasury: `EQARGC33uqypROhxiJMVOeKPYbYRgAEhXUkTxkrK7CrKDP3O`
- TeamVesting: `EQD5PnUEuEUYBt1XktTPlvN7HE5n-AIBI4XiAyd4qUgHasrK`

The mainnet tokenomics dry-run plan was refreshed on `2026-04-28T03:39:18.426Z` after the season-level reward redesign and failed-round confirmation fix. The owner later approved and signed the matching V2 TonConnect package on mainnet.

## Final Pre-Signoff Refresh

The 2026-04-27 package and earlier 2026-04-28 packages are stale after the season reward redesign and failed-round confirmation fix and must not be signed.

Final refresh completed:

- fresh testnet V2 Jetton
- fresh `deployments/72h-v2-tokenomics.testnet.latest.json`
- fresh `deployments/72h-v2-tokenomics.mainnet.plan.json`
- fresh `deployments/72h-v2-mainnet.tonconnect.json`
- fresh `deployments/72h-v2-mainnet-deploy.html`

Completed mechanical checks:

- local build code hashes match refreshed mainnet plan and fresh testnet evidence for all 7 V2 tokenomics contracts
- mainnet plan allocation raw values match fresh testnet evidence
- allocation raw sum equals fixed total supply: `100000000000000000000`
- every deploy `stateInit` in the refreshed TonConnect package derives to its planned address
- every tokenomics deploy `stateInit` code hash and data hash matches the refreshed mainnet plan
- every allocation JettonTransfer payload amount and destination matches the refreshed mainnet plan

Final batch order:

1. `deploy-v2-jetton-master`
2. `mint-v2-total-supply`
3. `drop-v2-admin`
4. `deploy-tokenomics-a`
5. `deploy-tokenomics-b`
6. `set-jetton-wallets-a`
7. `set-jetton-wallets-b`
8. `set-tokenomics-routes`
9. `allocate-tokenomics-a`
10. `allocate-tokenomics-b`

## Known Fixes

Testnet and audit findings fixed before this readiness note:

1. Tact contracts now encode V2 Jetton `forwardPayload` as an inline empty `Either.left`, not as an empty slice. This avoids standard V2 wallet `cell underflow`.
2. V2 Jetton minter now enforces the `100,000,000,000 72H` total supply cap before admin is dropped.
3. `SeasonClaim` now commits claim accounting before dispatch and ignores unauthenticated `JettonExcesses`; only a bounced transfer from `claimJettonWallet` can roll back a pending claim. This closes the fake-excess finalization path.
4. `SeasonClaim` duplicate pending claims for the same Merkle leaf are blocked by immediate claimed accounting and covered by duplicate/retry tests.
5. `PresaleVault` now tracks `hasBeenActive` and rejects unsold sweep before the presale has opened at least once.
6. `SeasonClaim` claim window is now 60 days, followed by a 72-hour bounce grace period before sweep.
7. `SeasonClaim` tracks pending claim amount by round, requires zero pending claims before sweep, supports owner settlement after bounce grace, and reserves the sweep query-id namespace.
8. `SeasonClaim` and `FundVesting` now use the approved five-stage cumulative unlock schedule: `$0.01`, `$0.03`, `$0.05`, `$0.07`, `$0.10`, each held for 72 hours and each releasing another 20%.
9. All repository JettonTransfer bounce handlers now authenticate the bounce sender against the contract's configured Jetton wallet and validate bounced amount against pending local accounting before rollback. This covers `SeasonVault`, `SeasonClaim`, `FundVesting`, `DevelopmentFund`, `PresaleVault`, `EcosystemTreasury`, `TeamVesting`, `ReserveVault`, and `AppRewardPool`.
10. `ReserveVault` and `AppRewardPool` success finalization handlers now authenticate `JettonExcesses` and explicit `Finalize*` messages against the configured source Jetton wallet before clearing pending state or decrementing accounting.
11. Failed SeasonVault rounds now stay pending until `FundVesting` confirms it received the real Jetton transfer from the configured Jetton wallet. This avoids relying on `JettonExcesses` for failed-round settlement and prevents a later bounce from creating a round-history gap.

The current fixes are covered by local tests and a fresh testnet rehearsal. `ReserveVault` and `AppRewardPool` are outside the 7-contract V2 tokenomics rehearsal unless the older Capital/Reserve package is explicitly included.

## Static Analysis Baseline

Misti 0.9.0 was executed with all detectors after installing Souffle 2.5 and after the SeasonVault failed-round confirmation fix:

```bash
npx @nowarp/misti -A -o json -O audit-artifacts/misti-all-detectors-post-souffle-2026-04-28.json contracts
```

The command returns non-zero because warnings were found. Misti logs show 41 enabled detectors, including `DivideBeforeMultiply`, `ReadOnlyVariables`, and `UnboundLoop`; there is no disabled-detector warning after Souffle installation. Summary:

- Output artifact: `audit-artifacts/misti-all-detectors-post-souffle-2026-04-28.json/warnings.json`
- Total warnings: 418
- `SuboptimalSend`: 21
- `UnusedExpressionResult`: 3
- `PreferredStdlibApi`: 308
- `UnboundMap`: 71
- `PreferGlobalFunction`: 14
- `AsmIsUsed`: 1

These are not all exploitable vulnerabilities, but the audit thread should triage the latest artifact. The increase is consistent with the new SeasonVault/FundVesting confirmation send path and existing gas/style/unbounded-map findings. The only severity-1 item is `AsmIsUsed` for `SeasonClaim`'s `HASHCU` helper; `UnusedExpressionResult` warnings remain in `AdminMultisig.tact`, which is outside the current V2 tokenomics deployment unless the older Capital/Reserve package is also deployed.

## Mainnet Deployment Outcome

The final operational preconditions were closed and the owner approved the mainnet send through Tonkeeper. Deployment evidence is recorded in `deployments/72h-v2-mainnet.deployed-2026-04-28.md`.

Final chain checks passed:

1. V2 Jetton total supply is `100000000000000000000` raw.
2. V2 Jetton `mintable=0`.
3. V2 Jetton `admin=null`.
4. All 8 core contracts are active.
5. Admin Jetton wallet final balance is `0`.
6. Final allocation balances match the refreshed mainnet plan.

## Post-Deployment Presale Gate

The deployed mainnet `PresaleVault` remains inactive and must not be opened for sales under the current blocker policy. The local `PresaleVault` candidate has been hardened after deployment, so the deployed mainnet code hash and current local candidate code hash no longer match:

- deployed mainnet `PresaleVault` code hash: `d0458deb2bc69870977e003c5da36c2e806cce29422e6720afaa497b0ec3a63b`
- hardened local candidate code hash: `5951893d33ce3937961703516c2f8bcd48bf0c146dbc29d228af346ea4e6cf9e`

Presale activation requires the presale-specific route in `docs/presale-vault-launch-runbook.md`; do not sign `SetPresaleActive`, `BuyPresale`, `WithdrawPresaleTon`, or `SweepUnsoldPresale` payloads before that route is approved.

## References

- OpenZeppelin mainnet preparation: https://docs.openzeppelin.com/learn/preparing-for-mainnet
- OWASP Smart Contract Top 10: https://owasp.org/www-project-smart-contract-top-10/
- TON security overview: https://docs.ton.org/v3/guidelines/smart-contracts/security/overview
- Tact tooling and security tools: https://docs.tact-lang.org
- Misti static analyzer: https://nowarp.io/tools/misti/docs/
