const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 days ago", "yesterday", "now" — in the reader's language. */
export function relativeTime(ms: number, now: number, locale: string): string {
  const seconds = (ms - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, 'second');
}

export type Greeting = 'morning' | 'afternoon' | 'evening';

export function greetingFor(hour: number): Greeting {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

const DAY_MS = 24 * 3600 * 1000;

/** Whole days until `expiresAt`, never below 1 while the entry still exists. */
export function daysLeft(expiresAt: number, now: number): number {
  return Math.max(1, Math.ceil((expiresAt - now) / DAY_MS));
}
