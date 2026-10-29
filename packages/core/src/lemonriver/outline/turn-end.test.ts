import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentSession } from '../../agent/types.ts';
import { type Outline, sanitizeOutline } from '../../app/lemonriver/outline/model.ts';
import type { ApiContext } from '../../vite/routes/context.ts';
import { boardStructurePath, readBoardFile, updateBoardFile } from '../board/store.ts';
import { collectOutline } from './turn-end.ts';

type Store = Parameters<typeof collectOutline>[1];

function board(body: Record<string, unknown>): Outline {
  const outline = sanitizeOutline(body);
  if (!outline) throw new Error('test outline is invalid');
  return outline;
}

const SLIDE = 'deck-1';

async function withWorkspace<T>(fn: (ctx: ApiContext, file: string) => Promise<T>): Promise<T> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'lr-outline-'));
  const slidesRoot = path.join(cwd, 'slides');
  await fs.mkdir(path.join(slidesRoot, SLIDE), { recursive: true });
  await fs.writeFile(
    path.join(slidesRoot, SLIDE, 'index.tsx'),
    [
      'export const meta = { title: "Deck" };',
      'export default [',
      '  <section><h1>One</h1></section>,',
      '  <section><h1>Two</h1></section>,',
      '];',
    ].join('\n'),
  );
  const ctx = { userCwd: cwd, slidesRoot } as ApiContext;
  try {
    return await fn(ctx, boardStructurePath(cwd, SLIDE));
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
}

function fakeStore(items: AgentSession['items'], updates: string[]): Store {
  const session = { id: 's1', slideId: SLIDE, items } as unknown as AgentSession;
  return {
    get: () => session,
    updateItem: (_sessionId: string, itemId: string, _kind: 'assistant', changes: unknown) => {
      updates.push(`${itemId}:${(changes as { text: string }).text}`);
      return null;
    },
  } as unknown as Store;
}

const userItem = { kind: 'user', id: 'u1', ts: '', text: 'plan this' } as const;
const assistantItem = (text: string) =>
  ({ kind: 'assistant', id: 'a1', ts: '', text, streaming: false }) as const;

const BLOCK =
  'Here is the plan.\n<lemonriver-outline>[{"title":"Cover","kind":"cover"},{"title":"End","kind":"end"}]</lemonriver-outline>';

describe('collectOutline', () => {
  it('stores the pages from the reply and takes the block out of the transcript', () =>
    withWorkspace(async (ctx, file) => {
      await updateBoardFile(file, {
        outline: board({
          state: 'drafting',
          brief: 'b',
          pages: 8,
          files: [],
          items: [],
          updatedAt: 0,
        }),
      });
      const updates: string[] = [];
      await collectOutline(ctx, fakeStore([userItem, assistantItem(BLOCK)], updates), 's1', 'u1');

      const stored = sanitizeOutline((await readBoardFile(file)).outline);
      expect(stored?.state).toBe('ready');
      expect(stored?.items.map((page) => [page.title, page.kind])).toEqual([
        ['Cover', 'cover'],
        ['End', 'end'],
      ]);
      expect(updates).toEqual(['a1:Here is the plan.']);
    }));

  it('marks a reply without a block as failed', () =>
    withWorkspace(async (ctx, file) => {
      await updateBoardFile(file, {
        outline: board({
          state: 'drafting',
          brief: 'b',
          pages: 8,
          files: [],
          items: [],
          updatedAt: 0,
        }),
      });
      const updates: string[] = [];
      await collectOutline(
        ctx,
        fakeStore([userItem, assistantItem('I could not plan it.')], updates),
        's1',
        'u1',
      );
      expect(sanitizeOutline((await readBoardFile(file)).outline)?.state).toBe('failed');
      expect(updates).toEqual([]);
    }));

  it('writes each outline title onto its board card once the deck is built', () =>
    withWorkspace(async (ctx, file) => {
      await updateBoardFile(file, {
        columns: [{ title: '', size: 2 }],
        cards: { stale: { title: 'old' } },
        outline: board({
          state: 'building',
          brief: 'b',
          pages: 8,
          files: [],
          items: [
            { id: 'p1', title: 'One', kind: 'cover' },
            { id: 'p2', title: 'Two', kind: 'end' },
          ],
          updatedAt: 0,
        }),
      });
      await collectOutline(ctx, fakeStore([], []), 's1', 'u1');

      const stored = await readBoardFile(file);
      expect(sanitizeOutline(stored.outline)?.state).toBe('built');
      const cards = stored.cards as Record<string, { title?: string }>;
      expect(cards.stale).toEqual({ title: 'old' });
      expect(Object.keys(cards)).toHaveLength(3);
      expect(Object.values(cards).map((card) => card.title)).toEqual(['old', 'One', 'Two']);
    }));

  it('leaves the cards alone when the deck has a different number of pages', () =>
    withWorkspace(async (ctx, file) => {
      const outline = board({
        state: 'building',
        brief: 'b',
        pages: 8,
        files: [],
        items: [
          { id: 'p1', title: 'One', kind: 'cover' },
          { id: 'p2', title: 'Two', kind: 'list' },
          { id: 'p3', title: 'Three', kind: 'end' },
        ],
        updatedAt: 0,
      });
      await updateBoardFile(file, { cards: { stale: { title: 'old' } }, outline });
      await collectOutline(ctx, fakeStore([], []), 's1', 'u1');

      const stored = await readBoardFile(file);
      expect(sanitizeOutline(stored.outline)?.state).toBe('built');
      expect(stored.cards).toEqual({ stale: { title: 'old' } });
    }));

  it('does nothing for an outline that is not drafting or building', () =>
    withWorkspace(async (ctx, file) => {
      const outline = board({
        state: 'ready',
        brief: 'b',
        pages: 8,
        files: [],
        items: [{ id: 'p1', title: 'One', kind: 'cover' }],
        updatedAt: 7,
      });
      await updateBoardFile(file, { outline });
      await collectOutline(ctx, fakeStore([userItem, assistantItem(BLOCK)], []), 's1', 'u1');
      expect(sanitizeOutline((await readBoardFile(file)).outline)).toEqual(outline);
    }));
});
