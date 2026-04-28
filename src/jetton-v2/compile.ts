import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cell } from '@ton/core';
import { compileFunc, compilerVersion } from '@ton-community/func-js';

const SOURCE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../contracts/jetton-v2');

export type JettonV2CompileTarget = 'jetton-minter.fc' | 'jetton-wallet.fc';

export interface CompiledJettonV2Contract {
  readonly target: JettonV2CompileTarget;
  readonly code: Cell;
  readonly codeBocBase64: string;
  readonly codeHashHex: string;
  readonly codeHashBase64: string;
  readonly warnings: string;
  readonly fiftCode: string;
}

export interface CompiledJettonV2 {
  readonly funcVersion: string;
  readonly minter: CompiledJettonV2Contract;
  readonly wallet: CompiledJettonV2Contract;
}

function loadFuncSource(path: string) {
  return readFileSync(resolve(SOURCE_DIR, path), 'utf8');
}

export async function compileJettonV2Target(target: JettonV2CompileTarget): Promise<CompiledJettonV2Contract> {
  const result = await compileFunc({
    targets: [target],
    sources: loadFuncSource,
  });

  if (result.status === 'error') {
    throw new Error(`FunC compile failed for ${target}: ${result.message}`);
  }

  const code = Cell.fromBoc(Buffer.from(result.codeBoc, 'base64'))[0];
  if (!code) {
    throw new Error(`FunC compile did not return a code cell for ${target}.`);
  }

  return {
    target,
    code,
    codeBocBase64: result.codeBoc,
    codeHashHex: code.hash().toString('hex'),
    codeHashBase64: code.hash().toString('base64'),
    warnings: result.warnings,
    fiftCode: result.fiftCode,
  };
}

export async function compileJettonV2(): Promise<CompiledJettonV2> {
  const [version, minter, wallet] = await Promise.all([
    compilerVersion(),
    compileJettonV2Target('jetton-minter.fc'),
    compileJettonV2Target('jetton-wallet.fc'),
  ]);

  return {
    funcVersion: version.funcVersion,
    minter,
    wallet,
  };
}
