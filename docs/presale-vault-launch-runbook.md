# PresaleVault Launch Runbook

Status: `BLOCKED - DO NOT ACTIVATE MAINNET PRESALE`

This runbook tracks the presale launch path after the post-review hardening work. It is not a signing package and does not authorize opening sales.

## Current Decision

Do not activate the currently deployed mainnet `PresaleVault`.

Reason: `contracts/PresaleVault.tact` has been hardened after the mainnet deployment. The deployed mainnet contract code hash remains the historical deployment hash and cannot be upgraded in place.

| Item | Value |
| --- | --- |
| Deployed mainnet `PresaleVault` | `EQCj56OaGFtIBgdtQjIacb7s1jlEy93vh-93PU07MDR1vpE9` |
| Deployed mainnet code hash | `d0458deb2bc69870977e003c5da36c2e806cce29422e6720afaa497b0ec3a63b` |
| Hardened local candidate code hash | `5951893d33ce3937961703516c2f8bcd48bf0c146dbc29d228af346ea4e6cf9e` |
| Mainnet presale inventory wallet | `EQDcJf-sGJvWS6dG24SUStX9UYg9ZQEvMxXTh4TJfZ7Ww-96` |
| Mainnet presale inventory | `4,500,000,000 72H` |

## Hardened Candidate Changes

The local candidate now requires:

- authenticated `JettonExcesses` from the configured presale Jetton wallet before purchase or sweep pending state is finalized
- forged `JettonExcesses` cannot clear purchase pending state
- owner TON withdrawal is limited to settled sale proceeds, not pending purchase proceeds
- purchase inventory checks subtract already swept unsold inventory
- sweep is blocked while purchases or another sweep are pending
- sweep query ids cannot be reused after completion
- presale cannot be reopened after unsold inventory has been swept unless the sweep bounced and fully rolled back

Covered by `tests/72h-v2-tokenomics.spec.ts`.

## Blocked Actions

Do not sign or send:

- `SetPresaleActive(active: true)`
- `BuyPresale`
- `WithdrawPresaleTon`
- `SweepUnsoldPresale`
- any sales frontend configuration that points users at the deployed mainnet `PresaleVault`

## Acceptable Work Before Unblock

Allowed:

- publish marketing, docs, and read-only token/contract information
- prepare sales FAQ with a clear "not open yet" status
- run local and testnet rehearsals against the hardened candidate
- run Misti high severity and external audit follow-up
- draft a new presale funding route

Not allowed:

- accepting real user funds through `PresaleVault`
- instructing users to call `BuyPresale`
- activating the deployed mainnet `PresaleVault`
- generating TonConnect packages containing presale activation, buy, sweep, or withdrawal payloads

## Required Route Before Sales

Before sales can open, the team must choose and audit one route:

1. Deploy a new hardened presale contract and fund it through an approved inventory source that is not trapped in the old `PresaleVault`.
2. Keep the deployed `PresaleVault` closed and run no contract sale.
3. Obtain explicit external audit acceptance and owner risk approval for using the deployed `PresaleVault` despite the local hardening delta.

Route 3 is not recommended under the current blocker policy.

## Final Presale Go/No-Go Checklist

Sales remain blocked until all are true:

- hardened candidate tests pass
- `npm run verify:mainnet-launch-gates` passes
- Misti high severity reports no errors for the exact sale candidate
- external audit has no P1/P2 presale blocker
- owner custody runbook evidence is prepared
- exact funding source and contract address are reviewed
- two-person review approves the signing package
- public sales frontend uses the reviewed contract address and stage parameters

