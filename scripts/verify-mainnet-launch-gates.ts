import { readFileSync, readdirSync, type Dirent } from 'node:fs';
import { join } from 'node:path';

type BridgeEvidence = {
  readonly status?: string;
};

const deploymentsDir = 'deployments';
const bridgeEvidencePath = join(deploymentsDir, 'season-claim-v2-legacy-bridge.testnet.latest.json');
const bridgeEvidence = JSON.parse(readFileSync(bridgeEvidencePath, 'utf8')) as BridgeEvidence;
const bridgeGateComplete = bridgeEvidence.status === 'complete';

function collectMainnetPackageFiles(directory: string): string[] {
  const entries: Dirent[] = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMainnetPackageFiles(path));
    } else if (entry.name.includes('mainnet') && (entry.name.endsWith('.json') || entry.name.endsWith('.html'))) {
      files.push(path);
    }
  }
  return files;
}

const mainnetPackageFiles = collectMainnetPackageFiles(deploymentsDir);

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

const forbiddenV3ReuseTokens = [
  'V2 Jetton master',
  'REUSE',
  'DO NOT REDEPLOY',
  'Unchanged contracts',
  'reuse V2',
  'reusedContracts',
  'deployments/jetton-v2.mainnet.plan.json',
];

const failures: string[] = [];

for (const file of mainnetPackageFiles) {
  const content = readFileSync(file, 'utf8');
  const isV3MainnetPackage = file.includes(`${deploymentsDir}/v3-mainnet/`);
  for (const token of alwaysForbidden) {
    if (content.includes(token)) {
      failures.push(`${file} contains testnet-only token ${token}`);
    }
  }
  if (!isV3MainnetPackage && !bridgeGateComplete) {
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
  if (isV3MainnetPackage) {
    for (const token of forbiddenV3ReuseTokens) {
      if (content.includes(token)) {
        failures.push(`${file} contains V3 reuse token ${token}; V3 must use a new Jetton master and new tokenomics addresses`);
      }
    }
    if (file.endsWith('.tonconnect.json') && !content.includes('deploy-v3-jetton-master')) {
      failures.push(`${file} does not include deploy-v3-jetton-master; V3 must deploy a new Jetton master`);
    }
  }
}

if (!bridgeGateComplete) {
  console.log(`Legacy V2 bridge mainnet gate remains blocked for non-V3 packages: ${bridgeEvidence.status ?? 'missing status'}.`);
  console.log('V3 packages are checked as an independent new asset line and are not blocked by legacy bridge cleanup.');
  console.log('Checked existing mainnet package files for gated V2/bridge/mock content.');
}

if (failures.length > 0) {
  throw new Error(`Mainnet launch gate verification failed:\n${failures.join('\n')}`);
}

console.log('Mainnet launch gate package verification passed.');
