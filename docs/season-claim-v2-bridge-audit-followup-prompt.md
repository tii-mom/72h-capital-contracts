# SeasonClaimV2 Bridge Audit Follow-Up Prompt

Use this prompt in the audit thread after manual-forward bridge testnet phase 1.

```text
请复核 /Users/yudeyou/Desktop/72h-capital-contracts 当前工作区的 SeasonClaimV2 manual-forward legacy bridge 状态。

背景：

- 8 个 72H V2 主网核心合约已经部署并验证完成；本次不是复核既有主网部署，也不要发送任何主网交易。
- 现在复核的是 900 亿 Season War 大规模领取的候选迁移路线：`SeasonClaimV2` + `SeasonClaimV2LegacyBridge`。
- 主网 `SeasonVault` 已经 funded，不能把既有 900 亿路线直接 retarget 到新的 `SeasonClaimV2`。
- 因此当前候选路线是保留已部署的 `SeasonVault -> legacy SeasonClaim`，再通过 manual-forward bridge 把 legacy payout 进入 `SeasonClaimV2`。

上一轮 P1：

- legacy `SeasonClaim` claim payout 的 JettonTransfer 使用 `forwardTonAmount: 0`。
- 生产 Jetton wallet 只有 `forward_ton_amount` 非零时才给接收方合约发送 `transfer_notification`。
- 所以 bridge 不能等待 legacy `JettonTransferNotification`。

当前修复设计：

- bridge 不再处理 legacy `JettonTransferNotification` 作为成功证明。
- bridge 发起 legacy single-leaf claim 后，只把 legacy payout 送进 bridge-owned Jetton wallet。
- operator 链上确认 bridge Jetton wallet 余额增加。
- owner 调用 `ForwardBridgeWalletToV2(queryId, amount72H)`。
- bridge 只能从固定 `bridgeJettonWallet` forward 到固定 `SeasonClaimV2`。
- `SeasonClaimV2` 收到真实 funding notification 后，发送 `ConfirmSeasonClaimFunding` 给 bridge。
- bridge 只在收到固定 `SeasonClaimV2` 的匹配 amount confirmation 后 finalize。
- 如果 bridge wallet 余额不足，Jetton transfer bounce，bridge 清 pending forward，可用新 query 重试。

testnet phase 1 结果：

- Evidence: `deployments/season-claim-v2-legacy-bridge.testnet.latest.json`
- Timestamped evidence: `deployments/season-claim-v2-legacy-bridge.testnet.2026-04-28T14-46-27-843Z.json`
- Status: `bridge-forward-complete-pending-legacy-settle`
- Legacy SeasonClaim: `kQBFDtxtg2HXPBFoSvPMy0KwyZq4jI294bfwL35NixnDUtH4`
- SeasonClaimV2: `kQDEELj9KCzdqT07sVp4FRnbZRo-QhjS5ig0N6lcpJDGcn0H`
- Bridge: `kQAXCCNSnY_MmBJwjrJi4zRIvli1p1zi1GtP7L0wf0WaP_l5`
- Bridge Jetton wallet: `kQA5J_1iZ5HPIyFF0nL_4qScWAq-B_QvZGu1ctmjTCY-K157`
- V2 Jetton wallet: `kQCJbmU0LEqcflqQFrqIiDv8GfXYuFx9Iu6ndAUmZDIAgKyD`
- Legacy claim query id: `1777387300691001`
- Manual forward query id: `16191587300691002`
- Rehearsal amount: `1000000000` raw units
- SeasonClaimV2 code hash: `99b63712844f6032a34b10e52b2e8daa0eebc2e265603cc2176a5df7f6e02c26`
- Bridge code hash: `86f767f5d56675c0b9c11c76f949022e4ddc1b12cb318a3c5f0a1105c3b83c76`

Verified phase 1 getter snapshot:

- legacy `claimed72H = 1000000000`
- legacy `pendingClaimAmount = 1000000000`
- bridge `forwardedToV272H = 1000000000`
- bridge `pendingForward72H = 0`
- bridge `completedForwardAmount = 1000000000`
- SeasonClaimV2 `funded72H = 1000000000`
- bridge Jetton wallet balance is `0`
- SeasonClaimV2 Jetton wallet balance is `1000000000`

Why final cleanup is delayed:

- legacy `SeasonClaim` records claim pending before sending JettonTransfer.
- legacy `SettleSeasonClaimPending(queryId)` has an on-chain 72-hour bounce grace requirement: `now() > pendingOpenedAt + SEASON_CLAIM_BOUNCE_GRACE_SECONDS`.
- The testnet pending query `1777387300691001` is not settleable until `2026-05-01T14:45:31Z`.
- A live attempt before that time is rejected by the script before send, and the contract would reject it with `claim bounce grace`.

Request:

1. Please confirm whether the manual-forward bridge phase 1 evidence is sufficient to continue preparing a mainnet migration plan/runbook as a draft only.
2. Please explicitly state whether `legacy pending cleanup complete` must remain a hard gate before any mainnet signing package, deployment, or bridge transaction is generated.
3. Please review `docs/season-claim-v2-mainnet-migration-runbook.md`, which is marked `BLOCKED UNTIL TESTNET LEGACY PENDING CLEANUP COMPLETE`.
4. Please look for any remaining P1/P2 blockers in:
   - `contracts/SeasonClaimV2.tact`
   - `contracts/SeasonClaimV2LegacyBridge.tact`
   - `tests/season-claim-v2-legacy-bridge.spec.ts`
   - `scripts/rehearse-season-claim-v2-legacy-bridge-testnet.ts`
   - `docs/season-claim-v2-mainnet-migration-runbook.md`

Do not send mainnet transactions. Do not generate or approve a mainnet TonConnect signing package unless the testnet legacy pending cleanup has completed and evidence status is `complete`.
```

