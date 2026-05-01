# Deployment

This page is legacy deployment guidance for the earlier Capital/Reserve/AppRewardPool package. The current V3 mainnet facts are in `72H_MAINNET_FACTS.md`, and current deployed Tact sources live under `../contracts/deployed/v3-core/`.

The older Capital/Reserve/AppRewardPool sources are now retained under `../contracts/supporting/`. They are not part of the deployed V3 tokenomics package unless a future deployment explicitly re-promotes them with tests, evidence, and public documentation.

System boundary:

- `72h-capital-contracts` owns the contract behavior model and future on-chain sources
- `72h-capital-shared` owns shared transport and view types
- `72h-capital-indexer` owns read-model ingestion and query scaffolding
- `72h-capital-api` owns the business API
- `72h-capital-admin` owns the operations console
- `72hours` owns the public website and preview UX

## Networks

- `testnet`
- `mainnet`

Example manifests live in:

- `deployments/testnet.example.json`
- `deployments/mainnet.example.json`

## Suggested deployment order

1. `AdminAuthority`
2. `TestJetton72H` for testnet-only rehearsal
3. `CapitalRegistry`
4. `AppRewardPool` instances for each first-batch app
5. `ReserveVault` instances for each first-batch app
6. `AlphaVault` instances for each first-batch app
7. `registerApp(app)` for each first-batch app
8. `bindReserveVault(app, vault)` for each first-batch app

Production order will later become:

1. `AdminAuthority`
2. `CapitalRegistry`
3. `AppRewardPool` instances for each app
4. `ReserveVault` instances for each app
5. `AlphaVault` instances for each app

For the current testnet-first implementation pass, run:

```bash
npm run tact:build
npm run plan:testnet:addresses
npm run deploy:testnet
npm run verify:testnet
npm run sync:api-env:testnet
```

This derives deterministic addresses and performs a no-send dry-run. If `TON_TESTNET_ADMIN_MULTISIG_SIGNER_1` through `TON_TESTNET_ADMIN_MULTISIG_SIGNER_5` are absent, dry-run planning uses the deployer address as a placeholder signer set so addresses remain deterministic without exposing or printing mnemonic data.

To send testnet transactions:

```bash
TON_TESTNET_ALLOW_DEPLOY_SEND=true npm run deploy:testnet:send
```

The send command has a double guard: it requires both `TON_TESTNET_ALLOW_DEPLOY_SEND=true` and the `--send` argument used by `npm run deploy:testnet:send`. Send mode also refuses to deploy `AdminAuthority` unless the configured admin signer address is explicit.

The send command deploys `AdminAuthority`, `TestJetton72H`, `CapitalRegistry`, `AppRewardPool`, the three first-batch `ReserveVault` contracts, and the three first-batch `AlphaVault` contracts, then sends Registry bootstrap messages for Reserve vault bindings. It writes a no-secret manifest to `deployments/testnet.latest.json` and timestamped manifests for sent deployments.

After sending, run `npm run verify:testnet`. It reads the latest manifest and verifies Registry owner/caps, ReserveVault bindings, AdminAuthority signer/threshold state, reward-pool owner/cadence values, and vault-level owner/appId/minimum/threshold values through on-chain getters. If the manifest contains planned-but-not-yet-active `AdminAuthority`, `AppRewardPool`, or `AlphaVault` addresses from dry-run, verify reports them as planned and skips their getter checks.

To rehearse a real Reserve allocation without deploying new contracts, run:

```bash
npm run rehearse:testnet:reserve
```

This is dry-run by default. It reads `.env.local` plus `deployments/testnet.latest.json`, plans a `TestJetton72H` mint to the configured testnet wallet, builds a standard Jetton wallet transfer with `createReserveJettonTransferMessageCell`, and prints the derived payloads. Defaults are `ReserveVault(72hours)` and `720 72H`.

Dry-run performs only getter/RPC reads and verifies:

- manifest `TestJetton72H`, `CapitalRegistry`, and app `ReserveVault` addresses
- user TestJetton wallet derived from the configured rehearsal wallet
- ReserveVault TestJetton wallet derived from both the Jetton master and the vault getter
- optional manifest `ReserveVaultJettonWallets[app]` matches the derived vault wallet
- current TestJetton total supply
- current user and ReserveVault Jetton wallet balances
- current Registry seat, Vault seat, next lot id, next seat, total principal, app id, and minimum allocation

To send the rehearsal on testnet:

```bash
TON_TESTNET_ALLOW_REHEARSAL_SEND=true npm run rehearse:testnet:reserve:send
```

Send mode has a double guard: it requires both `TON_TESTNET_ALLOW_REHEARSAL_SEND=true` and the `--send` argument used by `npm run rehearse:testnet:reserve:send`. It mints `TestJetton72H`, verifies the minted wallet balance and total supply, sends the real Jetton transfer from the deployer/user Jetton wallet to the configured ReserveVault, then verifies through getters that Registry assigned a seat, ReserveVault recorded the lot/principal state for that wallet, and the ReserveVault Jetton wallet balance increased by the transferred amount. Optional overrides are `TON_TESTNET_REHEARSAL_APP`, `TON_TESTNET_REHEARSAL_AMOUNT_72H`, and `TON_TESTNET_REHEARSAL_WALLET_ADDRESS`; send mode requires the rehearsal wallet to match the deployer Wallet V4 mnemonic.

Then run `npm run sync:api-env:testnet` to sync the manifest's public API env values into `../72h-capital-api/.env.local`. Use `H72H_CAPITAL_API_ENV_PATH=/path/to/.env.local` for a different API checkout.

## Environment placeholders

- `TON_TESTNET_RPC_URL`
- `TON_TESTNET_DEPLOYER_ADDRESS`
- `TON_MAINNET_RPC_URL`
- `TON_MAINNET_DEPLOYER_ADDRESS`
- `TON_TESTNET_DEPLOYER_MNEMONIC`
- `TON_MAINNET_DEPLOYER_MNEMONIC`
- `TON_TESTNET_ALLOW_DEPLOY_SEND`
- `TON_TESTNET_RPC_API_KEY`
- `TON_TESTNET_API_KEY`
- `TONCENTER_API_KEY`
- `TON_TESTNET_72H_JETTON_MODE`
- `TON_TESTNET_72H_JETTON_SYMBOL`
- `TON_TESTNET_72H_JETTON_DECIMALS`
- `TON_TESTNET_72H_JETTON_MASTER_ADDRESS`
- `TON_TESTNET_REHEARSAL_WALLET_ADDRESS`
- `TON_TESTNET_REHEARSAL_APP`
- `TON_TESTNET_REHEARSAL_AMOUNT_72H`
- `TON_TESTNET_ALLOW_REHEARSAL_SEND`
- `TON_TESTNET_ADMIN_MULTISIG_SIGNER_1`
- `TON_TESTNET_ADMIN_MULTISIG_SIGNER_2`
- `TON_TESTNET_ADMIN_MULTISIG_SIGNER_3`
- `TON_TESTNET_ADMIN_MULTISIG_SIGNER_4`
- `TON_TESTNET_ADMIN_MULTISIG_SIGNER_5`
- `TON_MAINNET_72H_JETTON_MASTER_ADDRESS`

Local deploy planning loads `.env.local` and `.env` from this repository root. Do not commit either file.

## Jetton policy

- Testnet uses a `72H Test Jetton` placeholder until a testnet master address is deployed and recorded.
- The current `TestJetton72H` is a minimal shell for rehearsal and does not claim full Jetton standard compatibility.
- Mainnet must use the official deployed V3 `72H` Jetton master address: `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3`.
- Frozen archive: V2 Jetton master `EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg` must not be used in new current mainnet manifests, apps, exchange submissions, wallet metadata, scripts, or launch materials.
- Deprecated: old pre-V2 Jetton master `EQDvE0ffdwvOhILjRJKFd2bIU9t5H9bG3-SKRidqavZjRsw8` must not be used in new mainnet manifests, apps, exchange submissions, wallet metadata, scripts, or launch materials.
- Mainnet deployment is blocked if `TON_MAINNET_72H_JETTON_MASTER_ADDRESS` is missing.
- `TON_MAINNET_72H_JETTON_MASTER_ADDRESS` must be the current V3 Jetton master contract address. Do not use the admin wallet address here. For deployed V3 facts, see `docs/72H_MAINNET_FACTS.md`.
- Mainnet governance default is `single-admin` with `TON_MAINNET_ADMIN_ADDRESS=UQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQfRq` and a `1` signature threshold.
- Reserve launch custody rehearsal default is `720,000 72H` per app, total `2,160,000 72H`.
- The testnet mock Jetton must not be reused or referenced in mainnet manifests.

## Live-readiness checklist

- testnet dry run completed
- testnet first-batch deployment manifest active
- storage layout finalized
- message schemas finalized
- shared types frozen across website / api / admin / indexer
- admin authority loaded and verified
- treasury funding path finalized
- Reserve custody and AppRewardPool funding strategy approved
- external audit completed
