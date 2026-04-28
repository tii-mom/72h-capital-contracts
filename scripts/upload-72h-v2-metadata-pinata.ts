import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const PINATA_ENDPOINT = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const DEFAULT_LOGO_PATH = '/Users/yudeyou/Desktop/72hours/public/brand/72hours-logo.png';
const DEFAULT_DRAFT_METADATA_PATH = 'metadata/72h-v2.metadata.draft.json';
const DEFAULT_FINAL_METADATA_PATH = 'metadata/72h-v2.metadata.final.json';
const DEFAULT_MANIFEST_PATH = 'deployments/72h-v2.pinata-metadata.json';

interface PinataResponse {
  IpfsHash?: string;
  PinSize?: number;
  Timestamp?: string;
}

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return undefined;
  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex <= 0) return undefined;
  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function loadLocalEnv() {
  const loaded: string[] = [];
  for (const filename of ['.env.local', '.env']) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (parsed && process.env[parsed.key] === undefined) {
        process.env[parsed.key] = parsed.value;
      }
    }
    loaded.push(filename);
  }
  return loaded;
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function uploadFile(input: {
  readonly jwt: string;
  readonly path: string;
  readonly pinName: string;
  readonly contentType: string;
}) {
  const bytes = await readFile(input.path);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: input.contentType }), basename(input.path));
  form.append('pinataMetadata', JSON.stringify({ name: input.pinName }));

  const response = await fetch(PINATA_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.jwt}`,
    },
    body: form,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Pinata upload failed (${response.status}): ${text}`);
  }

  const parsed = JSON.parse(text) as PinataResponse;
  if (!parsed.IpfsHash) {
    throw new Error(`Pinata response missing IpfsHash: ${text}`);
  }

  return {
    cid: parsed.IpfsHash,
    size: parsed.PinSize ?? bytes.byteLength,
    timestamp: parsed.Timestamp ?? new Date().toISOString(),
  };
}

const loadedEnvFiles = loadLocalEnv();
const jwt = requireEnv('PINATA_JWT');
const logoPath = resolve(process.env.H72H_V2_LOGO_PATH?.trim() || DEFAULT_LOGO_PATH);
const draftMetadataPath = resolve(process.env.H72H_V2_DRAFT_METADATA_PATH?.trim() || DEFAULT_DRAFT_METADATA_PATH);
const finalMetadataPath = resolve(process.env.H72H_V2_FINAL_METADATA_PATH?.trim() || DEFAULT_FINAL_METADATA_PATH);
const manifestPath = resolve(process.env.H72H_V2_PINATA_MANIFEST_PATH?.trim() || DEFAULT_MANIFEST_PATH);

const logoUpload = await uploadFile({
  jwt,
  path: logoPath,
  pinName: '72H V2 logo',
  contentType: 'image/png',
});

const draft = JSON.parse(await readFile(draftMetadataPath, 'utf8')) as Record<string, unknown>;
const finalMetadata = {
  ...draft,
  image: `ipfs://${logoUpload.cid}`,
};

await writeFile(finalMetadataPath, `${JSON.stringify(finalMetadata, null, 2)}\n`);

const metadataUpload = await uploadFile({
  jwt,
  path: finalMetadataPath,
  pinName: '72H V2 metadata',
  contentType: 'application/json',
});

const manifest = {
  generatedAt: new Date().toISOString(),
  logo: {
    path: logoPath,
    cid: logoUpload.cid,
    uri: `ipfs://${logoUpload.cid}`,
    gatewayUrl: `https://gateway.pinata.cloud/ipfs/${logoUpload.cid}`,
    size: logoUpload.size,
    timestamp: logoUpload.timestamp,
  },
  metadata: {
    path: finalMetadataPath,
    cid: metadataUpload.cid,
    uri: `ipfs://${metadataUpload.cid}`,
    gatewayUrl: `https://gateway.pinata.cloud/ipfs/${metadataUpload.cid}`,
    size: metadataUpload.size,
    timestamp: metadataUpload.timestamp,
  },
};

await mkdir(resolve('deployments'), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log('72H V2 Pinata upload complete.');
if (loadedEnvFiles.length > 0) console.log(`Loaded env files: ${loadedEnvFiles.join(', ')}`);
console.log(`Logo URI: ${manifest.logo.uri}`);
console.log(`Logo Gateway: ${manifest.logo.gatewayUrl}`);
console.log(`Metadata URI: ${manifest.metadata.uri}`);
console.log(`Metadata Gateway: ${manifest.metadata.gatewayUrl}`);
console.log(`Final metadata: ${finalMetadataPath}`);
console.log(`Manifest: ${manifestPath}`);
