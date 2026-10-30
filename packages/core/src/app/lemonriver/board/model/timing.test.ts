import { describe, expect, it } from 'vitest';
import type { Block } from '../blocks/classify';
import {
  estimateSeconds,
  formatDuration,
  sanitizeTargetMinutes,
  speakingSeconds,
} from './timing.ts';

const block = (kind: Block['kind'], text = ''): Block => ({
  id: `${kind}-${text}`,
  kind,
  text,
  loc: null,
  box: { x: 0, y: 0, w: 0, h: 0 },
});

/** A run of Chinese characters, one second per four of them. */
const han = (count: number) => '字'.repeat(count);
const words = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ');

describe('estimateSeconds', () => {
  it('reads Chinese by the character: 240 a minute', () => {
    expect(estimateSeconds({ blocks: null, notes: han(240) })).toEqual({
      seconds: 60,
      basis: 'notes',
    });
  });

  it('reads English by the word: 150 a minute', () => {
    expect(estimateSeconds({ blocks: null, notes: words(150) })).toEqual({
      seconds: 60,
      basis: 'notes',
    });
  });

  it('adds up a page that mixes both', () => {
    // Half a minute of Chinese plus half a minute of English.
    expect(speakingSeconds(`${han(120)} ${words(75)}`)).toBeCloseTo(60, 5);
  });

  it('gives a page with only a chart the minimum', () => {
    expect(estimateSeconds({ blocks: [block('chart')] })).toEqual({
      seconds: 15,
      basis: 'page',
    });
  });

  it('prefers the speaker notes over the words on the page', () => {
    const timing = estimateSeconds({ notes: han(240), blocks: [block('text', words(300))] });
    expect(timing).toEqual({ seconds: 60, basis: 'notes' });
  });

  it('never goes under fifteen seconds', () => {
    expect(estimateSeconds({ blocks: null, notes: 'Hi' }).seconds).toBe(15);
    expect(estimateSeconds({ blocks: [block('text', han(4))] }).seconds).toBe(15);
  });

  it('rounds to five seconds', () => {
    // 224 characters is 56 s, 232 is 58 s.
    expect(estimateSeconds({ blocks: null, notes: han(224) }).seconds).toBe(55);
    expect(estimateSeconds({ blocks: null, notes: han(232) }).seconds).toBe(60);
  });

  it('adds five seconds for each picture when the page is the source', () => {
    // 120 characters is 30 s, plus two pictures.
    const timing = estimateSeconds({
      blocks: [block('text', han(120)), block('image'), block('chart')],
    });
    expect(timing).toEqual({ seconds: 40, basis: 'page' });
  });

  it('cannot tell how long a page whose blocks were not read takes', () => {
    expect(estimateSeconds({ blocks: null })).toEqual({ seconds: 15, basis: 'none' });
  });

  it('falls back to the page when the notes are blank', () => {
    expect(estimateSeconds({ notes: '   ', blocks: [block('text', han(120))] })).toEqual({
      seconds: 30,
      basis: 'page',
    });
  });
});

describe('formatDuration', () => {
  it('writes seconds, minutes and seconds, and whole minutes', () => {
    expect(formatDuration(45, 'en')).toBe('45s');
    expect(formatDuration(80, 'en')).toBe('1m 20s');
    expect(formatDuration(720, 'en')).toBe('12 min');
  });

  it('writes the same in Chinese', () => {
    expect(formatDuration(45, 'zh-CN')).toBe('45 秒');
    expect(formatDuration(80, 'zh-CN')).toBe('1 分 20 秒');
    expect(formatDuration(720, 'zh-CN')).toBe('12 分钟');
  });
});

describe('sanitizeTargetMinutes', () => {
  it('keeps a whole number of minutes within an hour and a half', () => {
    expect(sanitizeTargetMinutes(12)).toBe(12);
    expect(sanitizeTargetMinutes('7')).toBe(7);
    expect(sanitizeTargetMinutes(180)).toBe(180);
  });

  it('refuses what cannot be a target', () => {
    expect(sanitizeTargetMinutes(0)).toBeNull();
    expect(sanitizeTargetMinutes(181)).toBeNull();
    expect(sanitizeTargetMinutes('')).toBeNull();
    expect(sanitizeTargetMinutes('soon')).toBeNull();
    expect(sanitizeTargetMinutes(null)).toBeNull();
  });
});
