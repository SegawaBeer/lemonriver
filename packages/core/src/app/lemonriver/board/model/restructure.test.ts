import { describe, expect, it } from 'vitest';
import {
  addMerge,
  addSplit,
  carryRestructures,
  type Restructure,
  removeRestructure,
  restructuredPages,
  restructureReplaced,
  type SplitBlock,
  sanitizeRestructures,
} from './restructure.ts';

const P1 = '@0';
const P2 = '@1';
const P3 = '@2';

const picked = (id: string, text = `Text of ${id}`): SplitBlock => ({ id, kind: 'text', text });

describe('addSplit', () => {
  it('adds one record per page and replaces the page’s earlier split', () => {
    const once = addSplit([], P1, [picked('a'), picked('b')]);
    expect(once).toEqual([
      {
        kind: 'split',
        page: P1,
        blocks: ['a', 'b'],
        blockInfo: [
          { id: 'a', kind: 'text', text: 'Text of a' },
          { id: 'b', kind: 'text', text: 'Text of b' },
        ],
      },
    ]);
    const twice = addSplit(once, P1, [picked('c')]);
    expect(twice).toEqual([
      {
        kind: 'split',
        page: P1,
        blocks: ['c'],
        blockInfo: [{ id: 'c', kind: 'text', text: 'Text of c' }],
      },
    ]);
  });

  it('takes the place of a merge that involved the page', () => {
    const merged = addMerge([], P1, P2);
    expect(addSplit(merged, P2, [picked('a')])).toEqual([
      {
        kind: 'split',
        page: P2,
        blocks: ['a'],
        blockInfo: [{ id: 'a', kind: 'text', text: 'Text of a' }],
      },
    ]);
  });

  it('leaves the list alone when no block is named', () => {
    expect(addSplit([], P1, [])).toEqual([]);
    expect(addSplit([], P1, [picked('')])).toEqual([]);
  });
});

describe('addMerge', () => {
  it('records a pair once and replaces the earlier pair', () => {
    const once = addMerge([], P1, P2);
    expect(once).toEqual([{ kind: 'merge', pages: [P1, P2] }]);
    expect(addMerge(once, P1, P2)).toHaveLength(1);
  });

  it('takes the place of a split on either page', () => {
    const split = addSplit([], P2, [picked('a')]);
    expect(addMerge(split, P1, P2)).toEqual([{ kind: 'merge', pages: [P1, P2] }]);
  });

  it('drops a merge that shared a page', () => {
    const merged = addMerge(addMerge([], P1, P2), P2, P3);
    expect(merged).toEqual([{ kind: 'merge', pages: [P2, P3] }]);
  });

  it('refuses the same page twice', () => {
    expect(addMerge([], P1, P1)).toEqual([]);
  });
});

describe('restructureReplaced', () => {
  it('is true only when a record of the other kind is taken away', () => {
    const split = addSplit([], P1, [picked('a')]);
    expect(restructureReplaced(split, { kind: 'merge', pages: [P1, P2] })).toBe(true);
    expect(restructureReplaced(split, { kind: 'split', page: P1, blocks: ['b'] })).toBe(false);
    expect(restructureReplaced(split, { kind: 'split', page: P2, blocks: ['b'] })).toBe(false);
  });
});

describe('removeRestructure', () => {
  it('drops the record at that index', () => {
    const list: Restructure[] = [
      { kind: 'split', page: P1, blocks: ['a'] },
      { kind: 'merge', pages: [P2, P3] },
    ];
    expect(removeRestructure(list, 0)).toEqual([{ kind: 'merge', pages: [P2, P3] }]);
  });
});

describe('restructuredPages', () => {
  it('names every page a split or merge touches', () => {
    const list: Restructure[] = [
      { kind: 'split', page: P1, blocks: ['a'] },
      { kind: 'merge', pages: [P2, P3] },
    ];
    expect([...restructuredPages(list)].sort()).toEqual([P1, P2, P3].sort());
  });
});

describe('carryRestructures', () => {
  const before = [P1, P2, P3];

  it('renames the pages a reorder moved', () => {
    const list: Restructure[] = [
      { kind: 'split', page: P2, blocks: ['a'] },
      { kind: 'merge', pages: [P1, P3] },
    ];
    // Pages keyed by position: what was page 2 is now the first page.
    expect(carryRestructures(list, before, [P1, P2, P3], [1, 2, 0])).toEqual([
      { kind: 'split', page: P1, blocks: ['a'] },
      { kind: 'merge', pages: [P3, P2] },
    ]);
  });

  it('drops a record whose page is gone', () => {
    const list: Restructure[] = [
      { kind: 'split', page: P2, blocks: ['a'] },
      { kind: 'merge', pages: [P1, P3] },
    ];
    // Page 2 deleted: the pages left are the first and third, re-keyed.
    expect(carryRestructures(list, before, [P1, P2], [0, 2])).toEqual([
      { kind: 'merge', pages: [P1, P2] },
    ]);
  });

  it('renames a duplicate so the copy carries nothing', () => {
    const list: Restructure[] = [{ kind: 'split', page: P2, blocks: ['a'] }];
    // Page 2 duplicated: the copy takes the new key, the split stays on the original.
    expect(carryRestructures(list, before, [P1, P2, P3, '@3'], [0, 1, 2, -1])).toEqual([
      { kind: 'split', page: P2, blocks: ['a'] },
    ]);
  });
});

describe('sanitizeRestructures', () => {
  it('keeps only well-formed records', () => {
    expect(
      sanitizeRestructures([
        { kind: 'split', page: P1, blocks: ['a', '', 'a'] },
        { kind: 'merge', pages: [P1, P2] },
        { kind: 'merge', pages: [P1, P1] },
        { kind: 'split', page: '', blocks: ['a'] },
        { kind: 'split', page: P1, blocks: [] },
        { kind: 'move', page: P1 },
        null,
      ]),
    ).toEqual([
      {
        kind: 'split',
        page: P1,
        blocks: ['a'],
        blockInfo: [{ id: 'a', kind: 'text', text: '' }],
      },
      { kind: 'merge', pages: [P1, P2] },
    ]);
  });

  it('keeps the words stored beside a split’s blocks', () => {
    expect(
      sanitizeRestructures([
        {
          kind: 'split',
          page: P1,
          blocks: ['a'],
          blockInfo: [{ id: 'a', kind: 'chart', text: '' }],
        },
      ]),
    ).toEqual([
      {
        kind: 'split',
        page: P1,
        blocks: ['a'],
        blockInfo: [{ id: 'a', kind: 'chart', text: '' }],
      },
    ]);
  });

  it('caps the list at fifty', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      kind: 'split',
      page: `@${i}`,
      blocks: ['a'],
    }));
    expect(sanitizeRestructures(many)).toHaveLength(50);
  });

  it('reads anything that is not a list as none', () => {
    expect(sanitizeRestructures(null)).toEqual([]);
    expect(sanitizeRestructures({ kind: 'split' })).toEqual([]);
  });
});
