import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useLrText } from '../text';
import { type Placement, sanitizeChanges } from './model/changes';

const SAVE_DELAY = 150;

/**
 * The list of blocks waiting to be moved. It belongs to the board, not the
 * deck: nothing here is applied until the change list is handed to the agent.
 */
export function useBoardChanges(slideId: string) {
  const lr = useLrText();
  const [changes, setChanges] = useState<Placement[]>([]);
  const [ready, setReady] = useState(false);
  const changesRef = useRef(changes);
  changesRef.current = changes;
  const readyRef = useRef(false);
  const timer = useRef<number | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const save = useCallback(
    (next: Placement[]) => {
      const body = JSON.stringify({ slideId, changes: next });
      queue.current = queue.current.then(async () => {
        try {
          const res = await fetch('/__board/changes', {
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
    save(changesRef.current);
  }, [save]);

  const commit = useCallback(
    (next: Placement[]) => {
      changesRef.current = next;
      setChanges(next);
      if (!readyRef.current) return;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        save(changesRef.current);
      }, SAVE_DELAY);
    },
    [save],
  );

  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    setReady(false);
    setChanges([]);
    changesRef.current = [];
    (async () => {
      try {
        const res = await fetch(`/__board/changes?slideId=${encodeURIComponent(slideId)}`);
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { changes?: unknown };
        if (cancelled) return;
        const next = sanitizeChanges(body.changes);
        changesRef.current = next;
        setChanges(next);
        readyRef.current = true;
        setReady(true);
      } catch {
        // Left unloaded, so nothing written from here can overwrite changes
        // that were never read.
      }
    })();
    return () => {
      cancelled = true;
      flush();
    };
  }, [slideId, flush]);

  // A reload during the debounce window would otherwise drop the last move.
  useEffect(() => {
    const onLeave = () => flush();
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [flush]);

  return { changes, ready, setChanges: commit };
}
