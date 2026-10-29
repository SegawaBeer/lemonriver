import { describe, expect, it } from 'vitest';
import type { BoardCard } from './cards';
import { EMPTY_FILTER, isFilterActive, matchesFilter, toggleStatus } from './filter.ts';

const card = (over: BoardCard = {}): BoardCard => over;

describe('board filter', () => {
  it('keeps everything while no filter is set', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(matchesFilter(undefined, false, EMPTY_FILTER)).toBe(true);
    expect(matchesFilter(card({ status: 'todo' }), false, EMPTY_FILTER)).toBe(true);
  });

  it('keeps only the chosen statuses', () => {
    const filter = { ...EMPTY_FILTER, statuses: ['done' as const] };
    expect(matchesFilter(card({ status: 'done' }), false, filter)).toBe(true);
    expect(matchesFilter(card({ status: 'doing' }), false, filter)).toBe(false);
    expect(matchesFilter(card(), false, filter)).toBe(false);
  });

  it('accepts any of several chosen statuses', () => {
    const filter = { ...EMPTY_FILTER, statuses: ['done' as const, 'review' as const] };
    expect(matchesFilter(card({ status: 'review' }), false, filter)).toBe(true);
  });

  it('narrows to cards carrying a work memo', () => {
    const filter = { ...EMPTY_FILTER, memo: true };
    expect(matchesFilter(card({ memo: 'Q3 numbers' }), false, filter)).toBe(true);
    expect(matchesFilter(card({ title: 'Cover' }), false, filter)).toBe(false);
  });

  it('narrows to cards with an unhandled comment', () => {
    const filter = { ...EMPTY_FILTER, comments: true };
    expect(matchesFilter(card(), true, filter)).toBe(true);
    expect(matchesFilter(card(), false, filter)).toBe(false);
  });

  it('asks for every set condition at once', () => {
    const filter = { statuses: ['done' as const], memo: true, comments: true };
    expect(matchesFilter(card({ status: 'done', memo: 'x' }), true, filter)).toBe(true);
    expect(matchesFilter(card({ status: 'done', memo: 'x' }), false, filter)).toBe(false);
    expect(matchesFilter(card({ status: 'todo', memo: 'x' }), true, filter)).toBe(false);
  });

  it('toggles a status on and off again', () => {
    const on = toggleStatus(EMPTY_FILTER, 'done');
    expect(on.statuses).toEqual(['done']);
    expect(toggleStatus(on, 'done').statuses).toEqual([]);
  });
});
