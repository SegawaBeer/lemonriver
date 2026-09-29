import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useLocale } from '@/lib/use-locale';
import {
  type BoardColumn,
  columnOfPosition,
  columnsAfterMove,
  reconcileColumns,
} from '../../../files/board-structure';
import type { Page } from '../../lib/sdk';
import { seedColumns } from './layout';

/**
 * The board's columns live beside the project, never in the deck file. The deck
 * only ever seeds them: from then on a chapter page is an ordinary card, so
 * moving it cannot re-group the pages it used to head.
 */
export function useBoardColumns(
  slideId: string,
  pages: Page[],
  columnTitle: (index: number) => string,
) {
  const [columns, setColumns] = useState<BoardColumn[] | null>(null);
  const t = useLocale();
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
        toast.error(`${t.board.saveFailed}: ${String((err as Error).message ?? err)}`);
      }
    },
    [slideId, t.board],
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

  /** A card crossing a column boundary hands one page over; nothing else moves. */
  const moveBetweenColumns = useCallback(
    (from: number, to: number) => {
      setColumns((current) => {
        if (!current) return current;
        const next = columnsAfterMove(current, from, to);
        if (next !== current) void save(next);
        return next;
      });
    },
    [save],
  );

  /** A page added or removed at `index` grows or shrinks the column holding it. */
  const resizeColumnAt = useCallback(
    (index: number, delta: number) => {
      setColumns((current) => {
        if (!current) return current;
        const column = columnOfPosition(current, index);
        const next = current.map((c, i) =>
          i === column ? { ...c, size: Math.max(0, c.size + delta) } : c,
        );
        void save(next);
        return next;
      });
    },
    [save],
  );

  const renameColumn = useCallback(
    (index: number, title: string) => {
      setColumns((current) => {
        if (!current || !current[index]) return current;
        const next = current.map((column, i) => (i === index ? { ...column, title } : column));
        void save(next);
        return next;
      });
    },
    [save],
  );

  return { columns, moveBetweenColumns, resizeColumnAt, renameColumn };
}
