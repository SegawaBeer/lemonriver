import fs from 'node:fs/promises';
import type { SessionStore } from '../../agent/store.ts';
import type { AgentItem } from '../../agent/types.ts';
import {
  type BoardTask,
  chapterPlanPrompt,
  chapterWritePrompt,
  pageTaskPrompt,
  parseChapterBlock,
  stripChapterBlock,
} from '../../app/lemonriver/board/model/agent-tasks.ts';
import {
  type BoardApplying,
  type BoardLastApply,
  type ChapterPlan,
  sanitizeApplying,
  sanitizeChapterPlan,
  sanitizeLastApply,
} from '../../app/lemonriver/board/model/apply.ts';
import { applyPrompt, type PromptPage } from '../../app/lemonriver/board/model/apply-prompt.ts';
import {
  type BoardCards,
  pageKeys,
  patchCard,
  sanitizeCards,
} from '../../app/lemonriver/board/model/cards.ts';
import { changedPages, sanitizeChanges } from '../../app/lemonriver/board/model/changes.ts';
import {
  restructuredPages,
  sanitizeRestructures,
} from '../../app/lemonriver/board/model/restructure.ts';
import {
  type BoardColumn,
  columnsAfterApply,
  reconcileColumns,
  sanitizeStructure,
} from '../../app/lemonriver/board/model/structure.ts';
import { lastErrorText, sanitizeOutline } from '../../app/lemonriver/outline/model.ts';
import { resolveSlideEntry } from '../../editing/slide-ops.ts';
import type { ApiContext } from '../../vite/routes/context.ts';
import { readSlideSource } from '../../vite/routes/context.ts';
import { defaultExportEntriesInSource } from './page-entries.ts';
import { boardStructurePath, readBoardFile, updateBoardFile } from './store.ts';

export type { BoardApplying, BoardLastApply, ChapterPlan };
export { sanitizeApplying, sanitizeChapterPlan, sanitizeLastApply };

export type StartResult =
  | { ok: true; prompt: string }
  | { ok: false; status: number; error: string };

type Deck = { source: string; entries: string[]; keys: string[] };

async function readDeck(ctx: ApiContext, slideId: string): Promise<Deck | null> {
  const entry = resolveSlideEntry(ctx.slidesRoot, slideId);
  const source = entry ? await readSlideSource(entry) : null;
  if (source === null) return null;
  const entries = defaultExportEntriesInSource(source);
  if (!entries) return null;
  return { source, entries, keys: pageKeys(entries, entries.length) };
}

/** The chapters as page keys, reconciled to the deck the prompt is written for. */
function columnsWithKeys(
  columns: BoardColumn[] | null,
  keys: string[],
): {
  title: string;
  keys: string[];
}[] {
  const reconciled =
    columns && columns.length > 0
      ? reconcileColumns(columns, keys.length)
      : [{ title: '', size: keys.length }];
  let at = 0;
  return reconciled.map((column) => {
    const slice = keys.slice(at, at + column.size);
    at += column.size;
    return { title: column.title, keys: slice };
  });
}

function lastPageOf(
  columns: { title: string; keys: string[] }[],
  cards: BoardCards,
  index: number,
): { n: number; title: string } | null {
  const all = columns.flatMap((column) => column.keys);
  const key = index >= 0 && index < columns.length ? columns[index].keys.at(-1) : undefined;
  if (key === undefined) return null;
  return { n: all.indexOf(key) + 1, title: cards[key]?.title ?? '' };
}

/**
 * The page the new chapter's pages go after: the chapter's own last page, then
 * the last page of the chapter before it, then nothing at all.
 */
function anchorFor(
  columns: { title: string; keys: string[] }[],
  cards: BoardCards,
  chapter: number,
): { n: number; title: string } | null {
  for (let i = chapter; i >= 0; i--) {
    const found = lastPageOf(columns, cards, i);
    if (found) return found;
  }
  return null;
}

/**
 * Backs the deck up, records that a task is running, and hands back the message
 * for the agent. Only a chapter plan leaves the deck and the backup alone: it
 * changes no file and is thrown away with the answer.
 */
export async function startApply(
  ctx: ApiContext,
  slideId: string,
  task: BoardTask = { kind: 'changes' },
  lang = 'en',
): Promise<StartResult> {
  const file = boardStructurePath(ctx.userCwd, slideId);
  const stored = await readBoardFile(file);
  if (sanitizeOutline(stored.outline)?.state === 'building') {
    return { ok: false, status: 409, error: 'the deck is being laid out from its outline' };
  }
  if (sanitizeApplying(stored.applying)) {
    return { ok: false, status: 409, error: 'an apply is already running' };
  }

  const deck = await readDeck(ctx, slideId);
  if (!deck) return { ok: false, status: 422, error: 'the page list of this deck cannot be read' };
  const cards = sanitizeCards(stored.cards);
  const columns = columnsWithKeys(sanitizeStructure(stored)?.columns ?? null, deck.keys);

  const applying = (extra: Record<string, unknown>) => ({
    applyBackup: deck.source,
    applyColumns: columns,
    applyColumnsBackup: sanitizeStructure(stored)?.columns,
    applying: { startedAt: Date.now(), sessionId: null, userItemId: null, task },
    lastApply: undefined,
    ...extra,
  });

  if (task.kind === 'page') {
    const at = deck.keys.indexOf(task.page);
    if (at < 0) return { ok: false, status: 409, error: 'that page is no longer in the deck' };
    const prompt = pageTaskPrompt({
      slideId,
      page: { n: at + 1, title: cards[task.page]?.title ?? '', memo: cards[task.page]?.memo },
      action: task.action,
      lang,
    });
    if (prompt === null)
      return { ok: false, status: 422, error: 'this page has no note to follow' };
    await updateBoardFile(file, { ...applying({}), chapterPlan: undefined });
    return { ok: true, prompt };
  }

  if (task.kind === 'chapter-plan') {
    if (task.chapter >= columns.length) {
      return { ok: false, status: 409, error: 'that chapter is no longer there' };
    }
    const pages = (columns[task.chapter]?.keys ?? []).flatMap((key) => {
      const n = deck.keys.indexOf(key) + 1;
      return n > 0 ? [{ n, title: cards[key]?.title ?? '' }] : [];
    });
    const prompt = chapterPlanPrompt({
      slideId,
      chapter: task.chapter,
      title: columns[task.chapter]?.title ?? task.title,
      brief: task.brief,
      count: task.count,
      pages,
      lang,
    });
    await updateBoardFile(file, {
      applying: { startedAt: Date.now(), sessionId: null, userItemId: null, task },
      chapterPlan: undefined,
    });
    return { ok: true, prompt };
  }

  if (task.kind === 'chapter-write') {
    const plan = sanitizeChapterPlan(stored.chapterPlan);
    if (plan?.state !== 'ready' || plan.chapter !== task.chapter) {
      return { ok: false, status: 409, error: 'there are no titles to write for this chapter' };
    }
    if (task.chapter >= columns.length) {
      return { ok: false, status: 409, error: 'that chapter is no longer there' };
    }
    const prompt = chapterWritePrompt({
      slideId,
      chapter: task.chapter,
      title: columns[task.chapter]?.title ?? task.title,
      items: plan.items,
      anchor: anchorFor(columns, cards, task.chapter),
      lang,
    });
    await updateBoardFile(file, applying({}));
    return { ok: true, prompt };
  }

  const changes = sanitizeChanges(stored.changes);
  const restructures = sanitizeRestructures(stored.restructures);
  if (changes.length === 0 && restructures.length === 0) {
    return { ok: false, status: 409, error: 'nothing to apply' };
  }

  const pages: PromptPage[] = deck.keys.map((key, at) => ({
    key,
    n: at + 1,
    title: cards[key]?.title ?? '',
  }));
  await updateBoardFile(file, { ...applying({}), chapterPlan: undefined });
  return { ok: true, prompt: applyPrompt({ slideId, pages, changes, restructures }) };
}

/** The browser writes back which session, and which message, carries the prompt. */
export async function linkApply(
  ctx: ApiContext,
  slideId: string,
  sessionId: string,
  userItemId: string,
): Promise<boolean> {
  const file = boardStructurePath(ctx.userCwd, slideId);
  const stored = await readBoardFile(file);
  const applying = sanitizeApplying(stored.applying);
  if (!applying) return false;
  await updateBoardFile(file, { applying: { ...applying, sessionId, userItemId } });
  return true;
}

/** The user's edits to a planned chapter, or null when they dropped it. */
export async function saveChapterPlan(
  ctx: ApiContext,
  slideId: string,
  plan: ChapterPlan | null,
): Promise<void> {
  const file = boardStructurePath(ctx.userCwd, slideId);
  await updateBoardFile(file, { chapterPlan: plan ?? undefined });
}

type CollectStore = Pick<SessionStore, 'get' | 'updateItem'>;

/** A turn is done when it neither errored nor was stopped by the user. */
function turnEnded(
  items: AgentItem[],
  userItemId: string | null,
): { after: AgentItem[]; ok: boolean; waitingForAnswer: boolean } {
  const start = userItemId ? items.findIndex((item) => item.id === userItemId) : -1;
  const after = start === -1 ? [] : items.slice(start + 1);
  const last = items.at(-1);
  const lastResult = [...after].reverse().find((item) => item.kind === 'result');
  return {
    after,
    ok:
      !after.some((item) => item.kind === 'error') &&
      !(lastResult?.kind === 'result' && lastResult.aborted),
    waitingForAnswer: last?.kind === 'question' && last.status === 'pending',
  };
}

/**
 * Called at the end of every turn of the session that carries the prompt. A
 * turn that ends in an error, or a run the user stopped, leaves the board where
 * it is; a turn that finishes settles it and keeps the backup for the undo.
 */
export async function collectApply(
  ctx: ApiContext,
  store: CollectStore,
  sessionId: string,
  userItemId: string,
): Promise<void> {
  const session = store.get(sessionId);
  const slideId = session?.slideId;
  if (!session || !slideId) return;

  const file = boardStructurePath(ctx.userCwd, slideId);
  const stored = await readBoardFile(file);
  const applying = sanitizeApplying(stored.applying);
  if (!applying) return;
  if (applying.sessionId && applying.sessionId !== sessionId) return;

  const turn = turnEnded(session.items, userItemId);
  // The agent asked something and the user has not answered: nothing is known
  // yet about whether the task worked.
  if (turn.waitingForAnswer) return;
  const now = Date.now();

  if (applying.task.kind === 'chapter-plan') {
    let found: ChapterPlan['items'] | null = null;
    if (turn.ok) {
      for (const item of turn.after) {
        if (item.kind !== 'assistant') continue;
        const parsed = parseChapterBlock(item.text);
        if (!parsed) continue;
        found = parsed;
        store.updateItem(sessionId, item.id, 'assistant', { text: stripChapterBlock(item.text) });
      }
    }
    const plan: ChapterPlan = found
      ? {
          chapter: applying.task.chapter,
          title: applying.task.title,
          brief: applying.task.brief,
          items: found,
          state: 'ready',
        }
      : {
          chapter: applying.task.chapter,
          title: applying.task.title,
          brief: applying.task.brief,
          items: [],
          state: 'failed',
          ...(lastErrorText(session.items, userItemId)
            ? { error: lastErrorText(session.items, userItemId) ?? '' }
            : {}),
        };
    await updateBoardFile(file, { applying: undefined, chapterPlan: plan });
    return;
  }

  if (!turn.ok) {
    const error =
      lastErrorText(session.items, userItemId) ?? 'the agent stopped before it was done';
    await updateBoardFile(file, {
      applying: undefined,
      applyBackup: undefined,
      applyColumns: undefined,
      applyColumnsBackup: undefined,
      lastApply: { ok: false, at: now, error, pages: [] },
    });
    return;
  }

  const beforeColumns = Array.isArray(stored.applyColumns)
    ? (stored.applyColumns as { title: string; keys: string[] }[])
    : [];
  const deck = await readDeck(ctx, slideId);
  const newKeys = deck ? deck.keys : beforeColumns.flatMap((column) => column.keys);
  const beforeKeys = new Set(beforeColumns.flatMap((column) => column.keys));
  const created = newKeys.filter((key) => !beforeKeys.has(key));
  const task = applying.task;

  const newPagesTo = task.kind === 'chapter-write' ? task.chapter : undefined;
  const fields: Record<string, unknown> = { applying: undefined, applyColumns: undefined };

  if (beforeColumns.length > 0) {
    fields.columns = columnsAfterApply(beforeColumns, newKeys, newPagesTo);
  }

  let cards = sanitizeCards(stored.cards);
  let pages: string[] = [];
  if (task.kind === 'changes') {
    pages = [
      ...new Set([
        ...changedPages(sanitizeChanges(stored.changes)),
        ...restructuredPages(sanitizeRestructures(stored.restructures)),
      ]),
    ];
    fields.changes = [];
    fields.restructures = [];
  } else if (task.kind === 'page') {
    pages = [...new Set([task.page, ...created])].filter((key) => newKeys.includes(key));
  } else {
    pages = created;
    const plan = sanitizeChapterPlan(stored.chapterPlan);
    if (plan && plan.chapter === task.chapter && plan.items.length === created.length) {
      created.forEach((key, i) => {
        const title = plan.items[i].title.trim();
        if (title) cards = patchCard(cards, key, { title });
      });
      fields.cards = cards;
    }
    fields.chapterPlan = undefined;
  }
  fields.lastApply = { ok: true, at: now, pages };

  await updateBoardFile(file, fields);
}

/**
 * Puts the deck back as it was before the apply. The backup is written over
 * whatever is there now, hand edits included — the board asks first.
 */
export async function undoApply(
  ctx: ApiContext,
  slideId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const entry = resolveSlideEntry(ctx.slidesRoot, slideId);
  if (!entry) return { ok: false, status: 404, error: 'slide not found' };
  const file = boardStructurePath(ctx.userCwd, slideId);
  const stored = await readBoardFile(file);
  if (typeof stored.applyBackup !== 'string') {
    return { ok: false, status: 409, error: 'nothing to undo' };
  }
  await fs.writeFile(entry, stored.applyBackup, 'utf8');
  await updateBoardFile(file, {
    applyBackup: undefined,
    applyColumns: undefined,
    applyColumnsBackup: undefined,
    columns: stored.applyColumnsBackup,
    lastApply: undefined,
  });
  return { ok: true };
}

/** The user gave up on a task: the deck is untouched and the list stays. */
export async function cancelApply(ctx: ApiContext, slideId: string): Promise<boolean> {
  const file = boardStructurePath(ctx.userCwd, slideId);
  const stored = await readBoardFile(file);
  if (!sanitizeApplying(stored.applying)) return false;
  await updateBoardFile(file, { applying: undefined });
  return true;
}
