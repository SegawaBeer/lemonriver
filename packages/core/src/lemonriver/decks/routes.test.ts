import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDeckTimes } from './routes.ts';

describe('readDeckTimes', () => {
  it('reports the entry file time of every deck and skips the rest', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lr-decks-'));
    try {
      await fs.mkdir(path.join(root, 'alpha'));
      await fs.writeFile(path.join(root, 'alpha', 'index.tsx'), '');
      const when = new Date('2026-10-01T08:00:00Z');
      await fs.utimes(path.join(root, 'alpha', 'index.tsx'), when, when);
      await fs.mkdir(path.join(root, 'no entry'));
      await fs.writeFile(path.join(root, 'no entry', 'index.tsx'), '');
      await fs.mkdir(path.join(root, 'empty'));
      await fs.writeFile(path.join(root, '.folders.json'), '{}');
      expect(await readDeckTimes(root)).toEqual({ alpha: { modifiedAt: when.getTime() } });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('returns nothing when the slides folder is missing', async () => {
    expect(await readDeckTimes(path.join(os.tmpdir(), 'lr-decks-missing-folder'))).toEqual({});
  });
});
