import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/jetton-v2.spec.ts', 'tests/multi-millionaire-deposit-vault.spec.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
