import type { SessionStore } from '../../agent/store.ts';
import { pageKeys, patchCard, sanitizeCards } from '../../app/lemonriver/board/model/cards.ts';
import {
  afterTurn,
  beginBuild,
  collectDecisions,
  type OutlinePage,
  parseOutlineBlock,
  sanitizeOutline,
  stripOutlineBlock,
} from '../../app/lemonriver/outline/model.ts';
import { resolveSlideEntry } from '../../editing/slide-ops.ts';
import type { ApiContext } from '../../vite/routes/context.ts';
import { readSlideSource } from '../../vite/routes/context.ts';
import { defaultExportEntriesInSource } from '../board/page-entries.ts';
import { boardStructurePath, readBoardFile, updateBoardFile } from '../board/store.ts';

type OutlineStore = Pick<SessionStore, 'get' | 'updateItem'>;

/**
 * Turns the agent's last reply into the board's outline, and once the deck is
 * being built, its page titles back into the board's cards. Both live in the
 * same file, so the outline stays the single source the board shows.
 */
export async function collectOutline(
  ctx: ApiContext,
  store: OutlineStore,
  sessionId: string,
  userItemId: string,
): Promise<void> {
  const session = store.get(sessionId);
  const slideId = session?.slideId;
  if (!session || !slideId) return;

  const file = boardStructurePath(ctx.userCwd, slideId);
  const stored = await readBoardFile(file);
  const outline = sanitizeOutline(stored.outline);
  if (!outline) return;
  const now = Date.now();

  if (outline.state === 'drafting') {
    const start = session.items.findIndex((item) => item.id === userItemId);
    let found: OutlinePage[] | null = null;
    for (const item of session.items.slice(start + 1)) {
      if (item.kind !== 'assistant') continue;
      const parsed = parseOutlineBlock(item.text);
      if (!parsed) continue;
      found = parsed;
      store.updateItem(sessionId, item.id, 'assistant', { text: stripOutlineBlock(item.text) });
    }
    if (!found) {
      await updateBoardFile(file, { outline: { ...outline, state: 'failed', updatedAt: now } });
      return;
    }
    const ready = { ...outline, state: 'ready' as const, items: found, updatedAt: now };
    if (ready.prefs.outline !== 'direct') {
      await updateBoardFile(file, { outline: ready });
      return;
    }
    const entry = resolveSlideEntry(ctx.slidesRoot, slideId);
    const buildBackup = entry ? ((await readSlideSource(entry)) ?? '') : '';
    await updateBoardFile(file, { outline: beginBuild(ready, now), buildBackup });
    return;
  }

  if (outline.state !== 'building') return;
  // A build only learns from the rounds it dispatched itself.
  if (!outline.dispatched) return;

  const start = session.items.findIndex((item) => item.id === userItemId);
  const after = start === -1 ? [] : session.items.slice(start + 1);
  const last = session.items.at(-1);
  const waitingForAnswer = last?.kind === 'question' && last.status === 'pending';
  const lastResult = [...after].reverse().find((item) => item.kind === 'result');
  const ok =
    !after.some((item) => item.kind === 'error') &&
    !(lastResult?.kind === 'result' && lastResult.aborted);

  const decisions =
    outline.stage === 'review'
      ? collectDecisions(outline.decisions, session.items)
      : outline.decisions;
  const grown = decisions.length !== outline.decisions.length;
  const base = grown ? { ...outline, decisions } : outline;
  const next = afterTurn(base, { ok, waitingForAnswer }, now);
  if (next === base && !grown) return;
  if (next.state !== 'built') {
    await updateBoardFile(file, { outline: next });
    return;
  }

  const entry = resolveSlideEntry(ctx.slidesRoot, slideId);
  const source = entry ? await readSlideSource(entry) : null;
  const entries = source ? defaultExportEntriesInSource(source) : null;

  if (!entries || entries.length !== outline.items.length) {
    await updateBoardFile(file, { outline: next });
    return;
  }

  const keys = pageKeys(entries, outline.items.length);
  let cards = sanitizeCards(stored.cards);
  outline.items.forEach((item, index) => {
    const title = item.title.trim();
    if (title) cards = patchCard(cards, keys[index], { title });
  });
  await updateBoardFile(file, { outline: next, cards });
}
