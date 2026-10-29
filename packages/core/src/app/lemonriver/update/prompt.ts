import { pageForPath } from '../theme/pages';

export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
export const SNOOZE_MS = 24 * 60 * 60 * 1000;
export const SNOOZE_KEY = 'lemonriver:update-snooze';

export type UpdateCheck = { current: string; latest: string | null; outdated: boolean };
export type Snooze = { version: string; until: number };

export function shouldPrompt(
  check: UpdateCheck | null,
  snooze: Snooze | null,
  now: number,
): boolean {
  if (!check || !check.outdated || !check.latest) return false;
  const snoozed = snooze !== null && snooze.version === check.latest && now < snooze.until;
  return !snoozed;
}

export function readSnooze(storage: Storage): Snooze | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(SNOOZE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    if (!value || typeof value !== 'object') return null;
    if (typeof value.version !== 'string') return null;
    if (typeof value.until !== 'number' || !Number.isFinite(value.until)) return null;
    return { version: value.version, until: value.until };
  } catch {
    return null;
  }
}

export function saveSnooze(storage: Storage, version: string, now: number): void {
  try {
    storage.setItem(SNOOZE_KEY, JSON.stringify({ version, until: now + SNOOZE_MS }));
  } catch {}
}

export function promptsOnPage(pathname: string): boolean {
  const page = pageForPath(pathname);
  return page !== 'preview' && page !== 'presenter';
}
