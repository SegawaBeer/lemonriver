import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { declaredFrameworkSpecifier, readFrameworkDependency } from './workspace-specifier.ts';

async function project(pkg: Record<string, unknown>): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'open-slide-specifier-'));
  await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify(pkg));
  return cwd;
}

describe('declaredFrameworkSpecifier', () => {
  it('returns the pre-rename key for a workspace that has not migrated', async () => {
    const cwd = await project({ dependencies: { '@open-slide/core': '^2.0.1' } });
    expect(declaredFrameworkSpecifier(cwd)).toBe('@open-slide/core');
  });

  it('returns the current key once a workspace declares it', async () => {
    const cwd = await project({ dependencies: { '@lemonriver/core': '^0.1.0' } });
    expect(declaredFrameworkSpecifier(cwd)).toBe('@lemonriver/core');
  });

  it('prefers the current key when a workspace carries both', async () => {
    const cwd = await project({
      dependencies: {
        '@open-slide/core': 'npm:@lemonriver/core@^0.1.0',
        '@lemonriver/core': '^0.1.0',
      },
    });
    expect(declaredFrameworkSpecifier(cwd)).toBe('@lemonriver/core');
  });

  it('falls back to the current name when the workspace declares nothing', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'open-slide-specifier-'));
    expect(declaredFrameworkSpecifier(cwd)).toBe('@lemonriver/core');
  });
});

describe('readFrameworkDependency', () => {
  it('leaves a plain dependency plain', async () => {
    const cwd = await project({ dependencies: { '@lemonriver/core': '^0.1.0' } });
    expect(readFrameworkDependency(cwd)).toEqual({
      key: '@lemonriver/core',
      pkg: '@lemonriver/core',
      addTarget: '@lemonriver/core@latest',
    });
  });

  it('re-adds an aliased dependency as the same alias', async () => {
    const cwd = await project({
      dependencies: { '@open-slide/core': 'npm:@lemonriver/core@^0.1.0' },
    });
    expect(readFrameworkDependency(cwd)).toEqual({
      key: '@open-slide/core',
      pkg: '@lemonriver/core',
      addTarget: '@open-slide/core@npm:@lemonriver/core@latest',
    });
  });

  it('resolves an alias that carries no version', async () => {
    const cwd = await project({ dependencies: { '@open-slide/core': 'npm:@lemonriver/core' } });
    expect(readFrameworkDependency(cwd).pkg).toBe('@lemonriver/core');
  });

  it('reads devDependencies too', async () => {
    const cwd = await project({ devDependencies: { '@open-slide/core': '^2.0.1' } });
    expect(readFrameworkDependency(cwd).key).toBe('@open-slide/core');
  });

  it('falls back to the current name when the workspace declares nothing', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'open-slide-specifier-'));
    expect(readFrameworkDependency(cwd).pkg).toBe('@lemonriver/core');
  });
});
