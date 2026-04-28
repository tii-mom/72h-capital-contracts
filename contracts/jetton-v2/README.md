# 72H V2 Jetton FunC Contracts

This directory contains the 72H V2 Jetton master and wallet contracts.

Source basis:

- Upstream: `https://github.com/ton-blockchain/jetton-contract`
- Implementation family: TON Jetton 2.0 FunC master/wallet

Local 72H V2 policy:

- The wallet contract is vendored from the upstream standard Jetton implementation.
- The minter is a fixed-supply 72H V2 variant.
- The minter keeps only initial `mint`, `burn_notification`, wallet discovery, `top_up`, and `drop_admin`.
- The minter does not include upgrade, metadata-change, admin-transfer, blacklist, pause, tax, whitelist, force-transfer, or force-burn logic.
- After `drop_admin`, `get_jetton_data()` returns `mintable=false` and `admin_address=null`.

Build:

```bash
npm run jetton-v2:build
```

The build writes code BOCs and hashes to `build/jetton-v2/`.
