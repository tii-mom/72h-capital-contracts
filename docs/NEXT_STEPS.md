# Next Steps

This is the current project-owner checklist after the 72H V3 mainnet facts freeze.

## Current V3 Baseline

- Official V3 Jetton master: `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3`.
- Canonical facts:
  - `docs/72H_MAINNET_FACTS.json`
  - `docs/72H_MAINNET_FACTS.md`
  - `docs/72h-v3-contract-facts-freeze-note.md`
  - `integrations/website/72h-v3-mainnet.json`
- V2 and pre-V2 addresses are frozen archive only. They must not be used as `current`, `latest`, or default mainnet integration values.

## Done

- V3 mainnet token and seven tokenomics contracts are deployed and verified.
- Website V3 facts route is online at `/contracts/72h-v3-mainnet.json`.
- Website and WAN expose read-only `/api/ops/config` endpoints with V3 master and disabled presale/claim/buy flags.
- `ops.tai.lat` monitors public facts, TON Jetton state, app config, app health, and forbidden flags.

## Required Before Another Mainnet Operation

- Run and pass:
  - `npm run verify:mainnet-launch-gates`
  - `npm run verify:v3-mainnet-postdeploy`
  - `npm run verify:multi-millionaire-v3-gates`
- Keep `PresaleVault` inactive. Do not call `SetPresaleActive(active: true)` without a separate audited launch approval and explicit owner approval.
- Do not publish `SeasonClaimV2` roots until the game export, Merkle root, proof/export evidence, and owner approval are complete.
- Do not deploy any `contracts/apps/multi-millionaire/v3` mainnet contract until audit/review, testnet canary evidence, mainnet canary window, amount cap, rollback owner, and owner approval are recorded.

## Near-Term Product Work

- Finish multi-millionaire reward export and SeasonClaimV2 root runbook in a separate approval flow.
- Finish presale launch audit/runbook in a separate approval flow.
- Keep app repositories consuming the V3 facts from this contracts repository or the published website JSON.
- Confirm wallet/explorer/exchange metadata display against the V3 master, not archived V2.
