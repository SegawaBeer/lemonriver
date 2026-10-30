import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Page } from '../../lib/sdk';
import { useLrText } from '../text';
import { seedColumns } from './layout';
import { type BoardColumn, reconcileColumns } from './model/structure';

/**
 * The board's columns live beside the project, never in the deck file. The deck
 * only ever seeds them: from then on a chapter page is an ordinary card, so
 * moving it cannot re-group the pages it used to head.
 *
 * Every change to the structure is worked out as a whole new list by a pure
 * function and handed here, so an undo can replay the list it took away instead
 * of re-deriving it from a board that has already moved on.
 */
export function useBoardColumns(
  slideId: string,
  pages: Page[],
  columnTitle: (index: number) => string,
) {
  const [columns, setColumns] = useState<BoardColumn[] | null>(null);
  const lr = useLrText();
  const seedRef = useRef<{ pages: Page[]; title: (index: number) => string }>({
    pages,
    title: columnTitle,
  });
  seedRef.current = { pages, title: columnTitle };

  /** Chapters a task just wrote, waiting for the deck to reload with them. */
  const waiting = useRef<{ columns: BoardColumn[]; count: number } | null>(null);

  const save = useCallback(
    async (next: BoardColumn[]) => {
      try {
        const res = await fetch('/__board', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slideId, columns: next }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        toast.error(`${lr.board.saveFailed}: ${String((err as Error).message ?? err)}`);
      }
    },
    [slideId, lr.board],
  );

  // Load once the deck has pages. A deck with no stored structure gets one seeded
  // from its chapter pages, written straight away so the next open reads it back.
  const hasPages = pages.length > 0;
  useEffect(() => {
    let cancelled = false;
    setColumns(null);
    if (!hasPages) return;
    (async () => {
      const { pages: current, title } = seedRef.current;
      let stored: BoardColumn[] | null = null;
      try {
        const res = await fetch(
          `/__board?slideId=${encodeURIComponent(slideId)}&pages=${current.length}`,
        );
        if (res.ok) stored = ((await res.json()) as { columns: BoardColumn[] | null }).columns;
      } catch {
        stored = null;
      }
      if (cancelled) return;
      if (stored && stored.length > 0) {
        setColumns(reconcileColumns(stored, current.length));
        return;
      }
      const seeded = seedColumns(current, title);
      setColumns(seeded);
      void save(seeded);
    })();
    return () => {
      cancelled = true;
    };
  }, [slideId, hasPages, save]);

  // A deck edited outside the board (or by the agent) changes the page count;
  // the structure follows so the board never renders half a deck.
  useEffect(() => {
    const pending = waiting.current;
    if (pending) {
      // The chapters belong to a deck that has not reloaded yet; reconciling
      // now would spread the new pages into the wrong chapter.
      if (pages.length !== pending.count) return;
      waiting.current = null;
      setColumns(pending.columns);
      return;
    }
    setColumns((current) => {
      if (!current) return current;
      const total = current.reduce((sum, column) => sum + column.size, 0);
      if (total === pages.length) return current;
      const next = reconcileColumns(current, pages.length);
      void save(next);
      return next;
    });
  }, [pages.length, save]);

  const applyColumns = useCallback(
    (next: BoardColumn[]) => {
      waiting.current = null;
      setColumns(next);
      void save(next);
    },
    [save],
  );

  /** Chapters the server just wrote; held until the deck has that many pages. */
  const adoptColumns = useCallback(
    (next: BoardColumn[]) => {
      const count = next.reduce((sum, column) => sum + column.size, 0);
      // Fewer pages than the deck has: this is the record from before the task,
      // and the deck's own reconcile already knows better.
      if (count === 0 || count < pages.length) return;
      if (pages.length === count) {
        waiting.current = null;
        setColumns(next);
        return;
      }
      waiting.current = { columns: next, count };
    },
    [pages.length],
  );

  return { columns, applyColumns, adoptColumns };
}
