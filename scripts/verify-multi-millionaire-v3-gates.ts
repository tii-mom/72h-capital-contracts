import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Address } from '@ton/core';

type PackageJson = {
  readonly scripts?: Record<string, string>;
};

type DepositVaultManifest = {
  readonly network?: string;
  readonly sent?: boolean;
  readonly contracts?: {
    readonly TestJetton72H?: string;
    readonly MultiMillionaireDepositVault?: string;
    readonly MultiMillionaireDepositVaultJettonWallet?: string;
  };
  readonly states?: {
    readonly MultiMillionaireDepositVault?: { readonly state?: string };
    readonly MultiMillionaireDepositVaultJettonWallet?: { readonly state?: string };
  };
};

type MainnetPlan = {
  readonly network?: string;
  readonly mode?: string;
  readonly jettonMaster?: string;
  readonly gates?: {
    readonly MAINNET_DEPLOYMENT_EVIDENCE_RECORDED?: boolean;
    readonly jettonMasterIsOfficialV3?: boolean;
    readonly deployable?: boolean;
  };
  readonly deployable?: boolean;
};

const OFFICIAL_V3_MASTER = 'EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3';

type GeneratedWalletClass = {
  fromInit(master: Address, owner: Address): Promise<{ readonly address: Address }>;
};

const requiredFiles = [
  'contracts/apps/multi-millionaire/v3/MultiMillionaireDepositVault.tact',
  'tests/multi-millionaire-deposit-vault.spec.ts',
  'deployments/multi-millionaire-deposit-vault.testnet.latest.json',
  'scripts/rehearse-multi-millionaire-v3-testnet.ts',
  'scripts/canary-multi-millionaire-deposit-testnet.ts',
];

function readJson<T>(relativePath: string): T {
  const path = resolve(process.cwd(), relativePath);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function expect(condition: unknown, message: string, failures: string[]) {
  if (!condition) failures.push(message);
}

function formatAddress(address: Address) {
  return address.toString({ testOnly: true });
}

async function loadTestJettonWalletClass(): Promise<GeneratedWalletClass> {
  const path = resolve(process.cwd(), 'build/tact/TestJetton72H/TestJetton72H_TestJetton72HWallet.ts');
  if (!existsSync(path)) {
    throw new Error('Missing generated TestJetton72HWallet wrapper. Run npm run tact:build first.');
  }
  const module = (await import(pathToFileURL(path).href)) as { TestJetton72HWallet?: GeneratedWalletClass };
  if (!module.TestJetton72HWallet?.fromInit) {
    throw new Error('Generated TestJetton72HWallet wrapper does not export fromInit.');
  }
  return module.TestJetton72HWallet;
}

async function main() {
  const failures: string[] = [];

  for (const relativePath of requiredFiles) {
    expect(existsSync(resolve(process.cwd(), relativePath)), `Missing required V3 file: ${relativePath}`, failures);
  }

  const packageJson = readJson<PackageJson>('package.json');
  const scripts = packageJson.scripts ?? {};
  expect(
    scripts['verify:multi-millionaire-v3-gates'] === 'tsx scripts/verify-multi-millionaire-v3-gates.ts',
    'package.json verify:multi-millionaire-v3-gates must point at scripts/verify-multi-millionaire-v3-gates.ts',
    failures,
  );
  expect(
    scripts['rehearse:multi-millionaire-v3:testnet']?.includes('rehearse-multi-millionaire-v3-testnet.ts')
      && !scripts['rehearse:multi-millionaire-v3:testnet']?.includes('--send'),
    'rehearse:multi-millionaire-v3:testnet must be read-only by default',
    failures,
  );
  expect(
    scripts['canary:multi-millionaire-deposit:testnet']?.includes('canary-multi-millionaire-deposit-testnet.ts')
      && !scripts['canary:multi-millionaire-deposit:testnet']?.includes('--send'),
    'canary:multi-millionaire-deposit:testnet must be dry-run by default',
    failures,
  );
  expect(
    scripts['canary:multi-millionaire-deposit:testnet:send']?.includes('--send'),
    'canary send command must be explicitly separate',
    failures,
  );

  const canaryScript = readFileSync(resolve(process.cwd(), 'scripts/canary-multi-millionaire-deposit-testnet.ts'), 'utf8');
  expect(
    canaryScript.includes("TON_TESTNET_ALLOW_MULTI_MILLIONAIRE_DEPOSIT_CANARY_SEND !== 'true'"),
    'canary send path must require TON_TESTNET_ALLOW_MULTI_MILLIONAIRE_DEPOSIT_CANARY_SEND=true',
    failures,
  );

  const tactConfig = readJson<{ readonly projects?: Array<{ readonly name?: string; readonly path?: string }> }>('tact.config.json');
  expect(
    tactConfig.projects?.some(
      (project) =>
        project.name === 'MultiMillionaireDepositVault'
        && project.path === './contracts/apps/multi-millionaire/v3/MultiMillionaireDepositVault.tact',
    ),
    'tact.config.json must build MultiMillionaireDepositVault from contracts/apps/multi-millionaire/v3',
    failures,
  );

  const manifest = readJson<DepositVaultManifest>('deployments/multi-millionaire-deposit-vault.testnet.latest.json');
  expect(manifest.network === 'testnet', 'latest DepositVault manifest must be testnet-scoped', failures);
  expect(manifest.sent === true, 'latest DepositVault manifest must record a sent testnet deployment', failures);
  expect(
    manifest.states?.MultiMillionaireDepositVault?.state === 'active',
    'latest DepositVault manifest must show MultiMillionaireDepositVault active',
    failures,
  );

  if (manifest.contracts?.TestJetton72H && manifest.contracts.MultiMillionaireDepositVault && manifest.contracts.MultiMillionaireDepositVaultJettonWallet) {
    const walletClass = await loadTestJettonWalletClass();
    const derivedWallet = await walletClass.fromInit(
      Address.parse(manifest.contracts.TestJetton72H),
      Address.parse(manifest.contracts.MultiMillionaireDepositVault),
    );
    const manifestWallet = Address.parse(manifest.contracts.MultiMillionaireDepositVaultJettonWallet);
    expect(
      derivedWallet.address.equals(manifestWallet),
      `manifest DepositVault Jetton wallet must match derived wallet. expected=${formatAddress(derivedWallet.address)} actual=${formatAddress(manifestWallet)}`,
      failures,
    );
  } else {
    failures.push('latest DepositVault manifest must include TestJetton72H, MultiMillionaireDepositVault, and MultiMillionaireDepositVaultJettonWallet addresses');
  }

  const mainnetPlanPath = resolve(process.cwd(), 'deployments/multi-millionaire-deposit-vault.mainnet.plan.json');
  if (existsSync(mainnetPlanPath)) {
    const plan = readJson<MainnetPlan>('deployments/multi-millionaire-deposit-vault.mainnet.plan.json');
    expect(plan.network === 'mainnet', 'mainnet DepositVault plan must be mainnet-scoped', failures);
    expect(plan.mode === 'dry-run', 'mainnet DepositVault plan must be dry-run only', failures);
    expect(plan.jettonMaster === OFFICIAL_V3_MASTER, `mainnet DepositVault plan must use official V3 master ${OFFICIAL_V3_MASTER}`, failures);
    expect(plan.gates?.jettonMasterIsOfficialV3 === true, 'mainnet DepositVault plan must record jettonMasterIsOfficialV3=true', failures);
    expect(plan.deployable !== true && plan.gates?.deployable !== true, 'mainnet DepositVault plan must not be marked deployable', failures);
    expect(
      plan.gates?.MAINNET_DEPLOYMENT_EVIDENCE_RECORDED === false,
      'mainnet DepositVault plan must keep MAINNET_DEPLOYMENT_EVIDENCE_RECORDED=false until real evidence exists',
      failures,
    );
  }

  if (failures.length > 0) {
    throw new Error(`Multi-millionaire V3 gate failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  }

  console.log(JSON.stringify({
    status: 'pass',
    gate: 'multi-millionaire-v3',
    checked: {
      source: 'contracts/apps/multi-millionaire/v3/MultiMillionaireDepositVault.tact',
      sandboxTest: 'tests/multi-millionaire-deposit-vault.spec.ts',
      testnetManifest: 'deployments/multi-millionaire-deposit-vault.testnet.latest.json',
      vaultState: manifest.states?.MultiMillionaireDepositVault?.state,
      vaultJettonWalletState: manifest.states?.MultiMillionaireDepositVaultJettonWallet?.state ?? 'unknown',
      dryRunDefaults: true,
      mainnetPlanDeployable: false,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
