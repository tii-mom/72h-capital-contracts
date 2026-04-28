# 72H V2 Tokenomics Contract Spec

## Goal

Build 72H V2 as a standard, easy-to-verify Jetton plus small external contracts.

The token contract stays simple. It only mints the fixed supply once, distributes it, then disables admin control. All game rules, presale rules, and vesting rules live outside the Jetton.

## Final Contract Set

1. `72H V2 Jetton`
   - Standard Jetton master/wallet.
   - Total supply: `100,000,000,000 72H`.
   - Decimals: `9`.
   - Mint once, then set `mintable=false` and disable admin.
   - No tax, blacklist, whitelist, pause, sell limit, forced transfer, forced burn, hidden mint, or migration logic.

2. `SeasonVault`
   - Holds the 90B season inventory.
   - 4 hours per round.
   - 18 rounds per season.
   - 10 seasons max.
   - Each round uses a fixed `500,000,000 72H`.
   - Successful round: accrues the round amount inside the season reward inventory.
   - After all 18 rounds in a season are recorded, owner finalizes that season and sends the accumulated successful-round amount to `SeasonClaim`.
   - Failed round: sends the round amount to `FundVesting`.
   - Admin cannot withdraw to a wallet.

3. `SeasonClaim`
   - Holds successful-round user rewards.
   - `multi-millionaire` is the source app for participation, deposit, team, invite, and leaderboard allocation data.
   - `/Desktop/72` is display/navigation only. It shows price, season/round progress, countdowns, and claimable values, then routes users to `multi-millionaire` for participation.
   - On-chain contract stores one Merkle root per season after the 18-round season is complete and finalized.
   - Users claim with a Merkle proof and pay their own gas.
   - Each successful round allocates `500,000,000 72H` using the fixed four-pool split:
     - 50% personal deposit rewards: `250,000,000 72H`
     - 25% team deposit rewards: `125,000,000 72H`
     - 15% invite/new-user rewards: `75,000,000 72H`
     - 10% leaderboard rewards: `50,000,000 72H`, split by the `multi-millionaire` export between team and personal deposit leaderboards.
   - Failed rounds are not claimable by users and route their `500,000,000 72H` to `FundVesting`.
   - Claims unlock by price stage:
     - `$0.01`: cumulative 20%
     - `$0.03`: cumulative 40%
     - `$0.05`: cumulative 60%
     - `$0.07`: cumulative 80%
     - `$0.10`: cumulative 100%
   - Each price level must be held for 72 hours before unlock.
   - Claim window: 60 days after the claim round is opened.
   - Expired unclaimed rewards can be swept back to `SeasonVault` only after an additional 72-hour bounce grace window and after pending claim transfers are either bounced or settled.

4. `FundVesting`
   - Receives failed-round allocations.
   - Only used for the 90B SeasonVault failure path.
   - Cannot release immediately.
   - Uses the same price unlock schedule:
     - `$0.01`: cumulative 20%
     - `$0.03`: cumulative 40%
     - `$0.05`: cumulative 60%
     - `$0.07`: cumulative 80%
     - `$0.10`: cumulative 100%
   - Each price level must be held for 72 hours.
   - Withdrawals go only to the configured public fund wallet.
   - Each withdrawal records a purpose hash.

5. `DevelopmentFund`
   - Holds normal development-fund inventory.
   - Receives initial development allocation and unsold presale tokens.
   - No price lock.
   - Admin can withdraw at any time.
   - Each withdrawal records destination and purpose hash.

6. `PresaleVault`
   - Sells `4,500,000,000 72H`.
   - 3 stages, each `1,500,000,000 72H`.
   - TON only in V1 for simple contract logic.
   - Stage prices are deployment parameters.
   - Per-wallet cap is a deployment parameter.
   - Unsold tokens are swept to the unlocked `DevelopmentFund`, not to `FundVesting`.

7. `EcosystemTreasury`
   - Holds `4,500,000,000 72H`.
   - Can only fund approved app/reward contracts.
   - Cannot freely send to normal wallets unless that address has been explicitly approved as a contract target.
   - Each funding action records a purpose hash.

8. `TeamVesting`
   - Holds `300,000,000 72H`.
   - Releases `100,000,000 72H` per stage.
   - Stage thresholds:
     - `$0.1`
     - `$0.5`
     - `$1`
   - Each price level must be held for 72 hours.
   - Releases only to the configured team wallet.

## Allocation

- Season reward/game vault: `90,000,000,000 72H`
- Presale: `4,500,000,000 72H`
- Ecosystem treasury: `4,500,000,000 72H`
- Development fund initial allocation: `500,000,000 72H`, plus any unsold presale inventory
- Team vesting: `300,000,000 72H`
- Early users and operations wallet: `200,000,000 72H`

## Off-chain Responsibilities

The contracts do not calculate market data or scan holders.

Off-chain scripts must:

- Read the official DEX pool.
- Calculate each 4-hour round start/end price.
- Decide whether the round succeeded.
- Keep `/Desktop/72` display data in sync with the same season/round status.
- Export eligible `multi-millionaire` users for each completed successful season.
- Calculate each user's personal deposit, team deposit, invite/new-user, and leaderboard allocation.
- Exclude project wallets, contract wallets, DEX pool wallets, and known operational wallets.
- Generate the season reward file.
- Generate the Merkle root.
- Publish the evidence file.
- Submit the 18 round results, finalize the season, and register the season claim root on-chain.

## Presale Recommendation

Use TON only for the first version.

Reason:

- TON is native.
- Buyer flow is simpler.
- Contract code is smaller.
- Fewer wallet/Jetton edge cases.
- Easier to test and explain.

USDT can be added later as a separate presale contract if needed.

## Parameters Still Needed Before Testnet

- Admin wallet address.
- Public fund wallet address.
- Team wallet address.
- Presale proceeds wallet address.
- Early-user/operations wallet address.
- Presale stage prices, expressed as `72H per 1 TON`.
- Presale per-wallet cap.
- Final metadata URI and logo URI.
- Official DEX pool address after pool creation.

## Safety Rules

- The Jetton contract must stay standard and permissionless after launch.
- Season funds cannot go to admin or team wallets.
- Failed-round funds cannot be withdrawn before price unlock.
- User reward eligibility is proved by Merkle root, not by admin manually sending tokens.
- Presale TON proceeds can be withdrawn only to the configured proceeds wallet; unsold 72H goes to the unlocked DevelopmentFund and cannot go to team/admin.
- Only failed-round allocations from the 90B SeasonVault are price-locked in FundVesting.
- All price decisions must include public evidence hashes.
- Jetton wallet addresses are locked after funding starts, so admin cannot retarget a funded contract to another Jetton wallet.
- Presale buys are restricted to the active sale stage. The admin must close presale before changing stage.
- Outbound Jetton transfers roll back accounting on bounce where a failed transfer could otherwise leave stale withdrawal, release, claim, or allocation records.
- SeasonClaim commits user claim accounting before dispatch, ignores unauthenticated `JettonExcesses`, rolls back only on a bounced transfer from the configured claim Jetton wallet, and blocks expired-round sweep while claim transfers remain pending.

## Internal Pre-Testnet Review Notes

The first internal review before testnet deployment found and fixed these blockers:

- Presale stage selection was user-controlled. It now requires the active stage.
- Fund, team, ecosystem, presale, and season transfers lacked consistent bounce rollback. Critical outgoing Jetton paths now roll back accounting on bounce.
- Claim finalization could be spoofed through a public finalize path. Claim accounting is now committed before dispatch; unauthenticated excesses are ignored, true source-wallet bounces roll back, and pending claims must be bounced or owner-settled after grace before sweep.
- Funded contracts could change their Jetton wallet after receiving tokens. Wallet setters now fail after funding/release accounting starts.
- Returned expired SeasonClaim inventory could not be accepted by SeasonVault without exceeding the original cap. SeasonVault now treats returns from the claim contract as allocation release, not fresh funding.
