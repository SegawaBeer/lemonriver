import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentItem, AgentSession } from '../../agent/types.ts';
import type { ApiContext } from '../../vite/routes/context.ts';
import { cancelApply, collectApply, linkApply, startApply, undoApply } from './apply.ts';
import { boardStructurePath, readBoardFile, updateBoardFile } from './store.ts';

const SLIDE = 'deck-apply';
const OTHER = 'deck-other';

const SOURCE = [
  'export const meta = { title: "Deck" };',
  'export default [',
  '  <section><h1>One</h1></section>,',
  '  <section><h1>Two</h1></section>,',
  '];',
].join('\n');

async function withWorkspace<T>(fn: (ctx: ApiContext, file: string) => Promise<T>): Promise<T> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'lr-apply-'));
  const slidesRoot = path.join(cwd, 'slides');
  for (const deck of [SLIDE, OTHER]) {
    await fs.mkdir(path.join(slidesRoot, deck), { recursive: true });
    await fs.writeFile(path.join(slidesRoot, deck, 'index.tsx'), SOURCE);
  }
  const ctx = { userCwd: cwd, slidesRoot } as ApiContext;
  try {
    return await fn(ctx, boardStructurePath(cwd, SLIDE));
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
}

// Page keys are the deck's own entries, the way the board keys its cards.
const PAGE_A = '<section><h1>One</h1></section>';
const PAGE_B = '<section><h1>Two</h1></section>';

const placement = {
  origin: { page: PAGE_A, before: null, block: 'x' },
  block: { kind: 'point', text: 'Margins held', loc: '3:4' },
  to: { page: PAGE_B, before: null },
};

const applying = (sessionId: string | null = 's1', userItemId: string | null = 'u1') => ({
  startedAt: 1,
  sessionId,
  userItemId,
});

function fakeStore(items: AgentSession['items'], slideId = SLIDE) {
  const session = { id: 's1', slideId, items } as unknown as AgentSession;
  return { get: () => session };
}

const userItem = { kind: 'user', id: 'u1', ts: '', text: 'apply' } as const;
const assistantItem = (text: string) =>
  ({ kind: 'assistant', id: 'a1', ts: '', text, streaming: false }) as const;
const resultItem = (aborted: boolean) =>
  ({ kind: 'result', id: 'r1', ts: '', durationMs: 1, costUsd: null, aborted }) as const;
const errorItem = (text: string) => ({ kind: 'error', id: 'e1', ts: '', text }) as const;
const questionItem = (status: 'pending' | 'answered'): AgentItem =>
  ({
    kind: 'question',
    id: 'q1',
    ts: '',
    text: 'Which one?',
    questions: [],
    answers: null,
    status,
  }) as unknown as AgentItem;

async function seed(file: string, extra: Record<string, unknown> = {}): Promise<void> {
  await updateBoardFile(file, {
    changes: [placement],
    restructures: [{ kind: 'merge', pages: [PAGE_A, PAGE_B] }],
    ...extra,
  });
}

describe('startApply', () => {
  it('backs the deck up, records the apply, and writes the prompt', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file);
      const result = await startApply(ctx, SLIDE);
      if (!result.ok) throw new Error(result.error);

      expect(result.prompt).toContain('Move the point "Margins held" from page 1 to page 2');
      expect(result.prompt).toContain('Merge page 2 into page 1');

      const stored = await readBoardFile(file);
      expect(stored.applyBackup).toBe(SOURCE);
      expect(stored.applying).toMatchObject({ sessionId: null, userItemId: null });
      expect(typeof (stored.applying as { startedAt: number }).startedAt).toBe('number');
    }));

  it('refuses while the deck is being laid out from its outline', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file, { outline: { state: 'building', items: [], updatedAt: 0 } });
      const result = await startApply(ctx, SLIDE);
      expect(result).toMatchObject({ ok: false, status: 409 });
      expect((await readBoardFile(file)).applyBackup).toBeUndefined();
    }));

  it('refuses while another apply is running', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file, { applying: applying() });
      expect(await startApply(ctx, SLIDE)).toMatchObject({ ok: false, status: 409 });
    }));

  it('refuses an empty list', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file, { changes: [], restructures: [] });
      expect(await startApply(ctx, SLIDE)).toMatchObject({ ok: false, status: 409 });
      expect((await readBoardFile(file)).applying).toBeUndefined();
    }));
});

describe('linkApply', () => {
  it('writes the session that carries the prompt', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file, { applying: applying(null, null) });
      expect(await linkApply(ctx, SLIDE, 's1', 'u9')).toBe(true);
      expect((await readBoardFile(file)).applying).toMatchObject({
        sessionId: 's1',
        userItemId: 'u9',
      });
    }));

  it('does nothing when no apply is running', () =>
    withWorkspace(async (ctx) => {
      expect(await linkApply(ctx, SLIDE, 's1', 'u9')).toBe(false);
    }));
});

describe('collectApply', () => {
  it('clears the list and keeps the backup when the turn finished', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file, { applying: applying(), applyBackup: SOURCE });
      await collectApply(
        ctx,
        fakeStore([userItem, assistantItem('Done.'), resultItem(false)]),
        's1',
        'u1',
      );

      const stored = await readBoardFile(file);
      expect(stored.changes).toEqual([]);
      expect(stored.restructures).toEqual([]);
      expect(stored.applying).toBeUndefined();
      expect(stored.applyBackup).toBe(SOURCE);
      expect(stored.lastApply).toMatchObject({ ok: true });
      expect((stored.lastApply as { pages: string[] }).pages.sort()).toEqual(
        [PAGE_A, PAGE_B].sort(),
      );
    }));

  it('keeps the list and says why when the turn failed', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file, { applying: applying(), applyBackup: SOURCE });
      await collectApply(
        ctx,
        fakeStore([userItem, errorItem('the file did not compile'), resultItem(false)]),
        's1',
        'u1',
      );

      const stored = await readBoardFile(file);
      expect(stored.changes).toHaveLength(1);
      expect(stored.restructures).toHaveLength(1);
      expect(stored.applying).toBeUndefined();
      expect(stored.applyBackup).toBeUndefined();
      expect(stored.lastApply).toMatchObject({ ok: false, error: 'the file did not compile' });
    }));

  it('treats a run the user stopped as a failure', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file, { applying: applying(), applyBackup: SOURCE });
      await collectApply(
        ctx,
        fakeStore([userItem, assistantItem('Half'), resultItem(true)]),
        's1',
        'u1',
      );
      expect((await readBoardFile(file)).changes).toHaveLength(1);
      expect((await readBoardFile(file)).lastApply).toMatchObject({ ok: false });
    }));

  it('waits when the agent asked a question and nobody answered yet', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file, { applying: applying(), applyBackup: SOURCE });
      await collectApply(
        ctx,
        fakeStore([userItem, assistantItem('Which one?'), questionItem('pending')]),
        's1',
        'u1',
      );

      const stored = await readBoardFile(file);
      expect(stored.applying).toBeTruthy();
      expect(stored.changes).toHaveLength(1);
      expect(stored.lastApply).toBeUndefined();
    }));

  it('ignores a session of another deck', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file, { applying: applying(), applyBackup: SOURCE });
      await collectApply(
        ctx,
        fakeStore([userItem, assistantItem('Done.'), resultItem(false)], OTHER),
        's1',
        'u1',
      );
      expect((await readBoardFile(file)).applying).toBeTruthy();
    }));

  it('ignores a turn of a session that is not the one holding the prompt', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file, {
        applying: { startedAt: 1, sessionId: 'other-session', userItemId: 'u1' },
        applyBackup: SOURCE,
      });
      await collectApply(
        ctx,
        fakeStore([userItem, assistantItem('Done.'), resultItem(false)]),
        's1',
        'u1',
      );
      expect((await readBoardFile(file)).applying).toBeTruthy();
    }));
});

describe('undoApply', () => {
  it('writes the deck back byte for byte and drops the backup', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file, {
        applying: undefined,
        applyBackup: SOURCE,
        lastApply: { ok: true, at: 1, pages: [PAGE_A] },
      });
      const entry = path.join(ctx.slidesRoot, SLIDE, 'index.tsx');
      await fs.writeFile(entry, `${SOURCE}\n// applied\n`);

      expect(await undoApply(ctx, SLIDE)).toEqual({ ok: true });
      expect(await fs.readFile(entry, 'utf8')).toBe(SOURCE);
      expect((await readBoardFile(file)).applyBackup).toBeUndefined();
      expect((await readBoardFile(file)).lastApply).toBeUndefined();
    }));

  it('refuses when there is nothing to undo', () =>
    withWorkspace(async (ctx) => {
      expect(await undoApply(ctx, SLIDE)).toMatchObject({ ok: false, status: 409 });
    }));
});

describe('cancelApply', () => {
  it('stops waiting and leaves the deck and the list alone', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file, { applying: applying(), applyBackup: SOURCE });
      expect(await cancelApply(ctx, SLIDE)).toBe(true);
      const stored = await readBoardFile(file);
      expect(stored.applying).toBeUndefined();
      expect(stored.changes).toHaveLength(1);
      expect(await fs.readFile(path.join(ctx.slidesRoot, SLIDE, 'index.tsx'), 'utf8')).toBe(SOURCE);
    }));
});
