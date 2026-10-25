import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./packages/core/src/app', import.meta.url)),
    },
  },
  test: {
    // apps/web is upstream's site and its changelog page tracks upstream
    // releases, which our version line does not share.
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'],
    // Screenshot and preview tooling copies apps into e2e/.scratch.
    exclude: [...configDefaults.exclude, '**/.scratch/**'],
    environment: 'node',
  },
});
