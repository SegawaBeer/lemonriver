import { describe, expect, it } from 'vitest';
import {
  type BoardColumn,
  columnOfPosition,
  columnsAfterMove,
  reconcileColumns,
  sanitizeStructure,
} from './board-structure.ts';

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
