export const CARD_STATUSES = ['todo', 'doing', 'review', 'done'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

/** What the board knows about a page that the deck never sees. */
export type BoardCard = { title?: string; status?: CardStatus; memo?: string };
export type BoardCards = Record<string, BoardCard>;
/** No direction, and no say in the deck's order. */
export type BoardLink = { a: string; b: string };
export type CardState = { cards: BoardCards; links: BoardLink[] };
/** `null` or an empty string clears a field. */
export type CardPatch = { title?: string | null; status?: CardStatus | null; memo?: string | null };

const TITLE_MAX = 80;
const MEMO_MAX = 2000;
const PENDING = '\u0000pending:';
/** Holds a blank page's slot until the deck reloads with the name the server gave it. */
const BLANK_ENTRY = '\u0000blank';

/** A key that names a page for good, so the board may store data under it. */
export const isSettledKey = (key: string) => !key.startsWith(PENDING);

export function isCardStatus(value: unknown): value is CardStatus {
  return typeof value === 'string' && (CARD_STATUSES as readonly string[]).includes(value);
}

function cleanCard(raw: unknown): BoardCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const { title, status, memo } = raw as Record<string, unknown>;
  const card: BoardCard = {};
  if (typeof title === 'string' && title.trim()) card.title = title.trim().slice(0, TITLE_MAX);
  if (isCardStatus(status)) card.status = status;
  if (typeof memo === 'string' && memo.trim()) card.memo = memo.trim().slice(0, MEMO_MAX);
  return Object.keys(card).length > 0 ? card : null;
}

export function sanitizeCards(raw: unknown): BoardCards {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const cards: BoardCards = {};
  for (const [key, value] of Object.entries(raw)) {
    const card = cleanCard(value);
    if (key && card) cards[key] = card;
  }
  return cards;
}

const sameLink = (link: BoardLink, a: string, b: string) =>
  (link.a === a && link.b === b) || (link.a === b && link.b === a);

export function linkCards(links: BoardLink[], a: string, b: string): BoardLink[] {
  if (!a || !b || a === b || links.some((link) => sameLink(link, a, b))) return links;
  return [...links, { a, b }];
}

export function unlinkCards(links: BoardLink[], a: string, b: string): BoardLink[] {
  const kept = links.filter((link) => !sameLink(link, a, b));
  return kept.length === links.length ? links : kept;
}

export function sanitizeLinks(raw: unknown): BoardLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.reduce<BoardLink[]>((links, item) => {
    const { a, b } = (item ?? {}) as { a?: unknown; b?: unknown };
    return typeof a === 'string' && typeof b === 'string' ? linkCards(links, a, b) : links;
  }, []);
}

export function patchCard(cards: BoardCards, key: string, patch: CardPatch): BoardCards {
  const merged: Record<string, unknown> = { ...cards[key] };
  for (const field of ['title', 'status', 'memo'] as const) {
    if (!(field in patch)) continue;
    const value = patch[field];
    if (value == null || value === '') delete merged[field];
    else merged[field] = value;
  }
  const card = cleanCard(merged);
  const next = { ...cards };
  if (card) next[key] = card;
  else delete next[key];
  return next;
}

/** One change across several cards, so a multi-card edit is a single write. */
export function patchCards(cards: BoardCards, keys: string[], patch: CardPatch): BoardCards {
  return keys.reduce((next, key) => patchCard(next, key, patch), cards);
}

/**
 * Keys a page by its entry in the page array, so its card follows it through a
 * reorder made anywhere — the thumbnail rail, or an agent editing the file —
 * and a page added elsewhere never shifts a memo onto its neighbour. A repeated
 * entry, which is what duplicating a page produces, is told apart by
 * occurrence, so the copy starts with a card of its own.
 *
 * `null` entries mean the array cannot be read one entry per page (a spread
 * stands for any number of pages), so pages fall back to their positions.
 * Entries not loaded yet, or disagreeing with the page count while the deck
 * reloads, give keys that match no card, so a memo never flashes onto the
 * wrong page.
 */
export function pageKeys(entries: string[] | null | undefined, count: number): string[] {
  if (entries === null) return Array.from({ length: count }, (_, i) => `@${i}`);
  if (entries === undefined || entries.length !== count) {
    return Array.from({ length: count }, (_, i) => `${PENDING}${i}`);
  }
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    const n = (seen.get(entry) ?? 0) + 1;
    seen.set(entry, n);
    return n === 1 ? entry : `${entry}#${n}`;
  });
}

/** Position pairs for the links whose pages are both in the deck. */
export function linkedPairs(keys: string[], links: BoardLink[]): [number, number][] {
  const at = new Map(keys.map((key, i) => [key, i]));
  return links.flatMap((link) => {
    const a = at.get(link.a);
    const b = at.get(link.b);
    return a === undefined || b === undefined ? [] : [[a, b] as [number, number]];
  });
}

export type PageOp =
  | { kind: 'move'; from: number; to: number }
  | { kind: 'moveMany'; moving: number[]; to: number }
  | { kind: 'reorder'; order: number[] }
  | { kind: 'duplicate'; index: number }
  | { kind: 'insert'; index: number }
  /** A page put back as the source text it was removed as, with what it carried. */
  | { kind: 'restore'; index: number; entry: string; card?: BoardCard | null }
  | { kind: 'delete'; index: number }
  | { kind: 'deleteMany'; indices: number[] };

/** Where each page sat before `op`; -1 marks the page `op` created. */
export function originAfter(op: PageOp, total: number): number[] {
  const order = Array.from({ length: total }, (_, i) => i);
  switch (op.kind) {
    case 'move': {
      const [moved] = order.splice(op.from, 1);
      order.splice(op.to, 0, moved);
      return order;
    }
    case 'moveMany': {
      const moving = [...new Set(op.moving)].sort((a, b) => a - b);
      const staying = order.filter((index) => !moving.includes(index));
      const before = moving.filter((index) => index < op.to).length;
      const at = Math.max(0, Math.min(staying.length, op.to - before));
      return [...staying.slice(0, at), ...moving, ...staying.slice(at)];
    }
    case 'reorder':
      return op.order;
    case 'duplicate':
      order.splice(op.index + 1, 0, -1);
      return order;
    case 'insert':
    case 'restore':
      order.splice(op.index, 0, -1);
      return order;
    case 'delete':
      order.splice(op.index, 1);
      return order;
    case 'deleteMany':
      return order.filter((index) => !op.indices.includes(index));
  }
}

export function entriesAfter<E extends string[] | null | undefined>(
  op: PageOp,
  entries: E,
  count: number,
): E {
  if (!entries || entries.length !== count) return entries;
  return originAfter(op, count).map((from) => {
    if (from >= 0) return entries[from];
    if (op.kind === 'duplicate') return entries[op.index];
    // A restored page already knows the name it was written as, so its card is
    // found again straight away instead of waiting to be adopted under a blank.
    if (op.kind === 'restore') return op.entry;
    return BLANK_ENTRY;
  }) as E;
}

/**
 * Carries cards and links through a page operation the board made. Only pages
 * whose key the operation changed are re-keyed — the copies of a duplicated
 * page, or every page when the deck is keyed by position — and a deleted page
 * takes its card and links with it. Data under a key the deck does not have
 * right now stays put, so a page whose entry comes back finds its card again;
 * it only gives way to a page this operation created under the same key.
 */
export function carryCards(
  state: CardState,
  before: string[],
  after: string[],
  origin: number[],
): CardState {
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

  const cards: BoardCards = {};
  // Live pages go last, so a page renumbered onto a key that also holds
  // leftover data keeps its own card.
  for (const livePass of [false, true]) {
    for (const [key, card] of Object.entries(state.cards)) {
      if (live.has(key) !== livePass) continue;
      const next = resolve(key);
      if (next !== null) cards[next] = card;
    }
  }
  const links = state.links.reduce<BoardLink[]>((kept, link) => {
    const a = resolve(link.a);
    const b = resolve(link.b);
    return a !== null && b !== null ? linkCards(kept, a, b) : kept;
  }, []);
  return { cards, links };
}

/**
 * Once the deck reloads, a blank page added on the board learns its real name.
 * Whatever it collected in the meantime moves onto that name, and anything left
 * over under the name from an older page goes: the blank page is new.
 */
export function adoptEntries(
  state: CardState,
  before: string[] | null | undefined,
  after: string[] | null | undefined,
): CardState {
  if (!before || !after || before.length !== after.length) return state;
  const from = pageKeys(before, before.length);
  const to = pageKeys(after, after.length);
  const rename = new Map<string, string>();
  before.forEach((entry, i) => {
    if (entry === BLANK_ENTRY && from[i] !== to[i]) rename.set(from[i], to[i]);
  });
  if (rename.size === 0) return state;

  const targets = new Set(rename.values());
  const cards = { ...state.cards };
  for (const [blank, named] of rename) {
    if (cards[blank]) cards[named] = cards[blank];
    else delete cards[named];
    delete cards[blank];
  }
  const links = state.links
    .filter((link) => !targets.has(link.a) && !targets.has(link.b))
    .reduce<BoardLink[]>(
      (kept, link) => linkCards(kept, rename.get(link.a) ?? link.a, rename.get(link.b) ?? link.b),
      [],
    );
  return { cards, links };
}
