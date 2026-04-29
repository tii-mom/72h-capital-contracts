import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

type BridgeEvidence = {
  readonly status?: string;
};

const deploymentsDir = 'deployments';
const bridgeEvidencePath = join(deploymentsDir, 'season-claim-v2-legacy-bridge.testnet.latest.json');
const bridgeEvidence = JSON.parse(readFileSync(bridgeEvidencePath, 'utf8')) as BridgeEvidence;
const bridgeGateComplete = bridgeEvidence.status === 'complete';

const mainnetPackageFiles = readdirSync(deploymentsDir)
  .filter((name) => name.includes('mainnet') && (name.endsWith('.json') || name.endsWith('.html')))
  .map((name) => join(deploymentsDir, name));

const alwaysForbidden = [
  'SeasonClaimV2BounceMock',
  'SeasonClaimV2BouncingJettonWallet',
  'MockSeasonClaimV2Funding',
  'contracts/testnet/SeasonClaimV2BounceMock.tact',
];

const gatedBeforeLegacySettle = [
  'SeasonClaimV2LegacyBridge',
  'SetSeasonClaimV2BridgeJettonWallet',
  'SetSeasonClaimV2BridgeTarget',
  'ClaimLegacySeasonForV2',
  'ForwardBridgeWalletToV2',
  'season-claim-v2-legacy-bridge',
  'RegisterSeasonClaim',
  '0x72070009',
  '72070009',
  '0x72071001',
  '72071001',
  '0x72071002',
  '72071002',
  '0x72071003',
  '72071003',
  '0x72071004',
  '72071004',
];

const gatedPresaleActions = [
  'SetPresaleActive',
  'BuyPresale',
  'WithdrawPresaleTon',
  'SweepUnsoldPresale',
  '0x720b0002',
  '720b0002',
  '1913323522',
  '0x720b0003',
  '720b0003',
  '1913323523',
  '0x720b0004',
  '720b0004',
  '1913323524',
  '0x720b0005',
  '720b0005',
  '1913323525',
];

const failures: string[] = [];

for (const file of mainnetPackageFiles) {
  const content = readFileSync(file, 'utf8');
  for (const token of alwaysForbidden) {
    if (content.includes(token)) {
      failures.push(`${file} contains testnet-only token ${token}`);
    }
  }
  if (!bridgeGateComplete) {
    for (const token of gatedBeforeLegacySettle) {
      if (content.includes(token)) {
        failures.push(`${file} contains gated token ${token} while bridge evidence status is ${bridgeEvidence.status ?? 'missing'}`);
      }
    }
  }
  for (const token of gatedPresaleActions) {
    if (content.includes(token)) {
      failures.push(`${file} contains gated presale action ${token}; presale activation is blocked`);
    }
  }
}

if (!bridgeGateComplete) {
  console.log(`SeasonClaimV2 executable mainnet gate remains blocked: ${bridgeEvidence.status ?? 'missing status'}.`);
  console.log('Checked existing mainnet package files for gated V2/bridge/mock content.');
}

if (failures.length > 0) {
  throw new Error(`Mainnet launch gate verification failed:\n${failures.join('\n')}`);
}

console.log('Mainnet launch gate package verification passed.');
