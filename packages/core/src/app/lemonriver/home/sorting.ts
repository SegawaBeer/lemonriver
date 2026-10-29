import { useState } from 'react';

export type SortKey = 'created-desc' | 'created-asc' | 'title-asc' | 'title-desc';

export const SORT_KEYS: readonly SortKey[] = [
  'created-desc',
  'created-asc',
  'title-asc',
  'title-desc',
];

// The official home's key, so the order someone picked there carries over.
const SORT_STORAGE_KEY = 'open-slide:home-sort';

function readSortPref(): SortKey {
  try {
    const raw = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (raw && (SORT_KEYS as readonly string[]).includes(raw)) return raw as SortKey;
  } catch {}
  return 'created-desc';
}

export function useSortPref(): [SortKey, (next: SortKey) => void] {
  const [value, setValue] = useState<SortKey>(readSortPref);
  const set = (next: SortKey) => {
    setValue(next);
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, next);
    } catch {}
  };
  return [value, set];
}

const TITLE_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export function sortDecks(
  ids: string[],
  key: SortKey,
  titleOf: (id: string) => string,
  createdAt: Record<string, number>,
): string[] {
  const list = ids.slice();
  if (key === 'title-asc') list.sort((a, b) => TITLE_COLLATOR.compare(titleOf(a), titleOf(b)));
  else if (key === 'title-desc')
    list.sort((a, b) => TITLE_COLLATOR.compare(titleOf(b), titleOf(a)));
  else if (key === 'created-asc') list.sort((a, b) => (createdAt[a] ?? 0) - (createdAt[b] ?? 0));
  else list.sort((a, b) => (createdAt[b] ?? 0) - (createdAt[a] ?? 0));
  return list;
}

export function filterDecks(
  ids: string[],
  query: string,
  titles: Record<string, string>,
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return ids;
  return ids.filter((id) => id.toLowerCase().includes(q) || titles[id]?.toLowerCase().includes(q));
}
