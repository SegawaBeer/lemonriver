import { useEffect, useState } from 'react';

export type DeckTimes = Record<string, { modifiedAt: number }>;

/** When each deck was last saved. Only the dev server knows; a built site gets nothing. */
export function useDeckTimes(): DeckTimes {
  const [times, setTimes] = useState<DeckTimes>({});
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let cancelled = false;
    const load = () =>
      fetch('/__lr/decks')
        .then((res) => (res.ok ? (res.json() as Promise<{ decks: DeckTimes }>) : null))
        .then((data) => {
          if (!cancelled && data) setTimes(data.decks);
        })
        .catch(() => {});
    void load();
    const hot = import.meta.hot;
    hot?.on('open-slide:slide-changed', load);
    return () => {
      cancelled = true;
      hot?.off('open-slide:slide-changed', load);
    };
  }, []);
  return times;
}
