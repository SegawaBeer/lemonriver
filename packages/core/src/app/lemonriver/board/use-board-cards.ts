import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Page } from '../../lib/sdk';
import { useLrText } from '../text';
import {
  adoptEntries,
  type BoardCard,
  type BoardCards,
  type BoardLink,
  type CardPatch,
  carryCards,
  entriesAfter,
  isSettledKey,
  linkCards,
  linkedPairs,
  originAfter,
  type PageOp,
  pageKeys,
  patchCard,
  patchCards,
  sanitizeCards,
  sanitizeLinks,
  unlinkCards,
} from './model/cards';

type BoardState = {
  cards: BoardCards;
  links: BoardLink[];
  /** `undefined` until read, `null` when the deck is keyed by position. */
  entries: string[] | null | undefined;
  loaded: boolean;
};

const INITIAL: BoardState = { cards: {}, links: [], entries: undefined, loaded: false };

export const countAfter = (op: PageOp, count: number) => {
  switch (op.kind) {
    case 'delete':
      return count - 1;
    case 'deleteMany':
      return count - op.indices.length;
    case 'move':
    case 'moveMany':
    case 'reorder':
      return count;
    case 'restore':
      return count + 1;
    default:
      return count + 1;
  }
};

/**
 * Titles, statuses, work memos and links: board-only data that never reaches
 * the deck. Each card is keyed by its page's entry in the deck source, so the
 * data stays on its page however and wherever the deck is reordered.
 */
export function useBoardCards(slideId: string, modulePages: Page[], count: number) {
  const lr = useLrText();
  const [board, setBoard] = useState<BoardState>(INITIAL);
  const boardRef = useRef(board);
  const countRef = useRef(count);
  countRef.current = count;
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const opsInFlight = useRef(0);
  const entrySeq = useRef(0);

  const save = useCallback(
    (next: BoardState) => {
      const body = JSON.stringify({ slideId, cards: next.cards, links: next.links });
      // One write at a time, so a slow earlier save never lands after a later one.
      saveQueue.current = saveQueue.current.then(async () => {
        try {
          const res = await fetch('/__board/cards', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (err) {
          toast.error(`${lr.board.saveFailed}: ${String((err as Error).message ?? err)}`);
        }
      });
    },
    [slideId, lr.board],
  );

  const commit = useCallback(
    (next: BoardState, persist: boolean) => {
      boardRef.current = next;
      setBoard(next);
      if (persist && next.loaded) save(next);
    },
    [save],
  );

  useEffect(() => {
    let cancelled = false;
    commit(INITIAL, false);
    (async () => {
      try {
        const res = await fetch(`/__board/cards?slideId=${encodeURIComponent(slideId)}`);
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { cards?: unknown; links?: unknown };
        if (cancelled) return;
        commit(
          {
            ...boardRef.current,
            cards: sanitizeCards(body.cards),
            links: sanitizeLinks(body.links),
            loaded: true,
          },
          false,
        );
      } catch {
        // Left unloaded, so nothing written from here can overwrite cards that
        // were never read.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slideId, commit]);

  // An answer read while a page operation is still being written describes a
  // deck that is about to change again, so it is dropped; the operation reads
  // the entries afresh once it settles.
  const refreshEntries = useCallback(async () => {
    if (opsInFlight.current > 0) return;
    const seq = ++entrySeq.current;
    let fetched: string[] | null;
    try {
      const res = await fetch(`/__board/entries?slideId=${encodeURIComponent(slideId)}`);
      if (!res.ok) return;
      fetched = ((await res.json()) as { entries: string[] | null }).entries;
    } catch {
      return;
    }
    if (seq !== entrySeq.current || opsInFlight.current > 0) return;
    const current = boardRef.current;
    const adopted = adoptEntries(current, current.entries, fetched);
    commit({ ...current, ...adopted, entries: fetched }, adopted !== current);
  }, [slideId, commit]);

  // The deck module reloads after every write to its source, ours or anyone else's.
  useEffect(() => {
    if (modulePages.length > 0) void refreshEntries();
  }, [modulePages, refreshEntries]);

  /** Cards and links as the server has them; a task may have written titles. */
  const refreshCards = useCallback(async () => {
    try {
      const res = await fetch(`/__board/cards?slideId=${encodeURIComponent(slideId)}`);
      if (!res.ok) return;
      const body = (await res.json()) as { cards?: unknown; links?: unknown };
      const current = boardRef.current;
      commit(
        {
          ...current,
          cards: sanitizeCards(body.cards),
          links: sanitizeLinks(body.links),
        },
        false,
      );
    } catch {}
  }, [slideId, commit]);

  /**
   * Moves the board's data along with a page operation, before the deck itself
   * changes. Call the returned function once the deck write settles; a refused
   * write puts the cards back as they were.
   */
  const beginOp = useCallback(
    (op: PageOp, countOverride?: number) => {
      const snapshot = boardRef.current;
      const count = countOverride ?? countRef.current;
      opsInFlight.current += 1;
      entrySeq.current += 1;

      const before = pageKeys(snapshot.entries, count);
      const entries = entriesAfter(op, snapshot.entries, count);
      if (before.every(isSettledKey)) {
        const after = pageKeys(entries, countAfter(op, count));
        const carried = carryCards(snapshot, before, after, originAfter(op, count));
        // A restored page brings its card back in the same write: written later,
        // it could be wiped by the deck reload the restore itself triggers.
        if (op.kind === 'restore' && op.card) carried.cards[op.entry] = op.card;
        commit({ ...snapshot, ...carried, entries }, true);
      } else {
        commit({ ...snapshot, entries }, false);
      }

      return (ok: boolean) => {
        opsInFlight.current -= 1;
        if (!ok) {
          commit({ ...boardRef.current, cards: snapshot.cards, links: snapshot.links }, true);
        }
        void refreshEntries();
      };
    },
    [commit, refreshEntries],
  );

  const keyAt = useCallback((index: number): string | null => {
    const current = boardRef.current;
    const key = pageKeys(current.entries, countRef.current)[index];
    return current.loaded && key && isSettledKey(key) ? key : null;
  }, []);

  const patch = useCallback(
    (index: number, change: CardPatch) => {
      const key = keyAt(index);
      if (!key) return;
      const current = boardRef.current;
      commit({ ...current, cards: patchCard(current.cards, key, change) }, true);
    },
    [keyAt, commit],
  );

  /** One change across several cards, written once. */
  const patchMany = useCallback(
    (indices: number[], change: CardPatch) => {
      const keys = indices
        .map((index) => keyAt(index))
        .filter((key): key is string => key !== null);
      if (keys.length === 0) return;
      const current = boardRef.current;
      commit({ ...current, cards: patchCards(current.cards, keys, change) }, true);
    },
    [keyAt, commit],
  );

  /** Puts links back, ignoring any that are already there. */
  const addLinks = useCallback(
    (pairs: BoardLink[]) => {
      if (pairs.length === 0) return;
      const current = boardRef.current;
      if (!current.loaded) return;
      const links = pairs.reduce((kept, { a, b }) => linkCards(kept, a, b), current.links);
      if (links !== current.links) commit({ ...current, links }, true);
    },
    [commit],
  );

  /** The deck source a page is written as, for putting the page back later. */
  const entryAt = useCallback((index: number): string | null => {
    const entries = boardRef.current.entries;
    if (!entries || entries.length !== countRef.current) return null;
    return entries[index] ?? null;
  }, []);

  const setLink = useCallback(
    (a: number, b: number, linked: boolean) => {
      const from = keyAt(a);
      const to = keyAt(b);
      if (!from || !to) return;
      const current = boardRef.current;
      const links = linked
        ? linkCards(current.links, from, to)
        : unlinkCards(current.links, from, to);
      if (links !== current.links) commit({ ...current, links }, true);
    },
    [keyAt, commit],
  );

  const link = useCallback((a: number, b: number) => setLink(a, b, true), [setLink]);
  const unlink = useCallback((a: number, b: number) => setLink(a, b, false), [setLink]);

  const keys = useMemo(() => pageKeys(board.entries, count), [board.entries, count]);
  const ready = board.loaded && keys.every(isSettledKey);
  const cards = useMemo<(BoardCard | undefined)[]>(
    () => keys.map((key) => (isSettledKey(key) ? board.cards[key] : undefined)),
    [keys, board.cards],
  );
  const pairs = useMemo(() => linkedPairs(keys, board.links), [keys, board.links]);

  return {
    ready,
    keys,
    entries: board.entries,
    cards,
    pairs,
    links: board.links,
    patch,
    patchMany,
    link,
    unlink,
    beginOp,
    entryAt,
    addLinks,
    refreshCards,
  };
}
