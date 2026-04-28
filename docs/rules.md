# Rulebook

## Shared

- Yield token: `72H`
- Gas payer: `user`
- Supported apps:
  - `72hours`
  - `wan`
  - `multi-millionaire`

## Reserve Allocation

- seat cap per app: `72`
- minimum threshold: `720 72H`
- lock duration: `72 days`
- top-ups create independent lots
- each lot matures independently
- partial redemption is allowed
- mature lot principal is redeemed from the same `ReserveVault`
- no liquidity queue exists
- the seat identifier is never released
- full redemption transitions the seat to `Historical`
- a fresh qualifying allocation can reactivate the same seat as `Active`
- yield claim interval: `7 days`

## Alpha Allocation

- seat cap per app: `9`
- duration: `72 weeks`
- top-ups are allowed
- principal is non-redeemable
- settlement interval: `7 weeks`
- after 72 weeks the seat becomes `Completed Alpha Seat`
- principal remains non-redeemable after completion

### Alpha thresholds

- `72hours`: `72,000 72H`
- `wan`: `72,000 72H`
- `multi-millionaire`: `720,000 72H`
