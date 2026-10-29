import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  boardStructurePath,
  moveBoardRecord,
  readBoardFile,
  readBoardStructure,
  updateBoardFile,
  writeBoardStructure,
} from './store.ts';

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

describe('moveBoardRecord', () => {
  async function withCwd<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'board-move-'));
    try {
      return await fn(cwd);
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  }

  const write = (cwd: string, id: string, body: unknown) =>
    updateBoardFile(boardStructurePath(cwd, id), body as Record<string, unknown>);

  it('moves the record to the new id', () =>
    withCwd(async (cwd) => {
      await write(cwd, 'untitled-1', { cards: { A: { title: 'x' } } });
      await moveBoardRecord(cwd, 'untitled-1', 'real-deck');
      expect(await readBoardFile(boardStructurePath(cwd, 'real-deck'))).toEqual({
        cards: { A: { title: 'x' } },
      });
      expect(await readBoardFile(boardStructurePath(cwd, 'untitled-1'))).toEqual({});
    }));

  it('does nothing when there is no record to move', () =>
    withCwd(async (cwd) => {
      await moveBoardRecord(cwd, 'untitled-1', 'real-deck');
      expect(await readBoardFile(boardStructurePath(cwd, 'real-deck'))).toEqual({});
    }));

  it('keeps the record already at the new id', () =>
    withCwd(async (cwd) => {
      await write(cwd, 'untitled-1', { cards: { A: { title: 'old' } } });
      await write(cwd, 'real-deck', { cards: { B: { title: 'kept' } } });
      await moveBoardRecord(cwd, 'untitled-1', 'real-deck');
      expect(await readBoardFile(boardStructurePath(cwd, 'real-deck'))).toEqual({
        cards: { B: { title: 'kept' } },
      });
      expect(await readBoardFile(boardStructurePath(cwd, 'untitled-1'))).toEqual({
        cards: { A: { title: 'old' } },
      });
    }));
});
