import { useEffect, useState } from 'react';

/**
 * Which pages carry a comment. Comments are read-only here: the board only
 * needs to know that a page has one, so a filter can pick those pages out.
 */
export function useBoardComments(slideId: string, count: number): boolean[] {
  const [pages, setPages] = useState<boolean[]>([]);

  useEffect(() => {
    let cancelled = false;
    setPages([]);
    if (!slideId) return;
    (async () => {
      try {
        const res = await fetch(`/__comments?slideId=${encodeURIComponent(slideId)}`);
        if (!res.ok) return;
        const body = (await res.json()) as { comments?: { page?: unknown }[] };
        if (cancelled) return;
        const next = Array.from({ length: count }, () => false);
        for (const comment of body.comments ?? []) {
          const page = comment?.page;
          if (typeof page === 'number' && page >= 0 && page < next.length) next[page] = true;
        }
        setPages(next);
      } catch {
        // No comments read: every card reads as having none.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slideId, count]);

  return pages;
}
