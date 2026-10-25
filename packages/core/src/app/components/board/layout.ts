import type { BoardColumn } from '../../../files/board-structure';
import type { Page } from '../../lib/sdk';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../lib/sdk';

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
};
export type BoardLayout = { slots: Slot[]; columns: LaidColumn[]; width: number; height: number };

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
export function layoutBoard(columns: BoardColumn[]): BoardLayout {
  const slots: Slot[] = [];
  const laid: LaidColumn[] = [];
  let position = 0;
  let tallest = 0;

  columns.forEach((column, index) => {
    const x = index * (CARD_BOX_W + COL_GAP);
    laid.push({
      title: column.title,
      size: column.size,
      x,
      y: 0,
      from: position,
      to: position + column.size - 1,
    });
    for (let row = 0; row < column.size; row++) {
      slots.push({ index: position, x, y: HEADER_H + row * (CARD_BOX_H + ROW_GAP), column: index });
      position += 1;
    }
    const height = HEADER_H + column.size * (CARD_BOX_H + ROW_GAP);
    if (height > tallest) tallest = height;
  });

  return {
    slots,
    columns: laid,
    width: columns.length * (CARD_BOX_W + COL_GAP),
    height: tallest,
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

/** Deck position of the card under a point, or null over empty canvas. */
export function cardAtPoint(layout: BoardLayout, x: number, y: number): number | null {
  for (const slot of layout.slots) {
    if (x >= slot.x && x <= slot.x + CARD_BOX_W && y >= slot.y && y <= slot.y + CARD_BOX_H) {
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
