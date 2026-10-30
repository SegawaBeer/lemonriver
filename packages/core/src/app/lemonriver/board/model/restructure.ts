import type { BlockKind } from '../blocks/classify.ts';

/** A block the user picked to move onto a page of its own. */
export type SplitBlock = { id: string; kind: BlockKind; text: string };

/**
 * A page the board is about to break up or put together. Like a block move it
 * is only written down here; the deck changes when the list is applied.
 *
 * A split keeps the words of its blocks beside their ids: the prompt that the
 * server writes names them ("move the title …"), and only the browser can read
 * them off the page.
 */
export type Restructure =
  | {
      kind: 'split';
      page: string;
      blocks: string[];
      /** One per entry of `blocks`, or absent on a record from an older board. */
      blockInfo?: SplitBlock[];
    }
  | { kind: 'merge'; pages: [string, string] };

const MAX_RESTRUCTURES = 50;
const MAX_BLOCKS = 40;

const pagesOf = (entry: Restructure): string[] =>
  entry.kind === 'split' ? [entry.page] : entry.pages;

/** Whether a page is already spoken for by a record of the other kind. */
function overlapsOtherKind(list: Restructure[], entry: Restructure): boolean {
  const pages = new Set(pagesOf(entry));
  return list.some(
    (item) => item.kind !== entry.kind && pagesOf(item).some((page) => pages.has(page)),
  );
}

/**
 * The blocks of `page` that go onto a new page after it. Rows can be dragged
 * around after the fact, so the same page split again replaces the last one.
 */
export function addSplit(list: Restructure[], page: string, picked: SplitBlock[]): Restructure[] {
  const seen = new Set<string>();
  const kept = picked.filter((block) => block.id && !seen.has(block.id) && seen.add(block.id));
  if (!page || kept.length === 0) return list;
  const limited = kept.slice(0, MAX_BLOCKS);
  const others = list.filter((item) => !pagesOf(item).includes(page));
  return [
    ...others,
    {
      kind: 'split',
      page,
      blocks: limited.map((block) => block.id),
      blockInfo: limited.map((block) => ({ id: block.id, kind: block.kind, text: block.text })),
    },
  ];
}

/** Two pages becoming one, at the place of the earlier of them. */
export function addMerge(list: Restructure[], a: string, b: string): Restructure[] {
  if (!a || !b || a === b) return list;
  const pages = new Set([a, b]);
  const others = list.filter((item) => !pagesOf(item).some((page) => pages.has(page)));
  return [...others, { kind: 'merge', pages: [a, b] }];
}

export function removeRestructure(list: Restructure[], index: number): Restructure[] {
  return list.filter((_, at) => at !== index);
}

/** True when recording `entry` would take the place of what is already there. */
export function restructureReplaced(list: Restructure[], entry: Restructure): boolean {
  return overlapsOtherKind(list, entry);
}

/** Every page a split or a merge touches, for the card's own count. */
export function restructuredPages(list: Restructure[]): Set<string> {
  const pages = new Set<string>();
  for (const entry of list) for (const page of pagesOf(entry)) pages.add(page);
  return pages;
}

/**
 * Follows a page operation the board made: keys are renamed the way cards are,
 * and a split or merge whose page is gone is dropped.
 */
export function carryRestructures(
  list: Restructure[],
  before: string[],
  after: string[],
  origin: number[],
): Restructure[] {
  const rename = new Map<string, string>();
  const created = new Set<string>();
  origin.forEach((from, i) => {
    if (from >= 0 && from < before.length) rename.set(before[from], after[i]);
    else created.add(after[i]);
  });
  const live = new Set(before);
  const resolve = (key: string): string | null => {
    const next = live.has(key) ? (rename.get(key) ?? null) : key;
    return next !== null && !created.has(next) ? next : null;
  };

  const kept: Restructure[] = [];
  for (const entry of list) {
    if (entry.kind === 'split') {
      const page = resolve(entry.page);
      if (page !== null) kept.push({ ...entry, page });
      continue;
    }
    const [first, second] = entry.pages;
    const a = resolve(first);
    const b = resolve(second);
    if (a !== null && b !== null) kept.push({ kind: 'merge', pages: [a, b] });
  }
  return kept;
}

const KINDS = new Set<BlockKind>(['title', 'point', 'text', 'image', 'chart', 'quote', 'number']);

function cleanSplit(raw: Record<string, unknown>): Restructure | null {
  if (typeof raw.page !== 'string' || !raw.page) return null;
  if (!Array.isArray(raw.blocks)) return null;
  const source = Array.isArray(raw.blockInfo) ? raw.blockInfo : [];
  const seen = new Set<string>();
  const blocks: string[] = [];
  const blockInfo: SplitBlock[] = [];
  for (const [at, block] of raw.blocks.entries()) {
    if (blocks.length >= MAX_BLOCKS) break;
    if (typeof block !== 'string' || !block || seen.has(block)) continue;
    seen.add(block);
    blocks.push(block);
    const info = (source[at] ?? null) as Record<string, unknown> | null;
    const kind = info && typeof info.kind === 'string' ? (info.kind as BlockKind) : null;
    const text = info && typeof info.text === 'string' ? info.text : '';
    blockInfo.push({
      id: block,
      kind: kind && KINDS.has(kind) ? kind : 'text',
      text: text.slice(0, 80),
    });
  }
  if (blocks.length === 0) return null;
  return { kind: 'split', page: raw.page, blocks, blockInfo };
}

function cleanEntry(raw: unknown): Restructure | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  if (item.kind === 'split') return cleanSplit(item);
  if (item.kind === 'merge') {
    if (!Array.isArray(item.pages) || item.pages.length !== 2) return null;
    const [a, b] = item.pages;
    if (typeof a !== 'string' || typeof b !== 'string' || !a || !b || a === b) return null;
    return { kind: 'merge', pages: [a, b] };
  }
  return null;
}

export function sanitizeRestructures(raw: unknown): Restructure[] {
  if (!Array.isArray(raw)) return [];
  const list: Restructure[] = [];
  for (const value of raw) {
    if (list.length >= MAX_RESTRUCTURES) break;
    const entry = cleanEntry(value);
    if (entry) list.push(entry);
  }
  return list;
}
