import { describe, expect, it } from 'vitest';
import { filterDecks, sortDecks } from './sorting';

const created = { a: 3, b: 1, c: 2 };
const titles: Record<string, string> = { a: 'Zeta', b: 'alpha 10', c: 'Alpha 9' };

describe('sortDecks', () => {
  it('orders by creation time and by title', () => {
    const ids = ['a', 'b', 'c'];
    expect(sortDecks(ids, 'created-desc', (id) => titles[id], created)).toEqual(['a', 'c', 'b']);
    expect(sortDecks(ids, 'created-asc', (id) => titles[id], created)).toEqual(['b', 'c', 'a']);
    expect(sortDecks(ids, 'title-asc', (id) => titles[id], created)).toEqual(['c', 'b', 'a']);
    expect(sortDecks(ids, 'title-desc', (id) => titles[id], created)).toEqual(['a', 'b', 'c']);
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});

describe('filterDecks', () => {
  it('matches the id or the title, ignoring case', () => {
    expect(filterDecks(['a', 'b', 'c'], ' ALPHA ', titles)).toEqual(['b', 'c']);
    expect(filterDecks(['a', 'b', 'c'], 'b', titles)).toEqual(['b']);
    expect(filterDecks(['a', 'b'], '', titles)).toEqual(['a', 'b']);
  });
});
