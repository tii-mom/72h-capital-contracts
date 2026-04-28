import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type ApiEnv = Record<string, string>;

type TestnetManifest = {
  readonly apiEnv: ApiEnv;
};

const DEFAULT_API_ENV_PATH = '../72h-capital-api/.env.local';
const MANIFEST_PATH = 'deployments/testnet.latest.json';

function readManifest() {
  const path = resolve(process.cwd(), MANIFEST_PATH);
  if (!existsSync(path)) {
    throw new Error(`Missing ${MANIFEST_PATH}. Run npm run deploy:testnet first.`);
  }

  return JSON.parse(readFileSync(path, 'utf8')) as TestnetManifest;
}

function parseEnvLine(line: string) {
  const separatorIndex = line.indexOf('=');
  if (separatorIndex <= 0 || line.trim().startsWith('#')) {
    return undefined;
  }

  return line.slice(0, separatorIndex).trim();
}

function serializeEnvValue(value: string) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function upsertEnv(existingContent: string, updates: ApiEnv) {
  const handled = new Set<string>();
  const lines = existingContent.split(/\r?\n/).map((line) => {
    const key = parseEnvLine(line);
    if (!key || !(key in updates)) {
      return line;
    }

    handled.add(key);
    return `${key}=${serializeEnvValue(updates[key]!)}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!handled.has(key)) {
      lines.push(`${key}=${serializeEnvValue(value)}`);
    }
  }

  return `${lines.filter((line, index, all) => line || index < all.length - 1).join('\n')}\n`;
}

const manifest = readManifest();
const apiEnvPath = resolve(process.cwd(), process.env.H72H_CAPITAL_API_ENV_PATH || DEFAULT_API_ENV_PATH);
const currentContent = existsSync(apiEnvPath) ? readFileSync(apiEnvPath, 'utf8') : '';
const nextContent = upsertEnv(currentContent, manifest.apiEnv);

writeFileSync(apiEnvPath, nextContent, { mode: 0o600 });

console.log(`Synced ${Object.keys(manifest.apiEnv).length} testnet API env values.`);
console.log(`Target: ${apiEnvPath}`);
console.log(`Directory: ${dirname(apiEnvPath)}`);
