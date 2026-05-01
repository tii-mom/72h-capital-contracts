# 72H V2 External Audit Brief

Status: handoff document for an independent audit thread or external auditor.

Date: 2026-04-28

## Objective

Perform an independent TON/Tact smart contract security audit before any mainnet deployment. The audit must cover all contracts and scripts that can affect token supply, token custody, presale accounting, vesting, claims, sweeping, burn behavior, deployment addresses, and mainnet parameters.

The audit must not send mainnet transactions.

## Primary Scope

V2 tokenomics contracts:

- `contracts/deployed/v3-core/SeasonVault.tact`
- `contracts/archive/v2/SeasonClaim.tact`
- `contracts/deployed/v3-core/SeasonClaimV2.tact`
- `contracts/archive/v2/SeasonClaimV2LegacyBridge.tact`
- `contracts/deployed/v3-core/FundVesting.tact`
- `contracts/deployed/v3-core/DevelopmentFund.tact`
- `contracts/deployed/v3-core/PresaleVault.tact`
- `contracts/deployed/v3-core/EcosystemTreasury.tact`
- `contracts/deployed/v3-core/TeamVesting.tact`
- shared Jetton test helpers in `contracts/supporting/TestJetton.tact`, only where they define message structs or helper functions reused by V2 contracts

V2 Jetton integration:

- `contracts/jetton-v2/*.fc`
- `contracts/jetton-v2/jetton.tlb`
- `src/jetton-v2/*.ts`
- `scripts/build-jetton-v2.ts`
- `scripts/plan-jetton-v2.ts`
- `scripts/deploy-jetton-v2-testnet.ts`
- `scripts/verify-jetton-v2-getters.ts`

Deployment and rehearsal scripts:

- `scripts/rehearse-72h-v2-tokenomics-testnet.ts`
- `scripts/rehearse-season-claim-v2-legacy-bridge-testnet.ts`
- `scripts/plan-72h-v2-tokenomics-mainnet.ts`
- `scripts/upload-72h-v2-metadata-pinata.ts`

Mainnet parameters and evidence:

- `docs/72h-v2-launch-parameters-draft.md`
- `docs/72h-v2-mainnet-readiness.md`
- `deployments/jetton-v2.mainnet.plan.json`
- `deployments/72h-v2-tokenomics.mainnet.plan.json`
- `deployments/jetton-v2.testnet.latest.json`
- `deployments/72h-v2-tokenomics.testnet.latest.json`
- `deployments/season-claim-v2-legacy-bridge.testnet.latest.json`
- `docs/season-claim-v2-design.md`
- `docs/season-claim-v2-bridge-audit-followup-prompt.md`
- `docs/season-claim-v2-mainnet-migration-runbook.md`
- `docs/season-claim-v2-mainnet-dry-run-requirements.md`
- `docs/season-claim-v2-mainnet-operator-checklist.md`
- `docs/apps/multi-millionaire-seasonclaim-v2-exporter-config-checklist.md`
- `metadata/72h-v2.metadata.final.json`
- `deployments/72h-v2.pinata-metadata.json`

Conditional scope:

- If the team still intends to deploy the older Capital/Reserve/AppRewardPool mainnet package, also audit `contracts/supporting/AdminMultisig.tact`, `contracts/supporting/CapitalRegistry.tact`, `contracts/supporting/ReserveVault.tact`, `contracts/supporting/AppRewardPool.tact`, `contracts/supporting/AlphaVault.tact`, `contracts/supporting/Treasury.tact`, and `scripts/plan-mainnet-tonconnect-deploy.ts`.
- Do not mix the old package with the V2 tokenomics deployment unless the product owner explicitly approves that architecture.

## Critical Questions

The audit must answer these questions with code references and evidence:

1. Can any actor mint more than the fixed `100,000,000,000 72H` supply after admin is dropped?
2. Can any allocation be sent to the wrong address because of Jetton wallet derivation, owner wallet mismatch, bounce behavior, or route setup order?
3. Can `PresaleVault` over-sell, under-credit buyers, bypass wallet caps, mis-handle stage prices, or sweep sold inventory?
4. Can `SeasonVault` record duplicate, out-of-order, stale, or manipulated rounds?
5. Can `SeasonClaim` be drained, permanently locked, or double-claimed through Merkle proof edge cases, query id reuse, Jetton excess behavior, bounced messages, pending settlement, expired-round sweeping, or partial transfer finalization?
6. Can `FundVesting`, `TeamVesting`, `DevelopmentFund`, or `EcosystemTreasury` release more than intended or release to an unintended wallet?
7. Are all administrator-only functions locked down, and are post-funding route setters impossible to abuse?
8. Do failed outbound Jetton transfers leave pending state that blocks future users or allows replay?
9. Are map growth, storage cost, gas cost, and bounce handling acceptable under realistic use?
10. Do mainnet plan code hashes, data hashes, addresses, metadata URI, and allocation constants match the audited source?
11. Do the 90B season reward unlock thresholds match the approved cumulative schedule: `$0.01`, `$0.03`, `$0.05`, `$0.07`, `$0.10`, each held for 72 hours and each releasing another 20%?
12. Do all outgoing JettonTransfer bounce handlers authenticate `sender()` against the source Jetton wallet and validate `msg.amount` against pending local accounting before clearing pending state or rolling back balances?
13. Does `SeasonClaimV2LegacyBridge` avoid relying on legacy claim transfer notifications, forward only from the configured bridge Jetton wallet to the fixed `SeasonClaimV2` target, clear pending forwards on true wallet bounces, and finalize only on authenticated `ConfirmSeasonClaimFunding` from `SeasonClaimV2`?
14. Does the bridge migration runbook require the legacy `SeasonClaim.SettleSeasonClaimPending(queryId)` call after the 72-hour bounce grace so old pending claim state cannot block later sweep workflows?
15. Is it acceptable to continue draft-only mainnet migration planning while bridge phase 1 testnet evidence is complete but final legacy pending cleanup remains gated by on-chain time, provided every mainnet signing/deployment action stays blocked until evidence status is `complete`?
16. If the older Capital/Reserve/AppRewardPool package is in scope, do `ReserveVault` and `AppRewardPool` success finalization handlers authenticate `JettonExcesses` and explicit `Finalize*` messages against their configured Jetton wallet before clearing pending state or updating accounting?

## Current Bridge Follow-Up Result

Audit follow-up for the manual-forward bridge reported no new P1/P2 blocker. It accepted draft-only mainnet runbook preparation based on phase 1 testnet evidence, and explicitly kept `legacy pending cleanup complete` as a hard gate before any mainnet signing package, deployment, bridge transaction, or public V2 root publication.

Current gate:

- Evidence: `deployments/season-claim-v2-legacy-bridge.testnet.latest.json`
- Current status: `bridge-forward-complete-pending-legacy-settle`
- Required final status before executable mainnet work: `complete`
- Legacy query id: `1777387300691001`
- Cleanup not before: `2026-05-01T14:45:31Z`

## Required Codex Tools For The Audit Thread

The audit thread should explicitly call these tools:

- `functions.exec_command`: run builds, tests, static analyzers, one-off getter/hash checks, and local scripts.
- `multi_tool_use.parallel`: read independent files in parallel, for example several `.tact` files, test files, and generated plans.
- `web.run`: verify current official documentation and tool behavior. Prefer official sources: Tact docs, TON docs, Misti docs, OWASP, OpenZeppelin.
- `functions.apply_patch`: only after a finding is confirmed and a scoped fix is ready. Do not edit files using shell heredocs.
- `spawn_agent`: only if the user explicitly authorizes parallel agents in that thread. Recommended split: one agent for V2 Tact contracts, one for Jetton V2/Func integration, one for deployment scripts/mainnet parameters.

Browser automation is not required for this audit. Do not open or automate wallet browser profiles for audit work.

## Required Local Commands

Run baseline verification:

```bash
npm run typecheck
npm run tact:check
npm run tact:build
npm run test
npm run lint
```

Regenerate dry-run plans from current code:

```bash
TON_MAINNET_DEPLOYER_ADDRESS="UQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQfRq" \
TON_V2_METADATA_URI="ipfs://QmZkjBvKmHhsh56bPbbnwgPL8844eP5Btke6edbRGjPZNw" \
npm run jetton-v2:plan:mainnet

npm run plan:v2-tokenomics:mainnet
```

Run Misti static analysis:

```bash
npx @nowarp/misti@latest --version
npx @nowarp/misti@latest tact.config.json
npx @nowarp/misti@latest --all-detectors --output-format json tact.config.json > audit-artifacts/misti-all-detectors.json 2>&1
npx @nowarp/misti@latest --min-severity medium tact.config.json
```

Current baseline Misti artifact:

- `audit-artifacts/misti-all-detectors-post-souffle-2026-04-28.json/warnings.json`
- Souffle observed locally: `2.5`
- Misti version observed locally: `0.9.0-1aed1d4`
- Supported Tact version reported by Misti: `1.6.7+`

Use Tact tooling:

```bash
npx tact-fmt --check contracts
npx unboc build/tact/SeasonVault/SeasonVault_SeasonVault.code.boc
npx unboc build/tact/PresaleVault/PresaleVault_PresaleVault.code.boc
```

Use TON sandbox and transaction tracing in tests. TON docs recommend inspecting transactions and getter results with `@ton/test-utils`; the audit thread should add focused tests using `findTransaction`, `flattenTransaction`, failed bounce scenarios, and explicit exit code assertions.

Suggested targeted test additions:

- duplicate claim attempt
- wrong Jetton wallet sender
- wrong owner wallet in Jetton notification
- bounced outgoing Jetton transfer
- fake `JettonExcesses` before and after claim dispatch
- fake bounced `JettonTransfer` from a non-wallet sender
- bounced `JettonTransfer` from the correct wallet with the wrong amount
- true bounced `JettonTransfer` rollback followed by retry
- repeated `JettonExcesses` with same query id
- forged `ReserveVault.FinalizePrincipalRedeem` and forged `ReserveVault.JettonExcesses`
- forged `AppRewardPool.FinalizeRewardClaim` and forged `AppRewardPool.JettonExcesses`
- claim query id in the sweep-reserved namespace
- sweep immediately after claim-window expiry while bounce grace is still open
- sweep after bounce grace while a claim transfer is still pending
- owner settlement of pending claims before and after bounce grace
- presale buy when inactive
- presale stage cap boundary
- wallet cap boundary
- sweep before close
- sweep after partial sale
- route setter after funded state
- unlock stage out of order
- withdrawal over unlocked balance
- equal wallet cases, especially team wallet equals early users wallet

Use TON Symbolic Analyzer if available:

```bash
java -jar tsa-cli.jar tact --help
java -jar tsa-cli.jar tact -o audit-artifacts/tsa-season-claim.sarif contracts/archive/v2/SeasonClaim.tact
java -jar tsa-cli.jar tact -o audit-artifacts/tsa-presale-vault.sarif contracts/deployed/v3-core/PresaleVault.tact
```

The TSA command shape is based on the public TSA documentation. The audit thread must verify the installed TSA release and flags before treating output as authoritative.

## Manual Review Checklist

Review TON-specific risks:

- asynchronous message flow and out-of-order finalization
- bounced internal messages
- `sender()` assumptions for Jetton notifications and excesses
- wrong Jetton wallet source
- query id reuse
- forward payload encoding
- gas starvation and partial execution
- storage growth and unbounded maps
- `SendPayGasSeparately` versus value-carrying sends
- workchain/address formatting differences
- getter-only assumptions that cannot be enforced cross-contract

Review economic risks:

- total supply fixedness
- token allocation math sums exactly to total supply
- presale price math and TON decimal handling
- wallet cap math across stages
- unsold sweep destination
- development fund unlock policy
- team vesting unlock policy
- ecosystem approval and release authority

Review deployment risks:

- mainnet plan uses final metadata URI
- mainnet V2 Jetton plan and V2 tokenomics plan use matching code hashes
- initial supply owner equals tokenomics allocation admin
- admin is dropped only after mint and before tokenomics allocation run
- contract Jetton wallets are derived from the audited V2 wallet code
- all post-deploy route setters are completed before funding or locked after funding
- no old Capital/Reserve mainnet package is accidentally used for V2 tokenomics

## Expected Audit Outputs

The audit thread should produce:

1. Findings list with severity, exploit scenario, affected file/line, and recommended fix.
2. Tool output summary for Misti, Tact compiler, tests, and any TSA run.
3. New or updated tests for every confirmed bug.
4. Regenerated mainnet dry-run plans after fixes.
5. Fresh testnet rehearsal evidence after fixes.
6. Final go/no-go recommendation.

## References

- Tact docs and tooling: https://docs.tact-lang.org
- TON smart contract security overview: https://docs.ton.org/v3/guidelines/smart-contracts/security/overview
- Misti static analyzer docs: https://nowarp.io/tools/misti/docs/
- TSA runtime error detection: https://tonan.tech/modes/error-detection-mode.html
- OpenZeppelin preparing for mainnet: https://docs.openzeppelin.com/learn/preparing-for-mainnet
- OWASP Smart Contract Top 10: https://owasp.org/www-project-smart-contract-top-10/
