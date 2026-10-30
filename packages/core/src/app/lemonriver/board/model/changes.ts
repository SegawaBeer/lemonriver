import type { Block, BlockKind } from '../blocks/classify.ts';

/** What the board remembers about a block it is about to move. */
export type BlockInfo = { kind: BlockKind; text: string; loc: string | null };
/** A place a block can sit: after `before`, or last when that is null. */
export type Spot = { page: string; before: string | null };
export type Placement = {
  origin: Spot & { block: string };
  block: BlockInfo;
  to: Spot | 'parked';
  code?: string;
  /** Set when the block left the holding area and is now on a page. */
  fromParking?: true;
};

const MAX_CHANGES = 200;
const TEXT_MAX = 80;
const CODE_MAX = 4000;

export function sameSpot(a: Spot, b: Spot): boolean {
  return a.page === b.page && a.before === b.before;
}

/** One entry per block: moving it again replaces where it was going. */
export function placeBlock(
  changes: Placement[],
  origin: Spot & { block: string },
  block: BlockInfo,
  to: Spot | 'parked',
  code?: string,
): Placement[] {
  const kept = changes.filter(
    (item) => !(item.origin.page === origin.page && item.origin.block === origin.block),
  );
  if (to !== 'parked' && sameSpot(to, origin)) return kept;
  const placement: Placement = { origin, block, to };
  if (code !== undefined) placement.code = code;
  return [...kept, placement];
}

export function removeChange(changes: Placement[], origin: Spot & { block: string }): Placement[] {
  return changes.filter(
    (item) => !(item.origin.page === origin.page && item.origin.block === origin.block),
  );
}

/** A block taken out of the holding area and put back on a page. */
export function unparkBlock(changes: Placement[], parked: Placement, to: Spot): Placement[] {
  const kept = changes.filter((item) => item !== parked);
  if (sameSpot(to, parked.origin)) return kept;
  const placement: Placement = {
    origin: parked.origin,
    block: parked.block,
    to,
    fromParking: true,
  };
  if (parked.code !== undefined) placement.code = parked.code;
  return [...kept, placement];
}

export type EffectiveBlock = Omit<Block, 'box'> & {
  box: Block['box'] | null;
  pending?: true;
  from?: string;
};

/**
 * What a page shows right now: its own blocks with the ones moved away taken
 * out, then the ones moved in, each sitting where its `before` says.
 */
export function effectiveBlocks(
  page: string,
  original: Block[],
  changes: Placement[],
): EffectiveBlock[] {
  const leaving = new Set(
    changes.filter((item) => item.origin.page === page).map((item) => item.origin.block),
  );
  const blocks: EffectiveBlock[] = original.filter((block) => !leaving.has(block.id));

  for (const item of changes) {
    const to = item.to;
    if (to === 'parked' || to.page !== page) continue;
    const at = to.before === null ? -1 : blocks.findIndex((block) => block.id === to.before);
    // A block that only changed place on its own page is still that page's own
    // content, so it is drawn as the page has it now rather than as it was
    // remembered when the move was made.
    const own =
      item.origin.page === page
        ? original.find((block) => block.id === item.origin.block)
        : undefined;
    const arriving: EffectiveBlock = {
      id: item.origin.block,
      kind: own?.kind ?? item.block.kind,
      text: own?.text ?? item.block.text,
      loc: own?.loc ?? item.block.loc,
      box: own?.box ?? null,
      ...(own ? {} : { pending: true as const, from: item.origin.page }),
    };
    if (at < 0) blocks.push(arriving);
    else blocks.splice(at, 0, arriving);
  }
  return blocks;
}

export function parkedBlocks(changes: Placement[]): Placement[] {
  return changes.filter((item) => item.to === 'parked');
}

/** Pages that are a source or a target of at least one change. */
export function changedPages(changes: Placement[]): Set<string> {
  const pages = new Set<string>();
  for (const item of changes) {
    pages.add(item.origin.page);
    if (item.to !== 'parked') pages.add(item.to.page);
  }
  return pages;
}

/**
 * Follows a page operation the board made: keys are renamed the way cards are,
 * and a change whose source or destination page is gone is dropped — the block
 * simply stays where it is.
 */
export function carryChanges(
  changes: Placement[],
  before: string[],
  after: string[],
  origin: number[],
): Placement[] {
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

  const kept: Placement[] = [];
  for (const item of changes) {
    const page = resolve(item.origin.page);
    if (page === null) continue;
    if (item.to === 'parked') {
      kept.push({ ...item, origin: { ...item.origin, page } });
      continue;
    }
    const target = resolve(item.to.page);
    if (target === null) continue;
    kept.push({
      ...item,
      origin: { ...item.origin, page },
      to: { ...item.to, page: target },
    });
  }
  return kept;
}

/**
 * A page the user edited since the change was made no longer has the block we
 * remembered, so the change can no longer be applied there. A page that cannot
 * be read at all is left alone: nothing says the block is gone.
 */
export function staleChanges(
  changes: Placement[],
  readOf: (page: string) => Block[] | null,
): Set<number> {
  const stale = new Set<number>();
  const cache = new Map<string, Block[] | null>();
  changes.forEach((item, index) => {
    const page = item.origin.page;
    if (!cache.has(page)) cache.set(page, readOf(page));
    const blocks = cache.get(page) ?? null;
    if (blocks === null) return;
    const block = blocks.find((candidate) => candidate.id === item.origin.block);
    if (!block || block.text !== item.block.text) stale.add(index);
  });
  return stale;
}

const KIND_SET = new Set<BlockKind>([
  'title',
  'point',
  'text',
  'image',
  'chart',
  'quote',
  'number',
]);

function cleanSpot(raw: unknown): Spot | null {
  if (!raw || typeof raw !== 'object') return null;
  const { page, before } = raw as { page?: unknown; before?: unknown };
  if (typeof page !== 'string' || !page) return null;
  if (before !== null && typeof before !== 'string') return null;
  return { page, before: before ?? null };
}

function cleanPlacement(raw: unknown): Placement | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const origin = cleanSpot(item.origin);
  const block = item.block as Record<string, unknown> | undefined;
  if (!origin || !block || typeof block !== 'object') return null;
  const id = (item.origin as { block?: unknown } | undefined)?.block;
  if (typeof id !== 'string' || !id) return null;
  if (typeof block.kind !== 'string' || !KIND_SET.has(block.kind as BlockKind)) return null;
  if (typeof block.text !== 'string') return null;
  const loc = typeof block.loc === 'string' ? block.loc : null;

  let to: Spot | 'parked';
  if (item.to === 'parked') to = 'parked';
  else {
    const spot = cleanSpot(item.to);
    if (!spot) return null;
    to = spot;
  }

  const placement: Placement = {
    origin: { page: origin.page, before: origin.before, block: id },
    block: { kind: block.kind as BlockKind, text: block.text.slice(0, TEXT_MAX), loc },
    to,
  };
  if (typeof item.code === 'string' && item.code) placement.code = item.code.slice(0, CODE_MAX);
  if (item.fromParking === true) placement.fromParking = true;
  return placement;
}

export function sanitizeChanges(raw: unknown): Placement[] {
  if (!Array.isArray(raw)) return [];
  const changes: Placement[] = [];
  for (const entry of raw) {
    if (changes.length >= MAX_CHANGES) break;
    const placement = cleanPlacement(entry);
    if (!placement) continue;
    const duplicate = changes.some(
      (item) =>
        item.origin.page === placement.origin.page && item.origin.block === placement.origin.block,
    );
    if (!duplicate) changes.push(placement);
  }
  return changes;
}
