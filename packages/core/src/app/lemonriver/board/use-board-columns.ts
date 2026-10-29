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
      setColumns(next);
      void save(next);
    },
    [save],
  );

  return { columns, applyColumns };
}
