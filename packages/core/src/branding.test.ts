import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG_FILES, isFrameworkSpecifier, LEGACY_PKG_NAME, PKG_NAME } from './branding.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function manifest(rel: string): { bin?: Record<string, string> } {
  return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
}

describe('framework specifiers', () => {
  it('accepts both the current and the pre-rename name', () => {
    expect(isFrameworkSpecifier(PKG_NAME)).toBe(true);
    expect(isFrameworkSpecifier(LEGACY_PKG_NAME)).toBe(true);
    expect(isFrameworkSpecifier('react')).toBe(false);
  });

  it('tries the current config filename before the pre-rename one', () => {
    expect(CONFIG_FILES[0]).toBe('lemonriver.config.ts');
    expect(CONFIG_FILES).toContain('open-slide.config.ts');
  });
});

describe('bin registration', () => {
  // Workspaces scaffolded before the rename run `open-slide dev` from their own
  // package.json scripts, so dropping the old bin name breaks every one of them.
  for (const pkg of ['packages/core', 'packages/cli']) {
    it(`${pkg} registers both bin names against one entry point`, () => {
      const { bin } = manifest(`${pkg}/package.json`);
      expect(bin?.lemonriver).toBeDefined();
      expect(bin?.['open-slide']).toBe(bin?.lemonriver);
    });
  }
});
