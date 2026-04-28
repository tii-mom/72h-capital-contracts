# 72H V2 主网就绪状态

状态：owner 已通过 Tonkeeper 批准并完成主网部署，链上验收通过。fixed-supply Jetton 已一次性铸造，mint 权限已移除，7 个 V2 tokenomics 合约均为 active，最终分配余额与 refreshed mainnet plan 一致。

日期：2026-04-28

主网部署证据：`deployments/72h-v2-mainnet.deployed-2026-04-28.md`

## 当前主网部署

当前主网部署是 V2 fixed-supply Jetton 加 V2 tokenomics 合约：

- V2 Jetton Func 源码：`contracts/jetton-v2/*.fc`
- V2 tokenomics Tact 合约：`contracts/SeasonVault.tact`、`contracts/SeasonClaim.tact`、`contracts/FundVesting.tact`、`contracts/DevelopmentFund.tact`、`contracts/PresaleVault.tact`、`contracts/EcosystemTreasury.tact`、`contracts/TeamVesting.tact`
- V2 集成测试：`tests/jetton-v2.spec.ts`、`tests/72h-v2-tokenomics.spec.ts`
- V2 testnet rehearsal 脚本：`scripts/rehearse-72h-v2-tokenomics-testnet.ts`
- V2 mainnet dry-run plan 脚本：`scripts/plan-72h-v2-tokenomics-mainnet.ts`

不要把旧 Capital/Reserve/AppRewardPool TonConnect package 当作 V2 tokenomics 部署包。旧文件已从默认签名文件名下移走，改名为 `deployments/legacy-mainnet.tonconnect.void-2026-04-28.json` 和 `deployments/legacy-mainnet-deploy.void-2026-04-28.html`。

## 已完成证据

本地验证已完成：

```bash
npm run tact:build
npm run lint
npm run build
```

结果：

- TypeScript typecheck 通过。
- Tact `--check` 通过。
- Tact build 通过。
- TypeScript build 通过。
- Vitest 通过：7 个测试文件，65 个测试。

2026-04-28 改版后的本地验证：

- `SeasonVault` 的成功轮次先累计在赛季内，18 轮完成后由 owner finalize 到 `SeasonClaim`。
- `SeasonClaim` 每个赛季注册一个 root，并校验个人存款、组队存款、邀请、榜单四个池子的固定总额。
- `multi-millionaire` 生成与 `SeasonClaim` 一致的叶子：app id `1`、token 地址、SeasonClaim 地址、season id、wallet、四池金额、total amount。
- `/Desktop/72` 只做展示和跳转，不作为奖励分配数据源。

新的 post-season-redesign testnet V2 evidence：

- Jetton manifest：`deployments/jetton-v2.testnet.latest.json`
- Tokenomics evidence：`deployments/72h-v2-tokenomics.testnet.latest.json`
- 带时间戳 Jetton manifest：`deployments/jetton-v2.testnet.2026-04-28T03-39-57-258Z.json`
- 带时间戳 tokenomics evidence：`deployments/72h-v2-tokenomics.testnet.2026-04-28T04-01-28-080Z.json`
- Testnet V2 Jetton master：`kQDJqdAP9DR5NGV7EDg6T78EuNqmuKsbpEhQJSrFxTm8rjtK`
- Testnet SeasonVault：`kQDO6EIylsZff48kCNji0mdjrpeFlDQz681quAyFyns-Bd44`
- Testnet SeasonClaim：`kQBd5rP4rtz9jByQG3hntvdqT__zzLyHAiMvSGNiST3T5SeF`
- Testnet FundVesting：`kQDE3XDJ9qyyhFhH3nMBKYNJqlUb6J0PUP24f0r5JqVGUZjs`
- Testnet PresaleVault：`kQAomKOiWMwaURt-A-DPGWj9TI2UNL1GHnD998HmmJsQpJFC`

Post-season-redesign testnet rehearsal 已完成：

```bash
TON_TESTNET_ALLOW_JETTON_V2_DEPLOY_SEND=true TON_V2_METADATA_URI="https://72h.lol/testnet/72h-v2-season-reward-confirm-2026-04-28.json" npm run jetton-v2:deploy:testnet:send
TON_TESTNET_ALLOW_72H_V2_TOKENOMICS_REHEARSAL_SEND=true npm run rehearse:v2-tokenomics:testnet:send
```

新的 final getter evidence 已确认：

- 测试 burn 后 V2 Jetton supply：`99999999999000000000`
- V2 Jetton `mintable=false`
- V2 Jetton `adminAddress=null`
- SeasonVault 在 17 个成功轮、1 个失败轮后，season 1 finalized user rewards 为 `8500000000000000000` raw。
- FundVesting 收到失败轮 `500000000000000000` raw，并成功 withdraw 第一档解锁的 `100000000000000000` raw。
- SeasonClaim 完成四池 totals 注册和第一档 claim 路径。
- DevelopmentFund、PresaleVault、EcosystemTreasury、TeamVesting 均达到预期 rehearsal 状态。
- 7 个 tokenomics code hash 和 allocation raw values 与 refreshed mainnet plan 一致。

## 主网 Dry-Run 计划

已生成 dry-run 计划：

- `deployments/jetton-v2.mainnet.plan.json`
- `deployments/72h-v2-tokenomics.mainnet.plan.json`

本次主网部署使用的 V2 TonConnect package：

- `deployments/72h-v2-mainnet.tonconnect.json`
- `deployments/72h-v2-mainnet-deploy.html`
- 生成时间：`2026-04-28T04:02:13.986Z`

当前计划中的 V2 mainnet Jetton master：

- `EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg`

当前计划中的 V2 tokenomics 合约地址：

- SeasonVault：`EQCdSSWPVbwh9zIzhF5pnxwRKw-I8xc4bS1iyiVcbXKfnWe-`
- SeasonClaim：`EQCYvg-_oFE8q8cweVScna-WDRzDYol-FBwHKuTcAjcFGonS`
- FundVesting：`EQDO0AMsITst5rWGcabJ8OF7Ys079UMPGNOq9H8WtiJakID4`
- DevelopmentFund：`EQAPkdB1YJDEsVixATzfDjf--yl0frlKRkLPYHHUv6nVFkEU`
- PresaleVault：`EQCj56OaGFtIBgdtQjIacb7s1jlEy93vh-93PU07MDR1vpE9`
- EcosystemTreasury：`EQARGC33uqypROhxiJMVOeKPYbYRgAEhXUkTxkrK7CrKDP3O`
- TeamVesting：`EQD5PnUEuEUYBt1XktTPlvN7HE5n-AIBI4XiAyd4qUgHasrK`

本次赛季统一结算和失败轮确认路径修复后的 mainnet tokenomics dry-run plan 已在 `2026-04-28T03:39:18.426Z` 刷新。owner 随后已批准并签署匹配的 V2 TonConnect package 完成主网部署。

## 最终签名前刷新

2026-04-27 package 和更早的 2026-04-28 package 已因赛季奖励改版和失败轮确认路径修复过期，不能签名。

最终刷新已完成：

- fresh testnet V2 Jetton
- fresh `deployments/72h-v2-tokenomics.testnet.latest.json`
- fresh `deployments/72h-v2-tokenomics.mainnet.plan.json`
- fresh `deployments/72h-v2-mainnet.tonconnect.json`
- fresh `deployments/72h-v2-mainnet-deploy.html`

已完成的机械核对：

- 本地 build code hash 与刷新后的 mainnet plan、fresh testnet evidence 中 7 个 V2 tokenomics 合约全部一致
- mainnet plan allocation raw values 与 fresh testnet evidence 全部一致
- allocation raw sum 等于 fixed total supply：`100000000000000000000`
- 刷新后的 TonConnect package 中每个 deploy `stateInit` 都能派生出计划地址
- 每个 tokenomics deploy `stateInit` 的 code hash 和 data hash 均匹配刷新后的 mainnet plan
- 每个 allocation JettonTransfer payload 的 amount 和 destination 均匹配刷新后的 mainnet plan

最终 batch 顺序：

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

## 已知修复

本 readiness note 前已修复的 testnet 和审计发现：

1. Tact 合约现在将 V2 Jetton `forwardPayload` 编码为 inline empty `Either.left`，不再编码为空 slice，避免标准 V2 wallet `cell underflow`。
2. V2 Jetton minter 现在会在 admin 被 drop 前强制检查 `100,000,000,000 72H` total supply cap。
3. `SeasonClaim` 现在先提交 claim accounting 再 dispatch，并忽略未认证的 `JettonExcesses`；只有来自 `claimJettonWallet` 的 bounced transfer 才能回滚 pending claim。该修复关闭 fake-excess finalization 路径。
4. `SeasonClaim` 对同一个 Merkle leaf 的重复 pending claim 已通过即时 claimed accounting 阻止，并由 duplicate/retry 测试覆盖。
5. `PresaleVault` 现在跟踪 `hasBeenActive`，并拒绝 presale 从未打开过时提前 sweep unsold。
6. `SeasonClaim` claim window 现在是 60 天，之后还有 72 小时 bounce grace period，过后才允许 sweep。
7. `SeasonClaim` 按 round 跟踪 pending claim amount，要求 sweep 前该 round pending claims 为 0，支持 owner 在 bounce grace 后 settlement pending claims，并保留 sweep query-id namespace。
8. `SeasonClaim` 和 `FundVesting` 现在使用已批准的五档累计解锁计划：`$0.01`、`$0.03`、`$0.05`、`$0.07`、`$0.10`，每档保持 72 小时，每档额外释放 20%。
9. 所有 repository 中的 JettonTransfer bounce handlers 现在都会用合约配置的 Jetton wallet 认证 bounce sender，并在清 pending 或回滚余额前校验 bounced amount 与本地 pending accounting 一致。覆盖范围包括 `SeasonVault`、`SeasonClaim`、`FundVesting`、`DevelopmentFund`、`PresaleVault`、`EcosystemTreasury`、`TeamVesting`、`ReserveVault`、`AppRewardPool`。
10. `ReserveVault` 和 `AppRewardPool` 的 success finalization handlers 现在会认证 `JettonExcesses` 和显式 `Finalize*` 消息必须来自配置的 source Jetton wallet，之后才允许清 pending state 或扣减 accounting。
11. `SeasonVault` 的失败轮现在必须等 `FundVesting` 确认它已从配置 Jetton wallet 收到真实转账后，才清除 pending。这样不再依赖 `JettonExcesses` 作为失败轮到账证明，并避免后续 bounce 造成 round-history gap。

当前修复均由本地测试和 fresh testnet rehearsal 覆盖。除非明确把旧 Capital/Reserve package 纳入部署范围，否则 `ReserveVault` 和 `AppRewardPool` 不属于 7-contract V2 tokenomics rehearsal。

## 静态分析基线

Misti 0.9.0 已在安装 Souffle 2.5 后、并在 SeasonVault 失败轮确认路径修复后用 all detectors 执行：

```bash
npx @nowarp/misti -A -o json -O audit-artifacts/misti-all-detectors-post-souffle-2026-04-28.json contracts
```

该命令因为发现 warnings 而返回非 0。Misti 日志显示 41 个 enabled detectors，包括 `DivideBeforeMultiply`、`ReadOnlyVariables`、`UnboundLoop`；安装 Souffle 后没有 disabled-detector warning。摘要如下：

- 输出 artifact：`audit-artifacts/misti-all-detectors-post-souffle-2026-04-28.json/warnings.json`
- Total warnings：418
- `SuboptimalSend`：21
- `UnusedExpressionResult`：3
- `PreferredStdlibApi`：308
- `UnboundMap`：71
- `PreferGlobalFunction`：14
- `AsmIsUsed`：1

这些 warning 不全是可利用漏洞，但审计线程应 triage 最新 artifact。warning 增加主要来自新的 SeasonVault/FundVesting 确认发送路径以及既有 gas/style/unbounded-map 类问题。唯一 severity-1 项是 `SeasonClaim` 的 `HASHCU` helper 被标记为 `AsmIsUsed`；`UnusedExpressionResult` warnings 仍位于 `AdminMultisig.tact`，除非旧 Capital/Reserve package 也要部署，否则不属于当前 V2 tokenomics deployment。

## 主网部署结果

最终操作前条件已关闭，owner 已通过 Tonkeeper 批准主网发送。部署证据记录在 `deployments/72h-v2-mainnet.deployed-2026-04-28.md`。

最终链上检查已通过：

1. V2 Jetton total supply 为 `100000000000000000000` raw。
2. V2 Jetton `mintable=0`。
3. V2 Jetton `admin=null`。
4. 8 个核心合约全部 active。
5. Admin Jetton wallet 最终余额为 `0`。
6. 最终 allocation balances 与 refreshed mainnet plan 一致。

## 参考

- OpenZeppelin mainnet preparation: https://docs.openzeppelin.com/learn/preparing-for-mainnet
- OWASP Smart Contract Top 10: https://owasp.org/www-project-smart-contract-top-10/
- TON security overview: https://docs.ton.org/v3/guidelines/smart-contracts/security/overview
- Tact tooling and security tools: https://docs.tact-lang.org
- Misti static analyzer: https://nowarp.io/tools/misti/docs/
