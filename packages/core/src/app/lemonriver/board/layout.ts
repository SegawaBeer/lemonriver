import type { Page } from '../../lib/sdk';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../lib/sdk';
import type { BoardColumn } from './model/structure';

/** 1/4 of the authoring canvas, so a preview scales by exactly 0.25. */
export const CARD_W = 480;
export const CARD_H = (CARD_W * CANVAS_HEIGHT) / CANVAS_WIDTH;
/** Height of the card's speaker-note strip. */
export const NOTE_H = 52;
/** Height of the card's work-memo strip. */
export const MEMO_H = 40;
/** Card box = preview plus the card's padding, title row, note strip and memo strip. */
export const CARD_BOX_W = CARD_W + 12;
export const CARD_BOX_H = CARD_H + 60 + NOTE_H + MEMO_H;

/** How much of a page a card shows. `title` is a single row, for reading a long deck. */
export type CardSize = 'large' | 'small' | 'title';
export const CARD_SIZES: readonly CardSize[] = ['large', 'small', 'title'];

export type CardMetrics = {
  cardW: number;
  cardH: number;
  /** Height of the speaker-note strip; 0 hides it. */
  noteH: number;
  /** Height of the work-memo strip; 0 hides it. */
  memoH: number;
  boxW: number;
  boxH: number;
};

const METRICS: Record<CardSize, CardMetrics> = {
  large: {
    cardW: CARD_W,
    cardH: CARD_H,
    noteH: NOTE_H,
    memoH: MEMO_H,
    boxW: CARD_BOX_W,
    boxH: CARD_BOX_H,
  },
  small: {
    cardW: 240,
    cardH: (240 * CANVAS_HEIGHT) / CANVAS_WIDTH,
    noteH: 0,
    memoH: 0,
    boxW: 252,
    boxH: 179,
  },
  title: { cardW: 340, cardH: 0, noteH: 0, memoH: 0, boxW: 352, boxH: 40 },
};

export function cardMetrics(size: CardSize = 'large'): CardMetrics {
  return METRICS[size] ?? METRICS.large;
}

/** Gap between columns, and between cards inside a column. */
const COL_GAP = 88;
const ROW_GAP = 52;
/** Room above the first card for the column's label. */
const HEADER_H = 48;
/** Seeded columns fall back to this length when a deck declares no chapters. */
const FALLBACK_COLUMN = 6;

export type Slot = { index: number; x: number; y: number; column: number };
export type LaidColumn = {
  title: string;
  size: number;
  x: number;
  y: number;
  from: number;
  to: number;
  /** Column width at the current card size; the gap between columns starts after it. */
  boxW: number;
  collapsed: boolean;
};
export type BoardLayout = {
  slots: Slot[];
  columns: LaidColumn[];
  width: number;
  height: number;
  metrics: CardMetrics;
};

export type BoardView = { size?: CardSize; collapsed?: boolean[] };

const CHAPTER_NAME = /chapter|section|章/i;

function pageName(page: Page): string {
  const fn = page as unknown as { displayName?: string; name?: string };
  return fn.displayName ?? fn.name ?? '';
}

function chapterTitle(page: Page, column: number, fallback: (index: number) => string): string {
  const cleaned = pageName(page)
    .replace(/^P\d*(?=[A-Z])/, '')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .trim();
  return cleaned.length > 1 ? cleaned : fallback(column + 1);
}

function rangeStarts(total: number, step: number): number[] {
  const starts: number[] = [];
  for (let i = step; i < total; i += step) starts.push(i);
  return starts;
}

/**
 * The structure a deck starts with, read once from the page names the author
 * already wrote. From then on the board owns its columns, so moving a chapter
 * page is just one card moving — the pages it used to head keep their column.
 */
export function seedColumns(pages: Page[], columnTitle: (index: number) => string): BoardColumn[] {
  if (pages.length === 0) return [];
  const chapters = pages.flatMap((page, i) =>
    i > 0 && CHAPTER_NAME.test(pageName(page)) ? [i] : [],
  );
  const named = chapters.length > 0;
  const starts = named ? [0, ...chapters] : [0, ...rangeStarts(pages.length, FALLBACK_COLUMN)];

  return starts.map((from, column) => {
    const to = column + 1 < starts.length ? starts[column + 1] - 1 : pages.length - 1;
    return {
      title: named ? chapterTitle(pages[from], column, columnTitle) : columnTitle(column + 1),
      size: to - from + 1,
    };
  });
}

/** Geometry for a structure: columns left to right, pages top to bottom. */
export function layoutBoard(columns: BoardColumn[], view: BoardView = {}): BoardLayout {
  const metrics = cardMetrics(view.size);
  const collapsed = view.collapsed ?? [];
  const slots: Slot[] = [];
  const laid: LaidColumn[] = [];
  let position = 0;
  let tallest = 0;
  let x = 0;

  columns.forEach((column, index) => {
    const folded = collapsed[index] === true;
    laid.push({
      title: column.title,
      size: column.size,
      x,
      y: 0,
      from: position,
      to: position + column.size - 1,
      boxW: metrics.boxW,
      collapsed: folded,
    });
    // A folded chapter keeps its pages' positions but draws no cards, so the
    // columns after it close up instead of leaving a long empty lane.
    if (!folded) {
      for (let row = 0; row < column.size; row++) {
        slots.push({
          index: position + row,
          x,
          y: HEADER_H + row * (metrics.boxH + ROW_GAP),
          column: index,
        });
      }
      const height = HEADER_H + column.size * (metrics.boxH + ROW_GAP);
      if (height > tallest) tallest = height;
    }
    position += column.size;
    x += metrics.boxW + COL_GAP;
  });

  return {
    slots,
    columns: laid,
    width: x,
    height: tallest,
    metrics,
  };
}

/** Index of the slot a dropped card should take, ignoring the card's own slot. */
export function slotAtPoint(layout: BoardLayout, x: number, y: number, dragged: number): number {
  let best = dragged;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const slot of layout.slots) {
    const dx = slot.x - x;
    const dy = slot.y - y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = slot.index;
    }
  }
  return best;
}

/**
 * The chapter boundary a point falls on, expressed as the number of chapters to
 * its left, or null when the point is over a column rather than between two.
 */
export function gapAtPoint(layout: BoardLayout, x: number, y: number): number | null {
  if (y < -HEADER_H || y > Math.max(layout.height, HEADER_H) + 80) return null;
  for (let i = 0; i + 1 < layout.columns.length; i++) {
    const right = layout.columns[i].x + layout.columns[i].boxW;
    const left = layout.columns[i + 1].x;
    if (x > right && x < left) return i + 1;
  }
  return null;
}

/** Deck position of the card under a point, or null over empty canvas. */
export function cardAtPoint(layout: BoardLayout, x: number, y: number): number | null {
  for (const slot of layout.slots) {
    if (
      x >= slot.x &&
      x <= slot.x + layout.metrics.boxW &&
      y >= slot.y &&
      y <= slot.y + layout.metrics.boxH
    ) {
      return slot.index;
    }
  }
  return null;
}

export type Box = { x: number; y: number; width: number; height: number };

const LINK_ANCHOR = 0.3;

/**
 * A link's curve and the point its remove button sits on. Cards in one column
 * are joined by an arc bowing into the gap on their right, which the main line
 * never uses; cards in different columns by a curve between their facing sides.
 */
export function linkCurve(a: Box, b: Box): { path: string; x: number; y: number } {
  // The main line enters and leaves a card at its vertical middle; links attach
  // higher up so the two never share an end.
  const ay = a.y + a.height * LINK_ANCHOR;
  const by = b.y + b.height * LINK_ANCHOR;
  if (Math.abs(a.x - b.x) < a.width / 2) {
    const sx = a.x + a.width;
    const tx = b.x + b.width;
    // Stays inside the gap between columns, so the arc never slips behind the next column.
    const bow = 56 + Math.min(Math.abs(by - ay) / 8, 36);
    return {
      path: `M ${sx},${ay} C ${sx + bow},${ay} ${tx + bow},${by} ${tx},${by}`,
      x: (sx + tx) / 2 + 0.75 * bow,
      y: (ay + by) / 2,
    };
  }
  const [left, right, ly, ry] = a.x < b.x ? [a, b, ay, by] : [b, a, by, ay];
  const sx = left.x + left.width;
  const tx = right.x;
  const reach = Math.max((tx - sx) / 2, 40);
  return {
    path: `M ${sx},${ly} C ${sx + reach},${ly} ${tx - reach},${ry} ${tx},${ry}`,
    x: (sx + tx) / 2,
    y: (ly + ry) / 2,
  };
}

export const identityOrder = (total: number) => Array.from({ length: total }, (_, i) => i);

/** The deck's order once the card at `from` lands on `to`, as original page indexes. */
export function orderAfterMove(total: number, from: number, to: number): number[] {
  const order = identityOrder(total);
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  return order;
}

/**
 * The deck's order once several cards move together: they travel as one block
 * and keep their order among themselves, whatever order they were picked in.
 */
export function orderAfterMoveMany(total: number, moving: number[], to: number): number[] {
  const lifted = [...new Set(moving)].sort((a, b) => a - b);
  if (lifted.length === 0) return identityOrder(total);
  const staying = identityOrder(total).filter((index) => !lifted.includes(index));
  const before = lifted.filter((index) => index < to).length;
  const at = Math.max(0, Math.min(staying.length, to - before));
  return [...staying.slice(0, at), ...lifted, ...staying.slice(at)];
}
