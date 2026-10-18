import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateSlidesModule, loadUserConfig } from './open-slide-plugin.ts';

async function withSlidesRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lemonriver-test-'));
  try {
    return await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function writeSlide(root: string, id: string): Promise<string> {
  await fs.mkdir(path.join(root, id), { recursive: true });
  const entry = path.join(root, id, 'index.tsx');
  await fs.writeFile(
    entry,
    `export const meta = { title: '${id}' };\nexport default [];\n`,
    'utf8',
  );
  return entry;
}

describe('generateSlidesModule', () => {
  it('keeps slides whose id is ASCII-safe and reports none ignored', async () => {
    await withSlidesRoot(async (root) => {
      const files = [await writeSlide(root, 'cover'), await writeSlide(root, 'intro_2')].sort();

      const { code, ignored } = await generateSlidesModule(files, root, false);

      expect(ignored).toEqual([]);
      expect(code).toContain('export const slideIds = ["cover","intro_2"];');
    });
  });

  it('excludes folders whose id is not ASCII-safe and reports them as ignored', async () => {
    await withSlidesRoot(async (root) => {
      const files = [await writeSlide(root, 'cover'), await writeSlide(root, '推薦系統')].sort();

      const { code, ignored } = await generateSlidesModule(files, root, false);

      expect(ignored).toEqual(['推薦系統']);
      expect(code).toContain('export const slideIds = ["cover"];');
      expect(code).not.toContain('推薦系統');
    });
  });
});

describe('loadUserConfig', () => {
  async function project(files: Record<string, string>): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lemonriver-config-'));
    for (const [name, body] of Object.entries(files)) {
      await fs.writeFile(path.join(root, name), body, 'utf8');
    }
    return root;
  }

  it('reads lemonriver.config.ts', async () => {
    const root = await project({ 'lemonriver.config.ts': 'export default { port: 1234 };\n' });
    await expect(loadUserConfig(root)).resolves.toMatchObject({ port: 1234 });
  });

  // A workspace scaffolded before the rename keeps its config under the old
  // name; without the fallback it silently runs on defaults instead.
  it('falls back to open-slide.config.ts', async () => {
    const root = await project({ 'open-slide.config.ts': 'export default { port: 4321 };\n' });
    await expect(loadUserConfig(root)).resolves.toMatchObject({ port: 4321 });
  });

  it('prefers the current filename when a workspace carries both', async () => {
    const root = await project({
      'lemonriver.config.ts': 'export default { port: 1111 };\n',
      'open-slide.config.ts': 'export default { port: 2222 };\n',
    });
    await expect(loadUserConfig(root)).resolves.toMatchObject({ port: 1111 });
  });

  it('returns an empty config when neither file exists', async () => {
    const root = await project({});
    await expect(loadUserConfig(root)).resolves.toEqual({});
  });
});
