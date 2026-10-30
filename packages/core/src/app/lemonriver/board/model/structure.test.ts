import { describe, expect, it } from 'vitest';
import {
  addColumnAfter,
  type BoardColumn,
  chapterProgress,
  columnOfPosition,
  columnsAfterApply,
  columnsAfterInsert,
  columnsAfterMove,
  columnsAfterMoveMany,
  columnsAfterRemove,
  deleteColumnAt,
  insertPageColumn,
  moveColumnBlock,
  orderAfterColumnMove,
  reconcileColumns,
  sanitizeStructure,
} from './structure.ts';

const deck = (): BoardColumn[] => [
  { title: 'Cover', size: 2 },
  { title: 'Chapter 1', size: 6 },
  { title: 'Chapter 2', size: 8 },
];

describe('columnOfPosition', () => {
  it('maps a deck position to the column holding it', () => {
    const columns = deck();
    expect([0, 1, 2, 7, 8, 15].map((p) => columnOfPosition(columns, p))).toEqual([
      0, 0, 1, 1, 2, 2,
    ]);
  });

  it('skips empty columns instead of claiming a position for them', () => {
    const columns = [
      { title: 'A', size: 1 },
      { title: 'B', size: 0 },
      { title: 'C', size: 1 },
    ];
    expect(columnOfPosition(columns, 1)).toBe(2);
  });
});

describe('columnsAfterMove', () => {
  it('hands exactly one page over when a card crosses a boundary', () => {
    expect(columnsAfterMove(deck(), 2, 10).map((c) => c.size)).toEqual([2, 5, 9]);
  });

  it('leaves the structure alone when a card moves inside its own column', () => {
    const columns = deck();
    expect(columnsAfterMove(columns, 3, 6)).toBe(columns);
  });

  it('keeps a chapter together when the page that heads it moves away', () => {
    // The reported defect: dragging a chapter page into another chapter used to
    // re-group the deck, so the five pages it headed jumped column with it. The
    // structure is the board's own now, so only the dragged page changes column.
    const after = columnsAfterMove(deck(), 2, 12);
    expect(after.map((c) => c.size)).toEqual([2, 5, 9]);
    expect(after.map((c) => c.title)).toEqual(['Cover', 'Chapter 1', 'Chapter 2']);
  });
});

describe('reconcileColumns', () => {
  it('leaves a structure that already matches the deck', () => {
    expect(reconcileColumns(deck(), 16).map((c) => c.size)).toEqual([2, 6, 8]);
  });

  it('gives pages added outside the board to the last column', () => {
    expect(reconcileColumns(deck(), 18).map((c) => c.size)).toEqual([2, 6, 10]);
  });

  it('takes pages deleted outside the board off the end', () => {
    expect(reconcileColumns(deck(), 12).map((c) => c.size)).toEqual([2, 6, 4]);
  });

  it('drops trailing columns a deletion emptied rather than leaving dead labels', () => {
    expect(reconcileColumns(deck(), 8).map((c) => c.title)).toEqual(['Cover', 'Chapter 1']);
  });

  it('always leaves one column for a deck that still has pages', () => {
    expect(reconcileColumns([], 4)).toEqual([{ title: '', size: 4 }]);
    expect(reconcileColumns(deck(), 1).map((c) => c.size)).toEqual([1]);
  });

  it('reports no columns for an empty deck', () => {
    expect(reconcileColumns(deck(), 0)).toEqual([]);
  });
});

describe('sanitizeStructure', () => {
  it('accepts a stored structure', () => {
    expect(sanitizeStructure({ columns: [{ title: 'A', size: 2 }] })).toEqual({
      columns: [{ title: 'A', size: 2 }],
    });
  });

  it('refuses anything that is not a column list', () => {
    expect(sanitizeStructure(null)).toBeNull();
    expect(sanitizeStructure({})).toBeNull();
    expect(sanitizeStructure({ columns: 'nope' })).toBeNull();
    expect(sanitizeStructure({ columns: [{ title: 'A', size: -1 }] })).toBeNull();
    expect(sanitizeStructure({ columns: [{ title: 'A', size: 1.5 }] })).toBeNull();
  });

  it('fills in a missing title rather than dropping the column', () => {
    expect(sanitizeStructure({ columns: [{ size: 3 }] })).toEqual({
      columns: [{ title: '', size: 3 }],
    });
  });
});

describe('addColumnAfter', () => {
  it('puts an empty chapter right after the one it was asked for', () => {
    const next = addColumnAfter(deck(), 0, 'New');
    expect(next.map((c) => c.title)).toEqual(['Cover', 'New', 'Chapter 1', 'Chapter 2']);
    expect(next[1].size).toBe(0);
  });

  it('leaves the page count alone', () => {
    const before = deck();
    const next = addColumnAfter(before, 2, 'New');
    expect(next.reduce((sum, c) => sum + c.size, 0)).toBe(16);
    expect(before).toHaveLength(3);
  });
});

describe('deleteColumnAt', () => {
  it('folds the pages of a removed chapter into the one before it', () => {
    expect(deleteColumnAt(deck(), 1)?.map((c) => c.size)).toEqual([8, 8]);
  });

  it('folds its pages into the next chapter when it is the first one', () => {
    const next = deleteColumnAt(deck(), 0);
    expect(next?.map((c) => c.size)).toEqual([8, 8]);
    expect(next?.[0].title).toBe('Chapter 1');
  });

  it('refuses to remove the only chapter left', () => {
    expect(deleteColumnAt([{ title: 'All', size: 4 }], 0)).toBeNull();
    expect(deleteColumnAt(deck(), 9)).toBeNull();
  });
});

describe('moving a whole chapter', () => {
  it('carries its pages with it and renumbers the deck', () => {
    const columns = [
      { title: 'A', size: 2 },
      { title: 'B', size: 3 },
      { title: 'C', size: 2 },
    ];
    expect(moveColumnBlock(columns, 0, 2)?.map((c) => c.title)).toEqual(['B', 'C', 'A']);
    expect(orderAfterColumnMove(columns, 0, 2)).toEqual([2, 3, 4, 5, 6, 0, 1]);
    expect(orderAfterColumnMove(columns, 2, 0)).toEqual([5, 6, 0, 1, 2, 3, 4]);
  });

  it('is a permutation of every page, losing none', () => {
    const order = orderAfterColumnMove(deck(), 1, 0);
    expect([...order].sort((a, b) => a - b)).toEqual([...Array(16).keys()]);
  });

  it('does nothing when the chapter stays where it is', () => {
    expect(moveColumnBlock(deck(), 1, 1)).toBeNull();
    expect(orderAfterColumnMove(deck(), 1, 1)).toEqual([...Array(16).keys()]);
  });
});

describe('columnsAfterMoveMany', () => {
  it('moves several pages across one boundary at once', () => {
    const columns = [
      { title: 'A', size: 3 },
      { title: 'B', size: 3 },
    ];
    expect(columnsAfterMoveMany(columns, [0, 1], 4).map((c) => c.size)).toEqual([1, 5]);
  });

  it('leaves a column unchanged when it both gives and takes a page', () => {
    const columns = [
      { title: 'A', size: 3 },
      { title: 'B', size: 3 },
    ];
    expect(columnsAfterMoveMany(columns, [1], 4).map((c) => c.size)).toEqual([2, 4]);
    expect(columnsAfterMoveMany(columns, [2], 4).map((c) => c.size)).toEqual([2, 4]);
  });

  it('takes pages from two chapters into a third', () => {
    const columns = [
      { title: 'A', size: 2 },
      { title: 'B', size: 2 },
      { title: 'C', size: 2 },
    ];
    expect(columnsAfterMoveMany(columns, [0, 3], 5).map((c) => c.size)).toEqual([1, 1, 4]);
  });
});

describe('insertPageColumn', () => {
  it('drops a card into a chapter of its own between two chapters', () => {
    const columns = [
      { title: 'A', size: 2 },
      { title: 'B', size: 3 },
    ];
    const result = insertPageColumn(columns, 3, 1, 'New');
    expect(result?.columns.map((c) => [c.title, c.size])).toEqual([
      ['A', 2],
      ['New', 1],
      ['B', 2],
    ]);
    expect(result?.order).toEqual([0, 1, 3, 2, 4]);
  });

  it('removes the chapter its only card came from', () => {
    const columns = [
      { title: 'A', size: 1 },
      { title: 'B', size: 2 },
    ];
    const result = insertPageColumn(columns, 0, 1, 'New');
    expect(result?.columns.map((c) => [c.title, c.size])).toEqual([
      ['New', 1],
      ['B', 2],
    ]);
    expect(result?.order).toEqual([0, 1, 2]);
  });

  it('moves a card backwards through the deck as well as forwards', () => {
    const columns = [
      { title: 'A', size: 2 },
      { title: 'B', size: 2 },
      { title: 'C', size: 2 },
    ];
    const result = insertPageColumn(columns, 5, 1, 'New');
    expect(result?.columns.map((c) => [c.title, c.size])).toEqual([
      ['A', 2],
      ['New', 1],
      ['B', 2],
      ['C', 1],
    ]);
    expect(result?.order).toEqual([0, 1, 5, 2, 3, 4]);
  });

  it('refuses a boundary that is not between two chapters', () => {
    const columns = [
      { title: 'A', size: 2 },
      { title: 'B', size: 2 },
    ];
    expect(insertPageColumn(columns, 0, 0, 'New')).toBeNull();
    expect(insertPageColumn(columns, 0, 2, 'New')).toBeNull();
    expect(insertPageColumn(columns, 99, 1, 'New')).toBeNull();
  });
});

describe('column bookkeeping for batch edits', () => {
  const columns = [
    { title: 'A', size: 2 },
    { title: 'B', size: 3 },
    { title: 'C', size: 2 },
  ];

  it('takes one page off the chapter that held each removed page', () => {
    expect(columnsAfterRemove(columns, [0, 4, 5]).map((c) => c.size)).toEqual([1, 2, 1]);
  });

  it('empties a chapter whose pages all went, rather than borrowing a neighbour', () => {
    expect(columnsAfterRemove(columns, [0, 1]).map((c) => c.size)).toEqual([0, 3, 2]);
  });

  it('adds each new page to the chapter it was added beside', () => {
    expect(columnsAfterInsert(columns, [0, 6]).map((c) => c.size)).toEqual([3, 3, 3]);
  });

  it('cannot put an emptied chapter back from positions alone, which is why undo replays the saved list', () => {
    const removed = columnsAfterRemove(columns, [0, 1]);
    expect(columnsAfterInsert(removed, [0, 1])).not.toEqual(columns);
  });
});

describe('columnsAfterApply', () => {
  const before = [
    { title: 'Opening', keys: ['a', 'b'] },
    { title: 'Middle', keys: ['c'] },
    { title: 'End', keys: ['d'] },
  ];

  it('keeps a page the apply created right after another page in that page’s chapter', () => {
    expect(columnsAfterApply(before, ['a', 'a2', 'b', 'c', 'd'])).toEqual([
      { title: 'Opening', size: 3 },
      { title: 'Middle', size: 1 },
      { title: 'End', size: 1 },
    ]);
  });

  it('takes a merged page out of the chapter that held it', () => {
    expect(columnsAfterApply(before, ['a', 'c', 'd'])).toEqual([
      { title: 'Opening', size: 1 },
      { title: 'Middle', size: 1 },
      { title: 'End', size: 1 },
    ]);
  });

  it('gives a page added at the very front the chapter of the page behind it', () => {
    expect(columnsAfterApply(before, ['new', 'a', 'b', 'c', 'd']).map((c) => c.size)).toEqual([
      3, 1, 1,
    ]);
  });

  it('keeps a chapter that lost every page, with its title', () => {
    expect(columnsAfterApply(before, ['a', 'b', 'd'])).toEqual([
      { title: 'Opening', size: 2 },
      { title: 'Middle', size: 0 },
      { title: 'End', size: 1 },
    ]);
  });

  it('sends every new page to the chapter named, even one that is still empty', () => {
    const columns = [...before.slice(0, 2), { title: 'End', keys: [] }];
    expect(columnsAfterApply(columns, ['a', 'b', 'c', 'n1', 'n2'], 2)).toEqual([
      { title: 'Opening', size: 2 },
      { title: 'Middle', size: 1 },
      { title: 'End', size: 2 },
    ]);
  });

  it('falls back to the deck’s new length when no page can be matched', () => {
    expect(columnsAfterApply(before, ['x', 'y'])).toEqual([{ title: 'Opening', size: 2 }]);
  });
});

describe('chapterProgress', () => {
  it('counts an empty chapter as nothing at all', () => {
    expect(chapterProgress({}, [])).toEqual({ done: 0, review: 0, total: 0 });
  });

  it('counts every page when the chapter is finished', () => {
    const cards = { A: { status: 'done' }, B: { status: 'done' } } as const;
    expect(chapterProgress(cards, ['A', 'B'])).toEqual({ done: 2, review: 0, total: 2 });
  });

  it('separates what is done from what is waiting to be looked over', () => {
    const cards = {
      A: { status: 'done' },
      B: { status: 'review' },
      C: { status: 'doing' },
    } as const;
    expect(chapterProgress(cards, ['A', 'B', 'C'])).toEqual({ done: 1, review: 1, total: 3 });
  });

  it('does not count a page with no status as done', () => {
    const cards = { A: { status: 'done' }, B: { memo: 'still open' } } as const;
    expect(chapterProgress(cards, ['A', 'B', 'C'])).toEqual({ done: 1, review: 0, total: 3 });
  });
});
