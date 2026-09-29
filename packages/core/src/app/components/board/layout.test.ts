import { describe, expect, it } from 'vitest';
import type { Page } from '../../lib/sdk';
import { CARD_H, CARD_W, layoutBoard, orderAfterMove, seedColumns, slotAtPoint } from './layout';

/** Pages are identified by their component name, so the fixtures need real names. */
function named(name: string): Page {
  const page = () => null;
  Object.defineProperty(page, 'name', { value: name });
  return page as unknown as Page;
}

const title = (n: number) => `Part ${n}`;
const sizes = (pages: Page[]) => seedColumns(pages, title).map((c) => c.size);

describe('seedColumns', () => {
  it('starts a column at every chapter page', () => {
    const pages = ['Cover', 'Agenda', 'ChapterOne', 'Alpha', 'ChapterTwo', 'Beta'].map(named);
    expect(seedColumns(pages, title)).toEqual([
      { title: 'Cover', size: 2 },
      { title: 'Chapter One', size: 2 },
      { title: 'Chapter Two', size: 2 },
    ]);
  });

  it('ignores a chapter page in the first slot so the deck never opens with an empty column', () => {
    expect(sizes(['ChapterOne', 'Alpha', 'ChapterTwo'].map(named))).toEqual([2, 1]);
  });

  it('falls back to fixed-length columns when no page declares a chapter', () => {
    const pages = Array.from({ length: 14 }, (_, i) => named(`Page${i}`));
    expect(sizes(pages)).toEqual([6, 6, 2]);
    expect(seedColumns(pages, title).map((c) => c.title)).toEqual(['Part 1', 'Part 2', 'Part 3']);
  });

  it('reads the column title off the names real decks use', () => {
    const pages = [named('P1Cover'), named('PChapter1'), named('P16ScenarioTable')];
    expect(seedColumns(pages, title).map((c) => c.title)).toEqual(['Cover', 'Chapter 1']);
  });

  it('falls back to the positional title when the chapter page name carries no words', () => {
    const pages = [named('Cover'), named('章'), named('Alpha')];
    expect(seedColumns(pages, title)[1].title).toBe('Part 2');
  });
});

describe('layoutBoard', () => {
  const columns = [
    { title: 'Cover', size: 2 },
    { title: 'Chapter One', size: 3 },
  ];

  it('stacks a column top to bottom and puts the next column to the right', () => {
    const { slots } = layoutBoard(columns);
    expect(slots.map((s) => s.column)).toEqual([0, 0, 1, 1, 1]);
    expect(slots[0].x).toBe(slots[1].x);
    expect(slots[1].y).toBeGreaterThan(slots[0].y);
    expect(slots[2].x).toBeGreaterThan(slots[0].x);
  });

  it('numbers slots by deck position, so column two continues where column one ended', () => {
    expect(layoutBoard(columns).slots.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps a column that has been emptied, so its title survives', () => {
    const laid = layoutBoard([
      { title: 'Cover', size: 0 },
      { title: 'Chapter One', size: 2 },
    ]);
    expect(laid.columns.map((c) => c.size)).toEqual([0, 2]);
    expect(laid.slots).toHaveLength(2);
    expect(laid.slots[0].column).toBe(1);
  });

  it('keeps the card box in the slide aspect ratio', () => {
    expect(CARD_H).toBeCloseTo((CARD_W * 1080) / 1920);
  });
});

describe('slotAtPoint', () => {
  const layout = layoutBoard([
    { title: 'Cover', size: 2 },
    { title: 'Chapter One', size: 2 },
  ]);

  it('resolves a drop on top of a slot to that slot', () => {
    const target = layout.slots[2];
    expect(slotAtPoint(layout, target.x, target.y, 0)).toBe(2);
  });

  it('snaps a drop between two slots to the nearer one', () => {
    const [a, b] = [layout.slots[0], layout.slots[1]];
    expect(slotAtPoint(layout, a.x, a.y + (b.y - a.y) * 0.4, 3)).toBe(0);
    expect(slotAtPoint(layout, a.x, a.y + (b.y - a.y) * 0.6, 3)).toBe(1);
  });

  it('keeps a drop far outside the layout on the closest edge slot', () => {
    expect(slotAtPoint(layout, -5000, -5000, 3)).toBe(0);
    const last = layout.slots[layout.slots.length - 1];
    expect(slotAtPoint(layout, last.x + 5000, last.y + 5000, 0)).toBe(3);
  });
});

describe('orderAfterMove', () => {
  it('lifts the page out and drops it at the target position', () => {
    expect(orderAfterMove(5, 0, 3)).toEqual([1, 2, 3, 0, 4]);
    expect(orderAfterMove(5, 4, 1)).toEqual([0, 4, 1, 2, 3]);
    expect(orderAfterMove(5, 2, 2)).toEqual([0, 1, 2, 3, 4]);
  });
});
