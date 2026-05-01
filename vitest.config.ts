import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    exclude: ['tests/apps/multi-millionaire/legacy/**/*.spec.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
