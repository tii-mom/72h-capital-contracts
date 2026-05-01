# 72H V3 Mainnet Pre-Signing Checklist

Status: V3 pre-signing review complete; ready for final verification before a signing window.

Scope boundary: V3 is a new asset line and does not use the V2 legacy bridge migration. The legacy bridge cleanup gate still applies to V2/bridge migration packages, but it is not a blocker for this V3 mainnet package.

## Scope

V3 is a complete new asset line:

- new Jetton Master
- new SeasonVault
- new SeasonClaimV2
- new FundVesting
- new DevelopmentFund
- new PresaleVault
- new EcosystemTreasury
- new TeamVesting

V3 may reuse V2 contract code, but it must not reuse the V2 Jetton Master or V2 tokenomics contract addresses.

## Fixed Generation Input

The V3 metadata URI must be provided explicitly when regenerating the V3 package:

```bash
TON_V3_METADATA_URI=ipfs://QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC npm run plan:v3-mainnet:tonconnect
```

Do not run the V3 plan without `TON_V3_METADATA_URI`. The script is expected to fail closed when the value is missing, because V3 must not silently reuse placeholder or V2 metadata.

## Generated Artifacts

Review these files before any signing window.

- `deployments/v3-mainnet/72h-v3-tokenomics.mainnet.plan.json`
- `deployments/v3-mainnet/72h-v3-mainnet.tonconnect.json`
- `deployments/v3-mainnet/72h-v3-mainnet-deploy.html`
- `deployments/v3-mainnet/72h-v3.pinata-metadata.json`
- `metadata/72h-v3.metadata.final.json`

## Expected Addresses

V3 Jetton Master:

```text
EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3
```

V2 Jetton Master, for comparison only:

```text
EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg
```

V3 tokenomics/core contracts:

```text
SeasonVault:        EQCkI1atYYWN-2cnJJASJ1nKsu0ZbvCd_EVZQ61KcoIW-13l
SeasonClaimV2:      EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b
FundVesting:        EQBKuIRplvhYzL9Gbm6GpZqCxMTHApVOZMVs9T1HzXcP7inb
DevelopmentFund:    EQBbRZQj_VJU2r-DAtQcHoDngRC9EBvUHFg4LoB5HXLBv1Yh
PresaleVault:       EQDHSwsiQtB3sdoAaOdJi4kCu32GIHM4BtXd-_EtpE96EYXy
EcosystemTreasury:  EQCy7YpjZJuQAwjCQvQK55dv4p89c5pJUR9vi8nAwoW4a_w7
TeamVesting:        EQC3pNoWZHNmbcazxJV7lzcQH05Zewjl5w1KJhA4OfIPM6cy
```

## Required Package Checks

The TonConnect package must contain these batches in order:

```text
deploy-v3-jetton-master
mint-v3-total-supply
drop-v3-jetton-admin
deploy-tokenomics-a
deploy-tokenomics-b
set-jetton-wallets-a
set-jetton-wallets-b
set-tokenomics-routes
allocate-tokenomics-a
allocate-tokenomics-b
```

Required invariants:

- `sourcePlans.jetton` is `embedded-v3-jetton-plan`.
- The package contains exactly 8 deploy `StateInit` messages.
- The 8 deploys are 1 V3 Jetton Master plus 7 V3 tokenomics/core contracts.
- V3 Jetton Master differs from V2 Jetton Master.
- All 7 V3 tokenomics/core addresses differ from their V2 counterparts.
- V3 allocation uses non-zero `forward_ton_amount`; current expected value is `10000000` nanoton.
- No V2 bridge claim, V2 root publication, or legacy bridge migration transaction is included.

## Machine Check

Run this after regenerating the package:

```bash
node <<'NODE'
const fs = require('fs');
const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(`${root}/deployments/v3-mainnet/72h-v3-mainnet.tonconnect.json`, 'utf8'));
const plan = JSON.parse(fs.readFileSync(`${root}/deployments/v3-mainnet/72h-v3-tokenomics.mainnet.plan.json`, 'utf8'));
const v2 = JSON.parse(fs.readFileSync(`${root}/deployments/72h-v2-tokenomics.mainnet.plan.json`, 'utf8'));
const failures = [];
const batches = pkg.batches ?? [];
const deployCount = batches.flatMap((batch) => batch.messages ?? []).filter((message) => message.stateInit).length;
const master = plan.v3Jetton?.addresses?.jettonMinter;

if (plan.metadataUri !== 'ipfs://QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC') failures.push('unexpected V3 metadata URI');
if (plan.jettonPlan !== 'embedded-v3-jetton-plan') failures.push('unexpected jetton plan source');
if (deployCount !== 8) failures.push(`expected 8 deploy StateInit messages, got ${deployCount}`);
if (!master || master === v2.jettonMaster) failures.push('V3 Jetton Master is missing or equals V2 Jetton Master');
if (!batches.some((batch) => batch.id === 'deploy-v3-jetton-master')) failures.push('missing deploy-v3-jetton-master batch');

for (const [name, address] of Object.entries(plan.contracts ?? {})) {
  const oldAddress = v2.contracts?.[name] ?? (name === 'SeasonClaimV2' ? v2.contracts?.SeasonClaim : undefined);
  if (oldAddress === address) failures.push(`${name} collides with V2 address`);
}

console.log(JSON.stringify({ failures, deployCount, v3JettonMaster: master, contracts: plan.contracts }, null, 2));
process.exit(failures.length ? 1 : 0);
NODE
```

## Final Verification Commands

Run these immediately before any future signing window:

```bash
npm run typecheck
npm run lint
npm run build
npm run test
npm run verify:mainnet-launch-gates
npx @nowarp/misti@latest --min-severity high contracts
```

Expected launch gate behavior while V2 bridge cleanup is still pending:

```text
Legacy V2 bridge mainnet gate remains blocked for non-V3 packages: bridge-forward-complete-pending-legacy-settle.
V3 packages are checked as an independent new asset line and are not blocked by legacy bridge cleanup.
Mainnet launch gate package verification passed.
```

This message does not block the V3 package. It only states that V2/bridge migration packages remain blocked.

## Sign-Off Gates

Before wallet connection or signing, all of the following must be true:

- The final verification commands pass.
- The V3 metadata URI in the generated plan equals `ipfs://QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC`.
- The V3 Jetton Master equals `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3`.
- The machine check reports `failures: []`.
- A human has reviewed the TonConnect batches and addresses against this checklist.
- The signer explicitly confirms they are deploying V3 as a new asset line, not executing any V2 legacy bridge migration.
