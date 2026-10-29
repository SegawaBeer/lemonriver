import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { format, useLocale } from '@/lib/use-locale';
import type { Page } from '../../lib/sdk';
import { useLrText } from '../text';

/**
 * Page edits on the board go through the same dev-server routes the thumbnail
 * rail uses, so the board never owns a second way of writing a deck. Local
 * state is optimistic and rolls back when the write is refused.
 *
 * The current list is kept in a ref as well as in state: an undo runs several
 * of these in a row, and each one has to see the deck the previous one left.
 */
export function usePageOrder(slideId: string, modulePages: Page[]) {
  const [pages, setPages] = useState<Page[]>(modulePages);
  const pagesRef = useRef(pages);
  const t = useLocale();
  const lr = useLrText();

  // The ref moves with the list, not with the next render: an undo or a
  // multi-page delete runs several writes back to back and each has to see the
  // deck the previous one left.
  const commitPages = useCallback((next: Page[]) => {
    pagesRef.current = next;
    setPages(next);
  }, []);

  useEffect(() => {
    pagesRef.current = modulePages;
    setPages(modulePages);
  }, [modulePages]);

  const send = useCallback(async (path: string, init: RequestInit) => {
    const res = await fetch(path, init);
    if (!res.ok) {
      const detail = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(detail.error ?? `HTTP ${res.status}`);
    }
  }, []);

  const putOrder = useCallback(
    async (order: number[]): Promise<boolean> => {
      const before = pagesRef.current;
      if (order.length !== before.length) return false;
      const next = order.map((from) => before[from]);
      commitPages(next);
      try {
        await send(`/__slides/${encodeURIComponent(slideId)}/reorder`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ order }),
        });
        return true;
      } catch (err) {
        commitPages(before);
        toast.error(`${lr.board.reorderFailed}: ${String((err as Error).message ?? err)}`);
        return false;
      }
    },
    [slideId, send, lr.board, commitPages],
  );

  /** A whole new deck order, for a chapter travelling with its pages. */
  const reorderAll = useCallback(
    (order: number[]): Promise<boolean> => putOrder(order),
    [putOrder],
  );

  const duplicate = useCallback(
    async (i: number): Promise<boolean> => {
      const before = pagesRef.current;
      if (i < 0 || i >= before.length) return false;
      const next = [...before];
      next.splice(i + 1, 0, before[i]);
      commitPages(next);
      try {
        await send(`/__slides/${encodeURIComponent(slideId)}/pages/${i}/duplicate`, {
          method: 'POST',
        });
        toast.success(format(t.thumbnailRail.toastDuplicated, { n: i + 1 }));
        return true;
      } catch (err) {
        commitPages(before);
        toast.error(
          `${t.thumbnailRail.toastDuplicateFailed}: ${String((err as Error).message ?? err)}`,
        );
        return false;
      }
    },
    [slideId, send, t.thumbnailRail, commitPages],
  );

  const insert = useCallback(
    async (i: number): Promise<boolean> => {
      const before = pagesRef.current;
      if (i < 0 || i > before.length) return false;
      // The blank page has no component here yet; the server writes one and the
      // deck reloads through HMR, so the local list only has to hold its slot.
      const next = [...before];
      next.splice(i, 0, before[Math.max(0, i - 1)]);
      commitPages(next);
      try {
        await send('/__board/pages/insert', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slideId, index: i }),
        });
        toast.success(format(lr.board.toastInserted, { n: i + 1 }));
        return true;
      } catch (err) {
        commitPages(before);
        toast.error(`${lr.board.insertFailed}: ${String((err as Error).message ?? err)}`);
        return false;
      }
    },
    [slideId, send, lr.board, commitPages],
  );

  /** Puts a page the board removed back, as the source text it was removed as. */
  const restore = useCallback(
    async (i: number, entry: string): Promise<boolean> => {
      const before = pagesRef.current;
      if (i < 0 || i > before.length) return false;
      const next = [...before];
      next.splice(i, 0, before[Math.min(i, before.length - 1)]);
      commitPages(next);
      try {
        await send('/__board/pages/restore', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slideId, index: i, entry }),
        });
        return true;
      } catch (err) {
        commitPages(before);
        toast.error(`${lr.board.undoFailed}: ${String((err as Error).message ?? err)}`);
        return false;
      }
    },
    [slideId, send, lr.board.undoFailed, commitPages],
  );

  const remove = useCallback(
    async (i: number): Promise<boolean> => {
      const before = pagesRef.current;
      if (i < 0 || i >= before.length || before.length <= 1) return false;
      commitPages(before.slice(0, i).concat(before.slice(i + 1)));
      try {
        await send(`/__slides/${encodeURIComponent(slideId)}/pages/${i}`, { method: 'DELETE' });
        toast.success(format(t.thumbnailRail.toastDeleted, { n: i + 1 }));
        return true;
      } catch (err) {
        commitPages(before);
        toast.error(
          `${t.thumbnailRail.toastDeleteFailed}: ${String((err as Error).message ?? err)}`,
        );
        return false;
      }
    },
    [slideId, send, t.thumbnailRail, commitPages],
  );

  return { pages, reorderAll, duplicate, insert, restore, remove };
}
