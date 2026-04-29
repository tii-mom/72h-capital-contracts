# SeasonClaimV2 Stable Interface

Status: `DRAFT STABLE - NOT MAINNET DEPLOYED`

Interface version: `season-claim-v2-interface-2026-04-29`

This document pins the app-facing and operator-facing `SeasonClaimV2` and `SeasonClaimV2LegacyBridge` interface surface for future dry-runs. It does not authorize deployment, funding, or root registration.

## Code Hashes

| Contract | Code hash |
| --- | --- |
| `SeasonClaimV2` | `99b63712844f6032a34b10e52b2e8daa0eebc2e265603cc2176a5df7f6e02c26` |
| `SeasonClaimV2LegacyBridge` | `86f767f5d56675c0b9c11c76f949022e4ddc1b12cb318a3c5f0a1105c3b83c76` |

The generated wrappers and ABI files are produced by `npm run tact:build` under:

- `build/tact/SeasonClaimV2/SeasonClaimV2_SeasonClaimV2.ts`
- `build/tact/SeasonClaimV2/SeasonClaimV2_SeasonClaimV2.abi`
- `build/tact/SeasonClaimV2LegacyBridge/SeasonClaimV2LegacyBridge_SeasonClaimV2LegacyBridge.ts`
- `build/tact/SeasonClaimV2LegacyBridge/SeasonClaimV2LegacyBridge_SeasonClaimV2LegacyBridge.abi`

## SeasonClaimV2 Messages

| Message | Opcode | Fields |
| --- | ---: | --- |
| `SetSeasonClaimJettonWallet` | `0x72070001` | `wallet` |
| `RegisterClaimRound` | `0x72070002` | `roundId`, `merkleRoot`, `totalAmount72H`, `openAt`, `evidenceHash` |
| `UnlockClaimStage` | `0x72070003` | `stage`, `priceUsd9`, `observedAt`, `evidenceHash` |
| `ClaimSeasonReward` | `0x72070004` | `queryId`, `seasonId`, `personalDepositAmount72H`, `teamDepositAmount72H`, `referralAmount72H`, `leaderboardAmount72H`, `proof` |
| `SweepExpiredClaimRound` | `0x72070006` | `roundId` |
| `SetSeasonClaimSeasonVault` | `0x72070007` | `seasonVault` |
| `SettleSeasonClaimPending` | `0x72070008` | `queryId` |
| `RegisterSeasonClaim` | `0x72070009` | `seasonId`, `merkleRoot`, `totalAmount72H`, `personalDepositTotal72H`, `teamDepositTotal72H`, `referralTotal72H`, `leaderboardTotal72H`, `openAt`, `evidenceHash` |
| `SweepExpiredSeasonClaim` | `0x7207000a` | `seasonId` |
| `ConfirmSeasonClaimFunding` | `0x7207000b` | `queryId`, `amount72H` |

## SeasonClaimV2 Getters

Stable getter names:

```text
getUnlockedBps
getRewardAppId
getPersonalDepositBps
getTeamDepositBps
getReferralBps
getLeaderboardBps
getFunded72H
getReserved72H
getClaimed72H
getRoundRoot(roundId)
getSeasonRoot(seasonId)
getRoundTotal(roundId)
getSeasonTotal(seasonId)
getSeasonPersonalDepositTotal(seasonId)
getSeasonTeamDepositTotal(seasonId)
getSeasonReferralTotal(seasonId)
getSeasonLeaderboardTotal(seasonId)
getRoundClaimed(roundId)
getSeasonClaimed(seasonId)
getClaimedByLeaf(leaf)
getPendingClaimAmount(queryId)
getPendingClaimOpenedAt(queryId)
getPendingClaimAmountByRound(roundId)
getPendingClaimAmountBySeason(seasonId)
getClaimWindowSeconds
getBounceGraceSeconds
```

## Bridge Messages

| Message | Opcode | Fields |
| --- | ---: | --- |
| `SetSeasonClaimV2BridgeJettonWallet` | `0x72071001` | `wallet` |
| `ClaimLegacySeasonForV2` | `0x72071002` | `queryId`, `seasonId`, `personalDepositAmount72H`, `teamDepositAmount72H`, `referralAmount72H`, `leaderboardAmount72H`, `expectedClaimAmount72H`, `proof` |
| `ForwardBridgeWalletToV2` | `0x72071003` | `queryId`, `amount72H` |
| `SetSeasonClaimV2BridgeTarget` | `0x72071004` | `seasonClaimV2` |

Bridge query namespace rules:

- legacy claim query id must be `< 7207000600000000`
- manual forward query id must be `>= 14414200000000000`

## Bridge Getters

Stable getter names:

```text
getLegacyClaimRequested72H
getForwardedToV272H
getPendingForward72H
getExpectedAvailableToForward72H
getPendingLegacyAmount(queryId)
getPendingForwardAmount(queryId)
getCompletedForwardAmount(queryId)
getConfigurationLocked
```

## Selected Errors

| Contract | Code | Message |
| --- | ---: | --- |
| `SeasonClaimV2` | `6437` | `invalid proof bits` |
| `SeasonClaimV2` | `11815` | `invalid proof refs` |
| `SeasonClaimV2` | `26047` | `invalid wallet sender` |
| `SeasonClaimV2` | `33336` | `invalid bounced amount` |
| `SeasonClaimV2` | `35392` | `claim bounce grace` |
| `SeasonClaimV2` | `48137` | `owner only` |
| `SeasonClaimV2` | `49425` | `empty proof continuation` |
| `SeasonClaimV2LegacyBridge` | `12332` | `forward query completed` |
| `SeasonClaimV2LegacyBridge` | `13195` | `amount exceeds expected inventory` |
| `SeasonClaimV2LegacyBridge` | `18947` | `invalid forward confirm amount` |
| `SeasonClaimV2LegacyBridge` | `25405` | `manual forward query required` |
| `SeasonClaimV2LegacyBridge` | `45945` | `forward query pending` |
| `SeasonClaimV2LegacyBridge` | `49126` | `season claim v2 only` |
| `SeasonClaimV2LegacyBridge` | `50664` | `wallet locked after activity` |
| `SeasonClaimV2LegacyBridge` | `61102` | `legacy query reserved` |

## Events

There are no custom emitted events in this interface version. Consumers must use transactions, Jetton wallet notifications, and getters as evidence.

## Drift Check

Run:

```bash
npm run assert:season-claim-v2-interface
```

The assertion checks the pinned code hashes, message opcodes, message fields, getter names, selected error codes, and generated wrapper presence.

