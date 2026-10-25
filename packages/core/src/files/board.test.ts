import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readBoardFile,
  readBoardStructure,
  updateBoardFile,
  writeBoardStructure,
} from './board.ts';

async function withFile<T>(fn: (file: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'board-file-'));
  try {
    return await fn(path.join(dir, 'board', 'deck.json'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe('board file', () => {
  it('keeps the cards when the columns are saved, and the columns when the cards are', () =>
    withFile(async (file) => {
      await writeBoardStructure(file, { columns: [{ title: 'A', size: 2 }] });
      await updateBoardFile(file, { cards: { X: { memo: 'm' } }, links: [] });
      await writeBoardStructure(file, { columns: [{ title: 'B', size: 2 }] });
      expect(await readBoardFile(file)).toEqual({
        columns: [{ title: 'B', size: 2 }],
        cards: { X: { memo: 'm' } },
        links: [],
      });
    }));

  it('loses neither save when the columns and the cards are written at once', () =>
    withFile(async (file) => {
      await writeBoardStructure(file, { columns: [{ title: 'A', size: 1 }] });
      await Promise.all([
        writeBoardStructure(file, { columns: [{ title: 'B', size: 1 }] }),
        updateBoardFile(file, { cards: { X: { title: 't' } } }),
        updateBoardFile(file, { links: [{ a: 'X', b: 'Y' }] }),
      ]);
      const stored = await readBoardFile(file);
      expect(stored.columns).toEqual([{ title: 'B', size: 1 }]);
      expect(stored.cards).toEqual({ X: { title: 't' } });
      expect(stored.links).toEqual([{ a: 'X', b: 'Y' }]);
    }));

  it('still reads a board saved before cards existed', () =>
    withFile(async (file) => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify({ columns: [{ title: 'Old', size: 3 }] }));
      expect(await readBoardStructure(file)).toEqual({ columns: [{ title: 'Old', size: 3 }] });
    }));

  it('treats a missing or unreadable file as an empty board', () =>
    withFile(async (file) => {
      expect(await readBoardFile(file)).toEqual({});
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, '{ not json');
      expect(await readBoardFile(file)).toEqual({});
    }));
});
