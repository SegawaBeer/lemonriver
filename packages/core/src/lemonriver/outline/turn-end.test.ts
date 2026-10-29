import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentSession } from '../../agent/types.ts';
import { DEFAULT_PREFS } from '../../app/lemonriver/agent-prefs/prefs.ts';
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

const resultItem = (aborted: boolean) =>
  ({ kind: 'result', id: 'r1', ts: '', durationMs: 1, costUsd: null, aborted }) as const;

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
          built: 2,
          stage: 'review',
          dispatched: { kind: 'review', n: 0, at: 1 },
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
        built: 3,
        stage: 'review',
        dispatched: { kind: 'review', n: 0, at: 1 },
      });
      await updateBoardFile(file, { cards: { stale: { title: 'old' } }, outline });
      await collectOutline(ctx, fakeStore([], []), 's1', 'u1');

      const stored = await readBoardFile(file);
      expect(sanitizeOutline(stored.outline)?.state).toBe('built');
      expect(stored.cards).toEqual({ stale: { title: 'old' } });
    }));

  it('moves the build on one page per finished turn', () =>
    withWorkspace(async (ctx, file) => {
      await updateBoardFile(file, {
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
          dispatched: { kind: 'page', n: 1, at: 10 },
        }),
      });
      await collectOutline(ctx, fakeStore([userItem, resultItem(false)], []), 's1', 'u1');
      const first = sanitizeOutline((await readBoardFile(file)).outline);
      expect(first?.built).toBe(1);
      expect(first?.stage).toBe('pages');
      expect(first?.dispatched).toBeNull();
      expect(first?.lastTurn).toMatchObject({ kind: 'page', n: 1, ok: true });

      await updateBoardFile(file, {
        outline: { ...first, dispatched: { kind: 'page', n: 2, at: 20 } },
      });
      await collectOutline(ctx, fakeStore([userItem, resultItem(false)], []), 's1', 'u1');
      const second = sanitizeOutline((await readBoardFile(file)).outline);
      expect(second?.built).toBe(2);
      expect(second?.stage).toBe('review');
      expect(second?.state).toBe('building');
    }));

  it('records a failed turn and keeps the page for later', () =>
    withWorkspace(async (ctx, file) => {
      await updateBoardFile(file, {
        outline: board({
          state: 'building',
          brief: 'b',
          pages: 8,
          files: [],
          items: [{ id: 'p1', title: 'One', kind: 'cover' }],
          updatedAt: 0,
          dispatched: { kind: 'page', n: 1, at: 10 },
        }),
      });
      await collectOutline(
        ctx,
        fakeStore([userItem, { kind: 'error', id: 'e1', ts: '', text: 'boom' }], []),
        's1',
        'u1',
      );
      const stored = sanitizeOutline((await readBoardFile(file)).outline);
      expect(stored?.built).toBe(0);
      expect(stored?.lastTurn).toMatchObject({ kind: 'page', n: 1, ok: false });
      expect(stored?.dispatched).toBeNull();
    }));

  it('holds the step while the turn waits for an answer', () =>
    withWorkspace(async (ctx, file) => {
      const outline = board({
        state: 'building',
        brief: 'b',
        pages: 8,
        files: [],
        items: [{ id: 'p1', title: 'One', kind: 'cover' }],
        updatedAt: 0,
        built: 1,
        stage: 'review',
        dispatched: { kind: 'review', n: 0, at: 10 },
      });
      await updateBoardFile(file, { outline });
      await collectOutline(
        ctx,
        fakeStore(
          [
            userItem,
            {
              kind: 'question',
              id: 'q1',
              ts: '',
              questions: [],
              answers: null,
              status: 'pending',
            },
          ],
          [],
        ),
        's1',
        'u1',
      );
      expect(sanitizeOutline((await readBoardFile(file)).outline)).toEqual(outline);
    }));

  it('ignores a turn it did not dispatch', () =>
    withWorkspace(async (ctx, file) => {
      const outline = board({
        state: 'building',
        brief: 'b',
        pages: 8,
        files: [],
        items: [{ id: 'p1', title: 'One', kind: 'cover' }],
        updatedAt: 0,
        built: 1,
      });
      await updateBoardFile(file, { outline });
      await collectOutline(ctx, fakeStore([userItem, resultItem(false)], []), 's1', 'u1');
      expect(sanitizeOutline((await readBoardFile(file)).outline)).toEqual(outline);
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

  it('starts the build itself when the outline is set to direct', () =>
    withWorkspace(async (ctx, file) => {
      await updateBoardFile(file, {
        outline: board({
          state: 'drafting',
          brief: 'b',
          pages: 8,
          files: [],
          items: [],
          updatedAt: 0,
          prefs: { ...DEFAULT_PREFS, outline: 'direct' },
        }),
      });
      await collectOutline(ctx, fakeStore([userItem, assistantItem(BLOCK)], []), 's1', 'u1');

      const stored = await readBoardFile(file);
      const next = sanitizeOutline(stored.outline);
      expect(next?.state).toBe('building');
      expect(next?.built).toBe(0);
      expect(next?.stage).toBe('pages');
      expect(next?.items).toHaveLength(2);
      expect(typeof stored.buildBackup).toBe('string');
      expect(stored.buildBackup).toContain('export default');
    }));

  it('records what the user chose when the review asked', () =>
    withWorkspace(async (ctx, file) => {
      await updateBoardFile(file, {
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
          built: 2,
          stage: 'review',
          dispatched: { kind: 'review', n: 0, at: 10 },
        }),
      });
      const question: AgentSession['items'][number] = {
        kind: 'question',
        id: 'q1',
        ts: '',
        questions: [
          { question: 'Which number?', header: 'Numbers', options: [], multiSelect: false },
        ],
        answers: { 'Which number?': '41%' },
        status: 'answered',
      };
      await collectOutline(ctx, fakeStore([userItem, question, resultItem(false)], []), 's1', 'u1');

      const stored = sanitizeOutline((await readBoardFile(file)).outline);
      expect(stored?.decisions).toEqual([{ id: 'q1:0', question: 'Numbers', answer: '41%' }]);
    }));

  it('does not add the same decision twice when a turn reports it again', () =>
    withWorkspace(async (ctx, file) => {
      const outline = board({
        state: 'building',
        brief: 'b',
        pages: 8,
        files: [],
        items: [{ id: 'p1', title: 'One', kind: 'cover' }],
        updatedAt: 0,
        built: 1,
        stage: 'review',
        dispatched: { kind: 'review', n: 0, at: 10 },
        decisions: [{ id: 'q1:0', question: 'Numbers', answer: '41%' }],
      });
      await updateBoardFile(file, { outline });
      const question: AgentSession['items'][number] = {
        kind: 'question',
        id: 'q1',
        ts: '',
        questions: [
          { question: 'Which number?', header: 'Numbers', options: [], multiSelect: false },
        ],
        answers: { 'Which number?': '41%' },
        status: 'answered',
      };
      await collectOutline(ctx, fakeStore([userItem, question, resultItem(false)], []), 's1', 'u1');

      const stored = sanitizeOutline((await readBoardFile(file)).outline);
      expect(stored?.decisions).toEqual([{ id: 'q1:0', question: 'Numbers', answer: '41%' }]);
    }));
});
