import { describe, expect, it } from 'vitest';
import { daysLeft, greetingFor, relativeTime } from './time';

const NOW = Date.parse('2026-10-29T12:00:00Z');

describe('relativeTime', () => {
  it('picks the largest unit that fits', () => {
    expect(relativeTime(NOW - 3 * 24 * 3600 * 1000, NOW, 'en')).toBe('3 days ago');
    expect(relativeTime(NOW - 24 * 3600 * 1000, NOW, 'en')).toBe('yesterday');
    expect(relativeTime(NOW - 2 * 3600 * 1000, NOW, 'en')).toBe('2 hours ago');
    expect(relativeTime(NOW - 10 * 1000, NOW, 'en')).toBe('now');
    expect(relativeTime(NOW - 3 * 24 * 3600 * 1000, NOW, 'zh-CN')).toBe('3天前');
  });
});

describe('greetingFor', () => {
  it('splits the day at noon and six', () => {
    expect(greetingFor(9)).toBe('morning');
    expect(greetingFor(12)).toBe('afternoon');
    expect(greetingFor(17)).toBe('afternoon');
    expect(greetingFor(18)).toBe('evening');
    expect(greetingFor(2)).toBe('evening');
  });
});

describe('daysLeft', () => {
  it('rounds up and never shows zero', () => {
    const day = 24 * 3600 * 1000;
    expect(daysLeft(NOW + 29.2 * day, NOW)).toBe(30);
    expect(daysLeft(NOW + day, NOW)).toBe(1);
    expect(daysLeft(NOW + 1000, NOW)).toBe(1);
  });
});
