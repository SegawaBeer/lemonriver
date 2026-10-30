import { useCallback, useEffect, useRef, useState } from 'react';
import { sanitizeTargetMinutes } from './model/timing';

/**
 * The length the deck is aiming for, kept with the board's own record so it
 * outlives the visit. Writes run one after another: two typing bursts must not
 * land out of order.
 */
export function useTargetMinutes(slideId: string) {
  const [target, setTarget] = useState<number | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    setTarget(null);
    (async () => {
      try {
        const res = await fetch(`/__board?slideId=${encodeURIComponent(slideId)}`);
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { targetMinutes?: unknown };
        if (!cancelled) setTarget(sanitizeTargetMinutes(body.targetMinutes));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [slideId]);

  const choose = useCallback(
    (minutes: number | null) => {
      const next = sanitizeTargetMinutes(minutes);
      setTarget(next);
      queue.current = queue.current.then(async () => {
        try {
          await fetch('/__board/target', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slideId, targetMinutes: next }),
          });
        } catch {}
      });
    },
    [slideId],
  );

  return [target, choose] as const;
}
