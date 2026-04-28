import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileJettonV2, H72H_V2_DECIMALS, H72H_V2_TOTAL_SUPPLY } from '../src/jetton-v2/index.js';

const outputDir = resolve(process.cwd(), 'build/jetton-v2');
mkdirSync(outputDir, { recursive: true });

const compiled = await compileJettonV2();

writeFileSync(resolve(outputDir, 'JettonMinterV2.code.boc'), Buffer.from(compiled.minter.codeBocBase64, 'base64'));
writeFileSync(resolve(outputDir, 'JettonWalletV2.code.boc'), Buffer.from(compiled.wallet.codeBocBase64, 'base64'));
writeFileSync(resolve(outputDir, 'JettonMinterV2.fif'), compiled.minter.fiftCode);
writeFileSync(resolve(outputDir, 'JettonWalletV2.fif'), compiled.wallet.fiftCode);

const evidence = {
  generatedAt: new Date().toISOString(),
  source: {
    upstream: 'https://github.com/ton-blockchain/jetton-contract',
    localDirectory: 'contracts/jetton-v2',
    note: 'Wallet source is vendored from TON Jetton 2.0. Minter is a fixed-supply 72H V2 variant with mint, burn notification, wallet discovery, top-up, and drop_admin only.',
  },
  compiler: {
    package: '@ton-community/func-js',
    funcVersion: compiled.funcVersion,
  },
  token: {
    name: '72H',
    symbol: '72H',
    decimals: H72H_V2_DECIMALS,
    totalSupplyRaw: H72H_V2_TOTAL_SUPPLY.toString(),
    totalSupply72H: '100000000000',
  },
  contracts: {
    minter: {
      target: compiled.minter.target,
      boc: 'build/jetton-v2/JettonMinterV2.code.boc',
      codeHashHex: compiled.minter.codeHashHex,
      codeHashBase64: compiled.minter.codeHashBase64,
      warnings: compiled.minter.warnings,
    },
    wallet: {
      target: compiled.wallet.target,
      boc: 'build/jetton-v2/JettonWalletV2.code.boc',
      codeHashHex: compiled.wallet.codeHashHex,
      codeHashBase64: compiled.wallet.codeHashBase64,
      warnings: compiled.wallet.warnings,
    },
  },
};

writeFileSync(resolve(outputDir, 'code-hashes.json'), `${JSON.stringify(evidence, null, 2)}\n`);

console.log('72H V2 Jetton build complete.');
console.log(`FunC version: ${compiled.funcVersion}`);
console.log(`Minter code hash: ${compiled.minter.codeHashHex}`);
console.log(`Wallet code hash: ${compiled.wallet.codeHashHex}`);
console.log(`Evidence: ${resolve(outputDir, 'code-hashes.json')}`);
