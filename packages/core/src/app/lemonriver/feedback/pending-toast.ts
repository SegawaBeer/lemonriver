const KEY = 'lemonriver:pending-toast';

/**
 * A toast to show after the page reloads. Moving a deck in or out of the trash
 * reloads every client, and the dev server's own reload can land before the
 * request's response does, so the toast is saved before the request is sent.
 */
export type PendingToast = { kind: 'trashed' | 'restored'; slideId: string; name: string };

export function savePendingToast(toast: PendingToast, storage: Storage = sessionStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(toast));
  } catch {}
}

export function clearPendingToast(storage: Storage = sessionStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {}
}

export function takePendingToast(storage: Storage = sessionStorage): PendingToast | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(KEY);
    storage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.kind !== 'trashed' && value.kind !== 'restored') return null;
    if (typeof value.slideId !== 'string' || typeof value.name !== 'string') return null;
    return { kind: value.kind, slideId: value.slideId, name: value.name };
  } catch {
    return null;
  }
}
