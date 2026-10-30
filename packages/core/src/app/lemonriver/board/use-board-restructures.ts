import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useLrText } from '../text';
import { type Restructure, sanitizeRestructures } from './model/restructure';

const SAVE_DELAY = 150;

/**
 * The pages waiting to be split or merged. Like the block moves it is board
 * data: the deck is only touched when the list is handed to the agent.
 */
export function useBoardRestructures(slideId: string) {
  const lr = useLrText();
  const [restructures, setRestructures] = useState<Restructure[]>([]);
  const [ready, setReady] = useState(false);
  const listRef = useRef(restructures);
  listRef.current = restructures;
  const readyRef = useRef(false);
  const timer = useRef<number | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const save = useCallback(
    (next: Restructure[]) => {
      const body = JSON.stringify({ slideId, restructures: next });
      queue.current = queue.current.then(async () => {
        try {
          const res = await fetch('/__board/restructures', {
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

  const flush = useCallback(() => {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
    save(listRef.current);
  }, [save]);

  const commit = useCallback(
    (next: Restructure[]) => {
      listRef.current = next;
      setRestructures(next);
      if (!readyRef.current) return;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        save(listRef.current);
      }, SAVE_DELAY);
    },
    [save],
  );

  /** Takes what the server already holds, without writing it back. */
  const replace = useCallback((next: Restructure[]) => {
    listRef.current = next;
    setRestructures(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    setReady(false);
    setRestructures([]);
    listRef.current = [];
    (async () => {
      try {
        const res = await fetch(`/__board/restructures?slideId=${encodeURIComponent(slideId)}`);
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { restructures?: unknown };
        if (cancelled) return;
        const next = sanitizeRestructures(body.restructures);
        listRef.current = next;
        setRestructures(next);
        readyRef.current = true;
        setReady(true);
      } catch {
        // Left unloaded, so nothing written from here can overwrite a list
        // that was never read.
      }
    })();
    return () => {
      cancelled = true;
      flush();
    };
  }, [slideId, flush]);

  useEffect(() => {
    const onLeave = () => flush();
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [flush]);

  return { restructures, ready, setRestructures: commit, replace };
}
