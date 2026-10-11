import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { format, useLocale } from '@/lib/use-locale';
import type { Page } from '../../lib/sdk';

/**
 * Page edits on the board go through the same dev-server routes the thumbnail
 * rail uses, so the board never owns a second way of writing a deck. Local
 * state is optimistic and rolls back when the write is refused.
 */
export function usePageOrder(slideId: string, modulePages: Page[]) {
  const [pages, setPages] = useState<Page[]>(modulePages);
  const t = useLocale();

  useEffect(() => {
    setPages(modulePages);
  }, [modulePages]);

  const send = useCallback(async (path: string, init: RequestInit) => {
    const res = await fetch(path, init);
    if (!res.ok) {
      const detail = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(detail.error ?? `HTTP ${res.status}`);
    }
  }, []);

  const reorder = useCallback(
    async (from: number, to: number) => {
      if (from === to || from < 0 || to < 0) return;
      const before = pages;
      if (from >= before.length || to >= before.length) return;

      const next = [...before];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setPages(next);

      const order = before.map((_, i) => i);
      const [movedIndex] = order.splice(from, 1);
      order.splice(to, 0, movedIndex);

      try {
        await send(`/__slides/${encodeURIComponent(slideId)}/reorder`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ order }),
        });
      } catch (err) {
        setPages(before);
        toast.error(`${t.board.reorderFailed}: ${String((err as Error).message ?? err)}`);
      }
    },
    [pages, slideId, send, t.board],
  );

  const duplicate = useCallback(
    async (i: number) => {
      const before = pages;
      if (i < 0 || i >= before.length) return;
      const next = [...before];
      next.splice(i + 1, 0, before[i]);
      setPages(next);
      try {
        await send(`/__slides/${encodeURIComponent(slideId)}/pages/${i}/duplicate`, {
          method: 'POST',
        });
        toast.success(format(t.thumbnailRail.toastDuplicated, { n: i + 1 }));
      } catch (err) {
        setPages(before);
        toast.error(
          `${t.thumbnailRail.toastDuplicateFailed}: ${String((err as Error).message ?? err)}`,
        );
      }
    },
    [pages, slideId, send, t.thumbnailRail],
  );

  const insert = useCallback(
    async (i: number) => {
      const before = pages;
      if (i < 0 || i > before.length) return;
      // The blank page has no component here yet; the server writes one and the
      // deck reloads through HMR, so the local list only has to hold its slot.
      const next = [...before];
      next.splice(i, 0, before[Math.max(0, i - 1)]);
      setPages(next);
      try {
        await send(`/__slides/${encodeURIComponent(slideId)}/pages/${i}/insert`, {
          method: 'POST',
        });
        toast.success(format(t.board.toastInserted, { n: i + 1 }));
      } catch (err) {
        setPages(before);
        toast.error(`${t.board.insertFailed}: ${String((err as Error).message ?? err)}`);
      }
    },
    [pages, slideId, send, t.board],
  );

  const remove = useCallback(
    async (i: number) => {
      const before = pages;
      if (i < 0 || i >= before.length || before.length <= 1) return;
      setPages(before.slice(0, i).concat(before.slice(i + 1)));
      try {
        await send(`/__slides/${encodeURIComponent(slideId)}/pages/${i}`, { method: 'DELETE' });
        toast.success(format(t.thumbnailRail.toastDeleted, { n: i + 1 }));
      } catch (err) {
        setPages(before);
        toast.error(
          `${t.thumbnailRail.toastDeleteFailed}: ${String((err as Error).message ?? err)}`,
        );
      }
    },
    [pages, slideId, send, t.thumbnailRail],
  );

  const moveToEnd = useCallback(
    async (i: number) => {
      await reorder(i, pages.length - 1);
    },
    [reorder, pages.length],
  );

  return { pages, reorder, duplicate, insert, remove, moveToEnd };
}
