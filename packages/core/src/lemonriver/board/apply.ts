import fs from 'node:fs/promises';
import type { SessionStore } from '../../agent/store.ts';
import {
  type BoardApplying,
  type BoardLastApply,
  sanitizeApplying,
  sanitizeLastApply,
} from '../../app/lemonriver/board/model/apply.ts';
import { applyPrompt, type PromptPage } from '../../app/lemonriver/board/model/apply-prompt.ts';
import { pageKeys, sanitizeCards } from '../../app/lemonriver/board/model/cards.ts';
import { changedPages, sanitizeChanges } from '../../app/lemonriver/board/model/changes.ts';
import {
  restructuredPages,
  sanitizeRestructures,
} from '../../app/lemonriver/board/model/restructure.ts';
import { lastErrorText, sanitizeOutline } from '../../app/lemonriver/outline/model.ts';
import { resolveSlideEntry } from '../../editing/slide-ops.ts';
import type { ApiContext } from '../../vite/routes/context.ts';
import { readSlideSource } from '../../vite/routes/context.ts';
import { defaultExportEntriesInSource } from './page-entries.ts';
import { boardStructurePath, readBoardFile, updateBoardFile } from './store.ts';

export type { BoardApplying, BoardLastApply };
export { sanitizeApplying, sanitizeLastApply };

export type StartResult =
  | { ok: true; prompt: string }
  | { ok: false; status: number; error: string };

/**
 * Backs the deck up, records that an apply is running, and hands back the
 * message for the agent. The deck itself is left alone until its turn ends.
 */
export async function startApply(ctx: ApiContext, slideId: string): Promise<StartResult> {
  const file = boardStructurePath(ctx.userCwd, slideId);
  const stored = await readBoardFile(file);
  if (sanitizeOutline(stored.outline)?.state === 'building') {
    return { ok: false, status: 409, error: 'the deck is being laid out from its outline' };
  }
  if (sanitizeApplying(stored.applying)) {
    return { ok: false, status: 409, error: 'an apply is already running' };
  }
  const changes = sanitizeChanges(stored.changes);
  const restructures = sanitizeRestructures(stored.restructures);
  if (changes.length === 0 && restructures.length === 0) {
    return { ok: false, status: 409, error: 'nothing to apply' };
  }

  const entry = resolveSlideEntry(ctx.slidesRoot, slideId);
  const source = entry ? await readSlideSource(entry) : null;
  if (source === null) return { ok: false, status: 404, error: 'slide not found' };
  const entries = defaultExportEntriesInSource(source);
  if (!entries)
    return { ok: false, status: 422, error: 'the page list of this deck cannot be read' };

  const keys = pageKeys(entries, entries.length);
  const cards = sanitizeCards(stored.cards);
  const pages: PromptPage[] = keys.map((key, at) => ({
    key,
    n: at + 1,
    title: cards[key]?.title ?? '',
  }));

  await updateBoardFile(file, {
    applyBackup: source,
    applying: { startedAt: Date.now(), sessionId: null, userItemId: null },
    lastApply: undefined,
  });
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

/**
 * Called at the end of every turn of the session that carries the prompt. A
 * turn that ends in an error, or a run the user stopped, leaves the list where
 * it is; a turn that finishes clears it and keeps the backup for the undo.
 */
export async function collectApply(
  ctx: ApiContext,
  store: Pick<SessionStore, 'get'>,
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

  const last = session.items.at(-1);
  // The agent asked something and the user has not answered: the deck is not
  // finished, so this turn says nothing about whether the apply worked.
  if (last?.kind === 'question' && last.status === 'pending') return;

  const start = session.items.findIndex((item) => item.id === userItemId);
  const after = start === -1 ? [] : session.items.slice(start + 1);
  const lastResult = [...after].reverse().find((item) => item.kind === 'result');
  const ok =
    !after.some((item) => item.kind === 'error') &&
    !(lastResult?.kind === 'result' && lastResult.aborted);
  const now = Date.now();

  if (!ok) {
    const error =
      lastErrorText(session.items, userItemId) ?? 'the agent stopped before it was done';
    await updateBoardFile(file, {
      applying: undefined,
      applyBackup: undefined,
      lastApply: { ok: false, at: now, error, pages: [] },
    });
    return;
  }

  const pages = new Set([
    ...changedPages(sanitizeChanges(stored.changes)),
    ...restructuredPages(sanitizeRestructures(stored.restructures)),
  ]);
  await updateBoardFile(file, {
    changes: [],
    restructures: [],
    applying: undefined,
    lastApply: { ok: true, at: now, pages: [...pages] },
  });
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
  await updateBoardFile(file, { applyBackup: undefined, lastApply: undefined });
  return { ok: true };
}

/** The user gave up on an apply: the deck is untouched and the list stays. */
export async function cancelApply(ctx: ApiContext, slideId: string): Promise<boolean> {
  const file = boardStructurePath(ctx.userCwd, slideId);
  const stored = await readBoardFile(file);
  if (!sanitizeApplying(stored.applying)) return false;
  await updateBoardFile(file, { applying: undefined });
  return true;
}
