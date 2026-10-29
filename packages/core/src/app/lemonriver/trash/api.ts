import { clearPendingToast, savePendingToast } from '../feedback/pending-toast';

export type TrashEntry = {
  id: string;
  slideId: string;
  title: string;
  folderId: string | null;
  deletedAt: number;
  expiresAt: number;
};

export const DECKS_CHANGED_EVENT = 'lemonriver:decks-changed';

let ownChanges = 0;

/** True while this page changes the deck list itself and will reload on its own. */
export function changingDecksHere(): boolean {
  return ownChanges > 0;
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export async function listTrash(): Promise<TrashEntry[]> {
  const { entries } = await call<{ entries: TrashEntry[] }>('GET', '/__lr/trash');
  return entries;
}

async function changeDecks(
  pending: Parameters<typeof savePendingToast>[0],
  run: () => Promise<unknown>,
): Promise<void> {
  ownChanges++;
  savePendingToast(pending);
  try {
    await run();
  } catch (err) {
    ownChanges--;
    clearPendingToast();
    throw err;
  }
  window.location.reload();
}

export function moveToTrash(slideId: string, name: string): Promise<void> {
  return changeDecks({ kind: 'trashed', slideId, name }, () =>
    call('POST', '/__lr/trash', { slideId }),
  );
}

export function restoreFromTrash(entry: TrashEntry): Promise<void> {
  return changeDecks({ kind: 'restored', slideId: entry.slideId, name: entry.title }, () =>
    call('POST', `/__lr/trash/${encodeURIComponent(entry.id)}/restore`),
  );
}

export async function deleteForever(entryId: string): Promise<void> {
  await call('DELETE', `/__lr/trash/${encodeURIComponent(entryId)}`);
}

/** The newest trash entry for a deck, which is the one its undo restores. */
export function latestEntryFor(entries: TrashEntry[], slideId: string): TrashEntry | null {
  let latest: TrashEntry | null = null;
  for (const entry of entries) {
    if (entry.slideId === slideId && (!latest || entry.deletedAt > latest.deletedAt))
      latest = entry;
  }
  return latest;
}
