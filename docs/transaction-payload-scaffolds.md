# Transaction Payloads

This repo exports two transaction payload layers:

- JSON scaffolds for old preview alignment.
- Tact cell BOC helpers for the first testnet Reserve path.

## JSON Scaffold Status

- scaffold only
- not production-ready
- not a finalized TON cell / BOC encoding
- contract addresses, native TON value, op codes, and TL-B schemas are still unresolved

The helpers mirror the current executable state-machine entrypoints and package a normalized `transactionRequestScaffold` object that downstream website or API repos can consume while real contract message encoding is still pending.

## Exported helpers

- `createReserveAllocatePayloadScaffold`
- `createReserveRedeemPayloadScaffold`
- `createAlphaAllocatePayloadScaffold`
- `createYieldClaimPayloadScaffold`

## Action mapping

- `reserve.allocate` -> `ReserveVault.allocateReserve`
- `reserve.redeem` -> `ReserveVault.redeemReserve`
- `alpha.allocate` -> `AlphaVault.allocateAlpha`
- `yield.claim` -> `ReserveVault.claimYield` or `AlphaVault.claimYield` based on `seatType`

## Returned shape

Each helper returns:

- `scaffold`
  - version, encoding label, gas payer, and placeholder notes
- `target`
  - contract name, app slug, and current entrypoint name
- `parameters`
  - typed input normalized for local use, including bigint-safe `72H` amount wrappers where relevant
- `transactionRequestScaffold`
  - address resolver hint (`contract + app`, address currently `null`)
  - `nativeValueNanoTon: null`
  - `payloadJson`
  - `payloadUtf8`
  - `payloadBase64`

`payloadBase64` is just the base64 form of `payloadUtf8`. It is intentionally easy for other repos to inspect and repackage while the real TON encoding remains undefined.

## Example

```ts
import { createReserveAllocatePayloadScaffold } from '72h-capital-contracts';

const reserveAllocate = createReserveAllocatePayloadScaffold({
  app: '72hours',
  owner: 'wallet-a',
  amount72H: 720n,
});

reserveAllocate.transactionRequestScaffold;
```

## Current validation

The scaffold builders keep only the same high-level rule checks already present in the TypeScript state machines:

- reserve allocation enforces the `720 72H` threshold
- alpha allocation enforces the current app-specific threshold
- amount-bearing actions reject non-positive amounts

Anything lower-level than that still belongs to the future real message schema and on-chain implementation.

## Tact Cell Status

The Tact helpers emit production-shaped message bodies for the minimal compiled Tact contracts:

- `createReserveAllocateMessageCell`
- `createReserveTopUpMessageCell`
- `createReserveRedeemRequestMessageCell`
- `createRegisterAppMessageCell`
- `createBindReserveVaultMessageCell`
- `createMintTest72HMessageCell`
- `createTransferTest72HMessageCell`
- `createBurnTest72HMessageCell`

Returned payloads use:

- `payloadEncoding = base64(tact-cell-boc)`
- 32-bit Tact opcodes
- compact app IDs: `72hours=1`, `wan=2`, `multi-millionaire=3`
- 9-decimal 72H Jetton atomic units

Example:

```ts
import { createReserveAllocateMessageCell } from '72h-capital-contracts';

const message = createReserveAllocateMessageCell({
  app: '72hours',
  amount72H: 720n,
});

message.payloadBase64;
```

The API only exposes these payloads when `H72H_CAPITAL_NETWORK_MODE=testnet`, `H72H_ENABLE_TESTNET_TACT_MESSAGES=true`, and the matching ReserveVault testnet address is configured.
