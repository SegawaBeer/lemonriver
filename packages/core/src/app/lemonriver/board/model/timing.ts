import { format } from '../../../../locale/format';
import type { Locale } from '../../../../locale/types';
import { lrTextFor } from '../../text/all';
import type { Block } from '../blocks/classify';

/** How long a page takes to say, and what that number was read from. */
export type Timing = { seconds: number; basis: 'notes' | 'page' | 'none' };

const CHARS_PER_MINUTE = 240;
const WORDS_PER_MINUTE = 150;
const MIN_SECONDS = 15;
/** A picture the speaker has to talk over, when nothing else says how long. */
const PICTURE_SECONDS = 5;
const STEP = 5;

/** Han, kana and the punctuation that reads as a character of its own. */
const CJK = /[々〇぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/g;

/** Seconds to say `text`: Chinese and Japanese by the character, the rest by the word. */
export function speakingSeconds(text: string): number {
  const chars = text.match(CJK)?.length ?? 0;
  const words = text
    .replace(CJK, ' ')
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  return (chars / CHARS_PER_MINUTE) * 60 + (words / WORDS_PER_MINUTE) * 60;
}

/** Rounded to five seconds, and never under the time it takes to switch pages. */
const settle = (seconds: number) => Math.max(MIN_SECONDS, Math.round(seconds / STEP) * STEP);

/**
 * Speaker notes win when the page has them — they are what will actually be
 * said. Otherwise the words on the page stand in for them, with a few seconds
 * for every picture or chart on it. A page whose blocks cannot be read only
 * gets the minimum.
 */
export function estimateSeconds({
  notes,
  blocks,
}: {
  notes?: string;
  blocks: Block[] | null;
}): Timing {
  if (notes?.trim()) return { seconds: settle(speakingSeconds(notes)), basis: 'notes' };
  if (!blocks) return { seconds: MIN_SECONDS, basis: 'none' };

  const words = blocks
    .map((block) => block.text)
    .filter(Boolean)
    .join(' ');
  const pictures = blocks.filter(
    (block) => block.kind === 'image' || block.kind === 'chart',
  ).length;
  return {
    seconds: settle(speakingSeconds(words) + pictures * PICTURE_SECONDS),
    basis: 'page',
  };
}

/** "45s", "1m 20s", "12 min" — the units come from the deck's language. */
export function formatDuration(seconds: number, locale: Locale['id']): string {
  const text = lrTextFor(locale).board;
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return format(text.durationSeconds, { s: rest });
  if (rest === 0) return format(text.durationMinutes, { m: minutes });
  return format(text.durationMinSec, { m: minutes, s: rest });
}

/** Pixels a second takes on the timeline, and the narrowest a page may be drawn. */
export const PX_PER_SECOND = 4;
export const MIN_SEGMENT_PX = 48;

const TARGET_MAX_MINUTES = 180;

/** The length the deck is aiming for, in whole minutes, or null for no target. */
export function sanitizeTargetMinutes(raw: unknown): number | null {
  const value =
    typeof raw === 'string' && raw.trim() ? Number(raw) : typeof raw === 'number' ? raw : null;
  if (value === null || !Number.isFinite(value)) return null;
  const minutes = Math.round(value);
  return minutes >= 1 && minutes <= TARGET_MAX_MINUTES ? minutes : null;
}

export type Segment = { start: number; width: number };

/** Where each page's stretch sits on the track, in track pixels. */
export function timelineSegments(seconds: number[]): Segment[] {
  let at = 0;
  return seconds.map((value) => {
    const width = Math.max(MIN_SEGMENT_PX, value * PX_PER_SECOND);
    const segment = { start: at, width };
    at += width;
    return segment;
  });
}

/**
 * Where a moment of the talk falls on the track. Pages drawn at their minimum
 * width take more room than their time, so the moment is read from the time up
 * to the page's own start rather than from the pixel count.
 */
export function xForSeconds(seconds: number[], target: number): number {
  const segments = timelineSegments(seconds);
  const total = segments.reduce((sum, segment) => sum + segment.width, 0);
  let spoken = 0;
  for (const [index, value] of seconds.entries()) {
    if (value <= 0) continue;
    if (target <= spoken + value) {
      return segments[index].start + ((target - spoken) / value) * segments[index].width;
    }
    spoken += value;
  }
  return total;
}
