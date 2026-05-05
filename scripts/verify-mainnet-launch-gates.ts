import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OFFICIAL_V3_MASTER = 'EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3';
const FROZEN_V2_MASTER = 'EQBGIzEDvvKObStrcVb6i5Z1-8uYZYtUrYzF2rFZU7xUAXVg';
const FROZEN_PRE_V2_MASTER = 'EQDvE0ffdwvOhILjRJKFd2bIU9t5H9bG3-SKRidqavZjRsw8';

type PackageJson = {
  readonly scripts?: Record<string, string>;
};

type MainnetFacts = {
  readonly schema?: string;
  readonly status?: string;
  readonly jetton?: {
    readonly officialV3Master?: string;
    readonly frozenArchiveMasters?: readonly string[];
    readonly mintable?: boolean;
    readonly admin?: string | null;
  };
  readonly contracts?: {
    readonly V3JettonMaster?: { readonly address?: string; readonly state?: string };
    readonly PresaleVault?: { readonly state?: string };
  };
};

type WebsiteFacts = {
  readonly status?: string;
  readonly version?: string;
  readonly jettonMaster?: string;
  readonly mintable?: boolean;
  readonly admin?: string | null;
  readonly restrictions?: Record<string, string>;
  readonly replaces?: { readonly status?: string; readonly jettonMaster?: string };
};

type PostDeployEvidence = {
  readonly network?: string;
  readonly status?: string;
  readonly failures?: readonly string[];
  readonly jettonMaster?: {
    readonly address?: string;
    readonly state?: string;
    readonly mintable?: boolean;
    readonly adminAddress?: string | null;
  };
  readonly contracts?: Record<string, { readonly state?: string }>;
};

type MultiMillionairePlan = {
  readonly network?: string;
  readonly mode?: string;
  readonly deployable?: boolean;
  readonly jettonMaster?: string;
  readonly gates?: { readonly deployable?: boolean; readonly MAINNET_DEPLOYMENT_EVIDENCE_RECORDED?: boolean };
};

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as T;
}

function expect(condition: unknown, message: string, failures: string[]) {
  if (!condition) failures.push(message);
}

function expectEqual<T>(actual: T, expected: T, message: string, failures: string[]) {
  expect(actual === expected, `${message}: expected ${String(expected)}, got ${String(actual)}`, failures);
}

function fileIncludes(relativePath: string, text: string) {
  const path = resolve(process.cwd(), relativePath);
  return existsSync(path) && readFileSync(path, 'utf8').includes(text);
}

function main() {
  const failures: string[] = [];

  const requiredFiles = [
    'docs/72H_MAINNET_FACTS.json',
    'docs/72h-v3-contract-facts-freeze-note.md',
    'integrations/website/72h-v3-mainnet.json',
    'deployments/v3-mainnet/72h-v3-mainnet.postdeploy.latest.json',
    'deployments/v3-mainnet/72h-v3-tokenomics.mainnet.plan.json',
    'scripts/verify-72h-v3-mainnet-postdeploy.ts',
    'scripts/plan-multi-millionaire-deposit-vault-mainnet.ts',
  ];
  for (const relativePath of requiredFiles) {
    expect(existsSync(resolve(process.cwd(), relativePath)), `Missing required mainnet gate file: ${relativePath}`, failures);
  }

  const packageJson = readJson<PackageJson>('package.json');
  const scripts = packageJson.scripts ?? {};
  expectEqual(scripts['verify:mainnet-launch-gates'], 'tsx scripts/verify-mainnet-launch-gates.ts', 'verify:mainnet-launch-gates script', failures);
  expect(
    scripts['plan:mainnet']?.includes('plan:v3-tokenomics:mainnet') ?? false,
    'generic plan:mainnet must point to the V3 tokenomics plan',
    failures,
  );
  expect(
    scripts['plan:mainnet:tonconnect']?.includes('plan:v3-mainnet:tonconnect') ?? false,
    'generic plan:mainnet:tonconnect must point to the V3 TonConnect archive command',
    failures,
  );
  expect(
    !scripts['plan:mainnet']?.includes('scripts/deploy.ts mainnet') && !scripts['plan:mainnet:tonconnect']?.includes('plan-mainnet-tonconnect-deploy.ts'),
    'generic mainnet scripts must not point to legacy mainnet planners',
    failures,
  );

  const facts = readJson<MainnetFacts>('docs/72H_MAINNET_FACTS.json');
  expectEqual(facts.schema, '72h-mainnet-facts-v3', 'mainnet facts schema', failures);
  expectEqual(facts.status, 'current-v3-facts-source', 'mainnet facts status', failures);
  expectEqual(facts.jetton?.officialV3Master, OFFICIAL_V3_MASTER, 'official V3 master', failures);
  expectEqual(facts.contracts?.V3JettonMaster?.address, OFFICIAL_V3_MASTER, 'facts V3JettonMaster address', failures);
  expectEqual(facts.contracts?.V3JettonMaster?.state, 'active', 'facts V3JettonMaster state', failures);
  expectEqual(facts.jetton?.mintable, false, 'facts mintable', failures);
  expectEqual(facts.jetton?.admin ?? null, null, 'facts admin', failures);
  expect(facts.jetton?.frozenArchiveMasters?.includes(FROZEN_V2_MASTER), 'facts must keep V2 master as frozen archive only', failures);
  expect(facts.jetton?.frozenArchiveMasters?.includes(FROZEN_PRE_V2_MASTER), 'facts must keep pre-V2 master as frozen archive only', failures);
  expect(
    facts.contracts?.PresaleVault?.state?.includes('do-not-activate') ?? false,
    'PresaleVault facts state must explicitly remain inactive/do-not-activate',
    failures,
  );

  const websiteFacts = readJson<WebsiteFacts>('integrations/website/72h-v3-mainnet.json');
  expectEqual(websiteFacts.status, 'current', 'website facts status', failures);
  expectEqual(websiteFacts.version, 'v3', 'website facts version', failures);
  expectEqual(websiteFacts.jettonMaster, OFFICIAL_V3_MASTER, 'website V3 master', failures);
  expectEqual(websiteFacts.mintable, false, 'website mintable', failures);
  expectEqual(websiteFacts.admin ?? null, null, 'website admin', failures);
  expect(websiteFacts.restrictions?.presale?.includes('inactive'), 'website facts must keep presale inactive', failures);
  expect(websiteFacts.restrictions?.seasonClaimRoots?.includes('not published'), 'website facts must keep SeasonClaim roots unpublished', failures);
  expect(websiteFacts.restrictions?.v2?.includes('frozen archive'), 'website facts must mark V2 as frozen archive only', failures);
  expectEqual(websiteFacts.replaces?.status, 'frozen-archive', 'website V2 replacement status', failures);
  expectEqual(websiteFacts.replaces?.jettonMaster, FROZEN_V2_MASTER, 'website V2 replacement master', failures);

  const evidence = readJson<PostDeployEvidence>('deployments/v3-mainnet/72h-v3-mainnet.postdeploy.latest.json');
  expectEqual(evidence.network, 'mainnet', 'postdeploy network', failures);
  expectEqual(evidence.status, 'deployed-and-postdeploy-verified', 'postdeploy status', failures);
  expectEqual(evidence.failures?.length ?? 0, 0, 'postdeploy failures count', failures);
  expectEqual(evidence.jettonMaster?.address, OFFICIAL_V3_MASTER, 'postdeploy V3 master', failures);
  expectEqual(evidence.jettonMaster?.state, 'active', 'postdeploy V3 master state', failures);
  expectEqual(evidence.jettonMaster?.mintable, false, 'postdeploy mintable', failures);
  expectEqual(evidence.jettonMaster?.adminAddress ?? null, null, 'postdeploy admin', failures);
  for (const [name, contract] of Object.entries(evidence.contracts ?? {})) {
    expectEqual(contract.state, 'active', `${name} postdeploy state`, failures);
  }

  const multiPlanPath = resolve(process.cwd(), 'deployments/multi-millionaire-deposit-vault.mainnet.plan.json');
  if (existsSync(multiPlanPath)) {
    const multiPlan = readJson<MultiMillionairePlan>('deployments/multi-millionaire-deposit-vault.mainnet.plan.json');
    expectEqual(multiPlan.network, 'mainnet', 'multi-millionaire mainnet plan network', failures);
    expectEqual(multiPlan.mode, 'dry-run', 'multi-millionaire mainnet plan mode', failures);
    expectEqual(multiPlan.jettonMaster, OFFICIAL_V3_MASTER, 'multi-millionaire mainnet plan V3 master', failures);
    expect(multiPlan.deployable !== true && multiPlan.gates?.deployable !== true, 'multi-millionaire mainnet plan must remain non-deployable', failures);
    expectEqual(
      multiPlan.gates?.MAINNET_DEPLOYMENT_EVIDENCE_RECORDED,
      false,
      'multi-millionaire mainnet plan deployment evidence gate',
      failures,
    );
  }

  expect(
    !fileIncludes('docs/deployment.md', FROZEN_PRE_V2_MASTER) && !fileIncludes('deployments/mainnet.example.json', FROZEN_PRE_V2_MASTER),
    'current deployment docs/examples must not expose the pre-V2 master as current mainnet',
    failures,
  );
  expect(
    fileIncludes('docs/NEXT_STEPS.md', OFFICIAL_V3_MASTER) && !fileIncludes('docs/NEXT_STEPS.md', '/contracts/72h-v2-mainnet.json'),
    'NEXT_STEPS must describe V3 current integration work, not V2 publication',
    failures,
  );

  if (failures.length > 0) {
    throw new Error(`Mainnet launch gate failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  }

  console.log(JSON.stringify({
    status: 'pass',
    gate: 'mainnet-launch',
    officialV3Master: OFFICIAL_V3_MASTER,
    checks: {
      currentFacts: true,
      websiteFacts: true,
      postDeployEvidence: true,
      packageEntrypoints: true,
      forbiddenBoundaries: true,
      multiMillionaireDryRunOnly: existsSync(multiPlanPath),
    },
  }, null, 2));
}

main();
