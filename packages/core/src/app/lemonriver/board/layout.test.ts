import { describe, expect, it } from 'vitest';
import type { Page } from '../../lib/sdk';
import {
  CARD_BOX_H,
  CARD_BOX_W,
  CARD_H,
  CARD_W,
  cardAtPoint,
  cardMetrics,
  gapAtPoint,
  layoutBoard,
  linkCurve,
  NOTE_H,
  orderAfterMove,
  orderAfterMoveMany,
  seedColumns,
  slotAtPoint,
} from './layout';

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

describe('cardAtPoint', () => {
  const layout = layoutBoard([
    { title: 'Cover', size: 2 },
    { title: 'Chapter One', size: 2 },
  ]);

  it('finds the card under a point anywhere inside it', () => {
    const slot = layout.slots[3];
    expect(cardAtPoint(layout, slot.x + CARD_BOX_W - 1, slot.y + CARD_BOX_H - 1)).toBe(3);
  });

  it('reports empty canvas between cards as no card', () => {
    const [a, b] = [layout.slots[0], layout.slots[1]];
    expect(cardAtPoint(layout, a.x + 10, (a.y + CARD_BOX_H + b.y) / 2)).toBeNull();
    expect(cardAtPoint(layout, a.x + CARD_BOX_W + 20, a.y + 10)).toBeNull();
  });
});

describe('linkCurve', () => {
  const box = (x: number, y: number) => ({ x, y, width: 100, height: 60 });

  it('bows a link between cards in one column out to the right of the column', () => {
    const curve = linkCurve(box(0, 0), box(0, 400));
    expect(curve.x).toBeGreaterThan(100);
    expect(curve.path.startsWith('M 100,18')).toBe(true);
  });

  it('never ends where the main line does, at the middle of a card side', () => {
    const curve = linkCurve(box(0, 0), box(300, 0));
    expect(curve.path).not.toContain(',30');
  });

  it('joins cards in different columns between their facing sides, whichever is first', () => {
    const forward = linkCurve(box(0, 0), box(300, 200));
    const backward = linkCurve(box(300, 200), box(0, 0));
    expect(forward.path).toBe(backward.path);
    expect(forward.path.startsWith('M 100,18')).toBe(true);
    expect(forward.path.endsWith('300,218')).toBe(true);
  });
});

describe('card sizes', () => {
  it('keeps the large card at the preview size it has always had', () => {
    expect(cardMetrics('large')).toMatchObject({ cardW: CARD_W, cardH: CARD_H, noteH: NOTE_H });
  });

  it('halves the preview at small, and drops the strips that need the room', () => {
    expect(cardMetrics('small').cardW).toBe(CARD_W / 2);
    expect(cardMetrics('small').cardH).toBeCloseTo(CARD_H / 2);
    expect(cardMetrics('small').memoH).toBe(0);
  });

  it('draws no preview at all when only the title is shown', () => {
    expect(cardMetrics('title').cardH).toBe(0);
    expect(cardMetrics('title').boxH).toBeLessThan(cardMetrics('small').boxH);
  });

  it('lays the same structure out with the metrics of the chosen size', () => {
    const columns = [{ title: 'A', size: 2 }];
    expect(layoutBoard(columns, { size: 'small' }).metrics.cardW).toBe(CARD_W / 2);
    expect(layoutBoard(columns).metrics.cardW).toBe(CARD_W);
  });
});

describe('folded chapters', () => {
  const columns = [
    { title: 'A', size: 2 },
    { title: 'B', size: 3 },
  ];

  it('draws no cards for a folded chapter but keeps its pages numbered', () => {
    const layout = layoutBoard(columns, { collapsed: [false, true] });
    expect(layout.slots.map((s) => s.index)).toEqual([0, 1]);
    expect(layout.columns[1].collapsed).toBe(true);
  });

  it('keeps the folded chapter label in place while its cards are gone', () => {
    const open = layoutBoard(columns);
    const folded = layoutBoard(columns, { collapsed: [true, false] });
    expect(folded.columns[0].x).toBe(open.columns[0].x);
    expect(folded.columns[0].size).toBe(2);
    expect(folded.slots.map((s) => s.index)).toEqual([2, 3, 4]);
  });
});

describe('gapAtPoint', () => {
  const layout = layoutBoard([
    { title: 'A', size: 2 },
    { title: 'B', size: 2 },
  ]);

  it('names the boundary a point between two chapters sits on', () => {
    const right = layout.columns[0].x + layout.columns[0].boxW;
    expect(gapAtPoint(layout, right + 10, 100)).toBe(1);
  });

  it('reports no boundary over a column or past the last one', () => {
    expect(gapAtPoint(layout, layout.columns[0].x + 20, 100)).toBeNull();
    expect(gapAtPoint(layout, layout.columns[1].x + 400, 100)).toBeNull();
  });
});

describe('orderAfterMoveMany', () => {
  it('carries the picked cards as one block, in deck order', () => {
    expect(orderAfterMoveMany(5, [3, 1], 0)).toEqual([1, 3, 0, 2, 4]);
  });

  it('lands the block where the last card was dropped', () => {
    expect(orderAfterMoveMany(6, [0, 1], 4)).toEqual([2, 3, 0, 1, 4, 5]);
    expect(orderAfterMoveMany(6, [4, 5], 1)).toEqual([0, 4, 5, 1, 2, 3]);
  });

  it('keeps every page exactly once', () => {
    const order = orderAfterMoveMany(7, [2, 5, 6], 1);
    expect([...order].sort((a, b) => a - b)).toEqual([...Array(7).keys()]);
  });
});
