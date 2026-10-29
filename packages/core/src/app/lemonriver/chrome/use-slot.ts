import { useEffect, useState } from 'react';

/** The element an official file marks with `attr`, tracked as it mounts and unmounts. */
export function useSlot(attr: string, enabled = true): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSlot(null);
      return;
    }
    const find = () => document.querySelector<HTMLElement>(`[${attr}]`);
    setSlot(find());
    const observer = new MutationObserver(() => {
      const next = find();
      setSlot((prev) => (prev === next ? prev : next));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [attr, enabled]);

  return slot;
}
