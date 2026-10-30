import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SessionStore } from '../../agent/store.ts';
import type { AgentItem, AgentSession } from '../../agent/types.ts';
import type { ApiContext } from '../../vite/routes/context.ts';
import {
  cancelApply,
  collectApply,
  linkApply,
  saveChapterPlan,
  startApply,
  undoApply,
} from './apply.ts';
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
  const updates: { itemId: string; text: string }[] = [];
  const updateItem = ((
    _sessionId: string,
    itemId: string,
    kind: string,
    changes: { text?: string },
  ) => {
    if (kind === 'assistant' && typeof changes.text === 'string') {
      updates.push({ itemId, text: changes.text });
    }
    return null;
  }) as unknown as SessionStore['updateItem'];
  return { get: () => session, updateItem, updates };
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

  it('puts the chapters back as they were', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file, {
        applying: undefined,
        applyBackup: SOURCE,
        applyColumnsBackup: COLUMNS,
        columns: [
          { title: 'Opening', size: 2 },
          { title: 'Middle', size: 1 },
        ],
        lastApply: { ok: true, at: 1, pages: [PAGE_A] },
      });
      expect(await undoApply(ctx, SLIDE)).toEqual({ ok: true });
      expect((await readBoardFile(file)).columns).toEqual(COLUMNS);
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

async function writeDeck(ctx: ApiContext, entries: string[]): Promise<void> {
  const source = [
    'export const meta = { title: "Deck" };',
    'export default [',
    ...entries.map((entry) => `  ${entry},`),
    '];',
  ].join('\n');
  await fs.writeFile(path.join(ctx.slidesRoot, SLIDE, 'index.tsx'), source, 'utf8');
}

const COLUMNS = [
  { title: 'Opening', size: 1 },
  { title: 'Middle', size: 1 },
];
const APPLY_COLUMNS = [
  { title: 'Opening', keys: [PAGE_A] },
  { title: 'Middle', keys: [PAGE_B] },
];

const planItem = (title: string) => ({ id: `p-${title}`, title, kind: 'page' });
const planBlock = (titles: string[]) =>
  `Planned.\n<lemonriver-chapter>${JSON.stringify(
    titles.map((title) => ({ title, kind: 'page' })),
  )}</lemonriver-chapter>`;

describe('startApply with a task', () => {
  it('remembers which chapter held each page, and the chapters themselves', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file, { changes: [placement], columns: COLUMNS });
      const result = await startApply(ctx, SLIDE);
      if (!result.ok) throw new Error(result.error);
      const stored = await readBoardFile(file);
      expect(stored.applyColumns).toEqual(APPLY_COLUMNS);
      expect(stored.applyColumnsBackup).toEqual(COLUMNS);
      expect(stored.applying).toMatchObject({ task: { kind: 'changes' } });
    }));

  it('writes a message for one page and names only that page', () =>
    withWorkspace(async (ctx, file) => {
      await updateBoardFile(file, { cards: { [PAGE_B]: { title: 'Two', memo: 'lead with it' } } });
      const result = await startApply(
        ctx,
        SLIDE,
        { kind: 'page', page: PAGE_B, action: 'memo' },
        'en',
      );
      if (!result.ok) throw new Error(result.error);
      expect(result.prompt).toContain('Work on page 2 "Two" of slides/deck-apply/index.tsx only.');
      expect(result.prompt).toContain('Change this page as the note says: "lead with it"');
      expect((await readBoardFile(file)).applyBackup).toBe(SOURCE);
    }));

  it('refuses a note action on a page with no note', () =>
    withWorkspace(async (ctx, file) => {
      const result = await startApply(ctx, SLIDE, { kind: 'page', page: PAGE_A, action: 'memo' });
      expect(result).toMatchObject({ ok: false, status: 422 });
      expect((await readBoardFile(file)).applying).toBeUndefined();
    }));

  it('plans a chapter without backing anything up', () =>
    withWorkspace(async (ctx, file) => {
      await updateBoardFile(file, { columns: COLUMNS });
      const result = await startApply(ctx, SLIDE, {
        kind: 'chapter-plan',
        chapter: 1,
        title: 'Middle',
        brief: 'the shift',
        count: 2,
      });
      if (!result.ok) throw new Error(result.error);
      expect(result.prompt).toContain(
        'This turn is planning only: do not write, edit or create any file.',
      );
      expect(result.prompt).toContain('It has these pages now: page 2.');
      const stored = await readBoardFile(file);
      expect(stored.applyBackup).toBeUndefined();
      expect(stored.applying).toMatchObject({ task: { kind: 'chapter-plan', chapter: 1 } });
    }));

  it('refuses to write a chapter with no planned titles', () =>
    withWorkspace(async (ctx) => {
      const result = await startApply(ctx, SLIDE, {
        kind: 'chapter-write',
        chapter: 1,
        title: 'Middle',
      });
      expect(result).toMatchObject({ ok: false, status: 409 });
    }));
});

describe('collectApply with a page task', () => {
  it('leaves the change list alone and lights the page and its new neighbour', () =>
    withWorkspace(async (ctx, file) => {
      await seed(file, {
        applying: {
          startedAt: 1,
          sessionId: 's1',
          userItemId: 'u1',
          task: { kind: 'page', page: PAGE_B, action: 'expand' },
        },
        applyBackup: SOURCE,
        applyColumns: APPLY_COLUMNS,
      });
      await writeDeck(ctx, [PAGE_A, PAGE_B, '<section><h1>Deeper</h1></section>']);

      await collectApply(
        ctx,
        fakeStore([userItem, assistantItem('Done.'), resultItem(false)]),
        's1',
        'u1',
      );

      const stored = await readBoardFile(file);
      expect(stored.changes).toHaveLength(1);
      expect(stored.columns).toEqual([
        { title: 'Opening', size: 1 },
        { title: 'Middle', size: 2 },
      ]);
      expect((stored.lastApply as { pages: string[] }).pages.sort()).toEqual(
        [PAGE_B, '<section><h1>Deeper</h1></section>'].sort(),
      );
    }));
});

describe('collectApply with a chapter plan', () => {
  const planTask = {
    kind: 'chapter-plan' as const,
    chapter: 1,
    title: 'Middle',
    brief: 'the shift',
    count: 2,
  };

  it('keeps the titles and takes the block out of the reply, with no backup', () =>
    withWorkspace(async (ctx, file) => {
      await updateBoardFile(file, {
        applying: { startedAt: 1, sessionId: 's1', userItemId: 'u1', task: planTask },
      });
      const store = fakeStore([
        userItem,
        assistantItem(planBlock(['The shift', 'Why now'])),
        resultItem(false),
      ]);

      await collectApply(ctx, store, 's1', 'u1');

      const stored = await readBoardFile(file);
      expect(stored.applying).toBeUndefined();
      expect(stored.applyBackup).toBeUndefined();
      expect(stored.lastApply).toBeUndefined();
      expect(stored.chapterPlan).toMatchObject({ chapter: 1, state: 'ready', brief: 'the shift' });
      expect(
        (stored.chapterPlan as { items: { title: string }[] }).items.map((i) => i.title),
      ).toEqual(['The shift', 'Why now']);
      expect(store.updates).toEqual([{ itemId: 'a1', text: 'Planned.' }]);
    }));

  it('says the agent gave no titles when there is no block', () =>
    withWorkspace(async (ctx, file) => {
      await updateBoardFile(file, {
        applying: { startedAt: 1, sessionId: 's1', userItemId: 'u1', task: planTask },
      });
      await collectApply(
        ctx,
        fakeStore([userItem, assistantItem('I thought about it.'), resultItem(false)]),
        's1',
        'u1',
      );
      const stored = await readBoardFile(file);
      expect(stored.applying).toBeUndefined();
      expect(stored.chapterPlan).toMatchObject({ chapter: 1, state: 'failed', items: [] });
    }));

  it('keeps the error when the turn failed', () =>
    withWorkspace(async (ctx, file) => {
      await updateBoardFile(file, {
        applying: { startedAt: 1, sessionId: 's1', userItemId: 'u1', task: planTask },
      });
      await collectApply(
        ctx,
        fakeStore([userItem, errorItem('no such file'), resultItem(false)]),
        's1',
        'u1',
      );
      expect((await readBoardFile(file)).chapterPlan).toMatchObject({
        state: 'failed',
        error: 'no such file',
      });
    }));
});

describe('collectApply with a chapter write', () => {
  const writeTask = { kind: 'chapter-write' as const, chapter: 1, title: 'Middle' };
  const plan = {
    chapter: 1,
    title: 'Middle',
    brief: 'the shift',
    items: [planItem('The shift'), planItem('Why now')],
    state: 'ready' as const,
  };

  it('puts every new page in the chapter and titles its card', () =>
    withWorkspace(async (ctx, file) => {
      await updateBoardFile(file, {
        applying: { startedAt: 1, sessionId: 's1', userItemId: 'u1', task: writeTask },
        applyBackup: SOURCE,
        applyColumns: APPLY_COLUMNS,
        chapterPlan: plan,
      });
      const first = '<section><h1>The shift</h1></section>';
      const second = '<section><h1>Why now</h1></section>';
      await writeDeck(ctx, [PAGE_A, PAGE_B, first, second]);

      await collectApply(
        ctx,
        fakeStore([userItem, assistantItem('Done.'), resultItem(false)]),
        's1',
        'u1',
      );

      const stored = await readBoardFile(file);
      expect(stored.columns).toEqual([
        { title: 'Opening', size: 1 },
        { title: 'Middle', size: 3 },
      ]);
      expect(stored.cards).toMatchObject({
        [first]: { title: 'The shift' },
        [second]: { title: 'Why now' },
      });
      expect(stored.chapterPlan).toBeUndefined();
      expect((stored.lastApply as { pages: string[] }).pages.sort()).toEqual(
        [first, second].sort(),
      );
    }));

  it('fills a chapter that had no pages at all', () =>
    withWorkspace(async (ctx, file) => {
      await updateBoardFile(file, {
        applying: {
          startedAt: 1,
          sessionId: 's1',
          userItemId: 'u1',
          task: { ...writeTask, chapter: 1 },
        },
        applyBackup: SOURCE,
        applyColumns: [
          { title: 'Opening', keys: [PAGE_A] },
          { title: 'Middle', keys: [] },
        ],
        chapterPlan: { ...plan, items: [planItem('Only')] },
      });
      const only = '<section><h1>Only</h1></section>';
      await writeDeck(ctx, [PAGE_A, only]);

      await collectApply(
        ctx,
        fakeStore([userItem, assistantItem('Done.'), resultItem(false)]),
        's1',
        'u1',
      );

      expect((await readBoardFile(file)).columns).toEqual([
        { title: 'Opening', size: 1 },
        { title: 'Middle', size: 1 },
      ]);
    }));

  it('keeps the plan when the turn failed', () =>
    withWorkspace(async (ctx, file) => {
      await updateBoardFile(file, {
        applying: { startedAt: 1, sessionId: 's1', userItemId: 'u1', task: writeTask },
        applyBackup: SOURCE,
        applyColumns: APPLY_COLUMNS,
        chapterPlan: plan,
      });
      await collectApply(
        ctx,
        fakeStore([userItem, errorItem('the file did not compile'), resultItem(false)]),
        's1',
        'u1',
      );
      const stored = await readBoardFile(file);
      expect(stored.chapterPlan).toMatchObject({ state: 'ready' });
      expect(stored.lastApply).toMatchObject({ ok: false });
    }));
});

describe('saveChapterPlan', () => {
  it('stores edits and drops the plan when handed null', () =>
    withWorkspace(async (ctx, file) => {
      await saveChapterPlan(ctx, SLIDE, {
        chapter: 0,
        title: 'Opening',
        brief: 'start',
        items: [{ id: 'a', title: 'Hi', kind: 'page' }],
        state: 'ready',
      });
      expect((await readBoardFile(file)).chapterPlan).toMatchObject({ chapter: 0 });
      await saveChapterPlan(ctx, SLIDE, null);
      expect((await readBoardFile(file)).chapterPlan).toBeUndefined();
    }));
});
