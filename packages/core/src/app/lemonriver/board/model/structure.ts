/**
 * The board's own structure, stored outside the deck: a deck file never learns
 * that a board exists. Columns hold a count rather than page ids, so reordering
 * a deck can never strand the structure — only the page count has to agree.
 */
export type BoardColumn = { title: string; size: number };
export type BoardStructure = { columns: BoardColumn[] };

export function sanitizeStructure(parsed: unknown): BoardStructure | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const columns = (parsed as { columns?: unknown }).columns;
  if (!Array.isArray(columns)) return null;
  const cleaned = columns.flatMap((column) => {
    if (!column || typeof column !== 'object') return [];
    const { title, size } = column as { title?: unknown; size?: unknown };
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 0) return [];
    return [{ title: typeof title === 'string' ? title : '', size }];
  });
  return cleaned.length > 0 ? { columns: cleaned } : null;
}

/**
 * Keeps a stored structure usable after the deck changed behind the board's
 * back: pages added outside the board join the last column, and pages deleted
 * outside it come off the end.
 */
export function reconcileColumns(columns: BoardColumn[], pageCount: number): BoardColumn[] {
  if (pageCount <= 0) return [];
  const kept = columns.map((column) => ({ ...column }));
  if (kept.length === 0) return [{ title: '', size: pageCount }];

  let total = kept.reduce((sum, column) => sum + column.size, 0);
  if (total === pageCount) return kept;

  if (total < pageCount) {
    kept[kept.length - 1].size += pageCount - total;
    return kept;
  }
  for (let i = kept.length - 1; i >= 0 && total > pageCount; i--) {
    const drop = Math.min(kept[i].size, total - pageCount);
    kept[i].size -= drop;
    total -= drop;
  }
  // A column emptied by deletions keeps its title; only trailing empties go, so
  // the board does not accumulate labels for chapters that no longer exist.
  while (kept.length > 1 && kept[kept.length - 1].size === 0) kept.pop();
  return kept;
}

/** Column index that owns a position, and where each column starts. */
export function columnStarts(columns: BoardColumn[]): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const column of columns) {
    starts.push(at);
    at += column.size;
  }
  return starts;
}

export function columnOfPosition(columns: BoardColumn[], position: number): number {
  const starts = columnStarts(columns);
  for (let i = starts.length - 1; i >= 0; i--) {
    if (position >= starts[i]) return i;
  }
  return 0;
}

/**
 * Moving a card across a column boundary hands one page from one column to the
 * other. Nothing else about the structure moves — a chapter divider is an
 * ordinary card, so the pages it used to head keep their own column.
 */
export function columnsAfterMove(columns: BoardColumn[], from: number, to: number): BoardColumn[] {
  const source = columnOfPosition(columns, from);
  const target = columnOfPosition(columns, to);
  if (source === target) return columns;
  const next = columns.map((column) => ({ ...column }));
  next[source].size -= 1;
  next[target].size += 1;
  return next;
}

/**
 * Moving several cards at once sends each one across the same boundary, so a
 * column that both gives and takes a card keeps its length.
 */
export function columnsAfterMoveMany(
  columns: BoardColumn[],
  froms: number[],
  to: number,
): BoardColumn[] {
  if (froms.length === 0) return columns;
  const target = columnOfPosition(columns, to);
  const next = columns.map((column) => ({ ...column }));
  for (const from of froms) next[columnOfPosition(columns, from)].size -= 1;
  next[target].size += froms.length;
  return next;
}

/** The structure left after pages at `indices` are removed, one per page. */
export function columnsAfterRemove(columns: BoardColumn[], indices: number[]): BoardColumn[] {
  const owners = indices.map((index) => columnOfPosition(columns, index));
  return columns.map((column, i) => {
    const take = owners.filter((owner) => owner === i).length;
    return take === 0 ? column : { ...column, size: Math.max(0, column.size - take) };
  });
}

/**
 * The structure left after a page is added at each index. An added page joins
 * the chapter the page it was added beside belongs to.
 */
export function columnsAfterInsert(columns: BoardColumn[], indices: number[]): BoardColumn[] {
  const owners = indices.map((index) => columnOfPosition(columns, index));
  return columns.map((column, i) => {
    const give = owners.filter((owner) => owner === i).length;
    return give === 0 ? column : { ...column, size: column.size + give };
  });
}

/** A new chapter sits after `index`, empty until something is put in it. */
export function addColumnAfter(
  columns: BoardColumn[],
  index: number,
  title: string,
  size = 0,
): BoardColumn[] {
  const next = columns.map((column) => ({ ...column }));
  next.splice(index + 1, 0, { title, size });
  return next;
}

export function renameColumnAt(
  columns: BoardColumn[],
  index: number,
  title: string,
): BoardColumn[] {
  if (!columns[index]) return columns;
  return columns.map((column, i) => (i === index ? { ...column, title } : column));
}

/**
 * Removing a chapter folds its pages into a neighbour rather than deleting
 * them: the previous chapter when there is one, the next otherwise. The last
 * chapter standing cannot be removed, because every page needs a chapter.
 */
export function deleteColumnAt(columns: BoardColumn[], index: number): BoardColumn[] | null {
  if (columns.length <= 1 || !columns[index]) return null;
  const next = columns.map((column) => ({ ...column }));
  const [removed] = next.splice(index, 1);
  const into = index === 0 ? 0 : index - 1;
  next[into].size += removed.size;
  return next;
}

/** Chapters in a new order; their pages travel with them. */
export function moveColumnBlock(
  columns: BoardColumn[],
  from: number,
  to: number,
): BoardColumn[] | null {
  if (from === to || !columns[from] || !columns[to]) return null;
  const next = columns.map((column) => ({ ...column }));
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Deck positions regrouped by the new chapter order; `order[new] = old`. */
export function orderAfterColumnMove(columns: BoardColumn[], from: number, to: number): number[] {
  const moved = moveColumnBlock(columns, from, to);
  if (!moved) return identityOrder(columns);
  const blocks: number[][] = [];
  let at = 0;
  for (const column of columns) {
    blocks.push(Array.from({ length: column.size }, (_, i) => at + i));
    at += column.size;
  }
  const [block] = blocks.splice(from, 1);
  blocks.splice(to, 0, block);
  return blocks.flat();
}

function identityOrder(columns: BoardColumn[]): number[] {
  const total = columns.reduce((sum, column) => sum + column.size, 0);
  return Array.from({ length: total }, (_, i) => i);
}

/**
 * A card dropped into the gap between two chapters starts a chapter of its own
 * there, holding nothing but that card. The chapter it came from loses it, and
 * a chapter left with no pages goes away.
 */
export function insertPageColumn(
  columns: BoardColumn[],
  from: number,
  boundary: number,
  title: string,
): { columns: BoardColumn[]; order: number[] } | null {
  const total = columns.reduce((sum, column) => sum + column.size, 0);
  if (from < 0 || from >= total) return null;
  if (boundary <= 0 || boundary >= columns.length) return null;
  const owner = columnOfPosition(columns, from);

  const kept = columns.flatMap((column, i) => {
    const size = i === owner ? column.size - 1 : column.size;
    return i === owner && size === 0 ? [] : [{ title: column.title, size, original: i }];
  });
  const at = kept.filter((column) => column.original < boundary).length;
  const next = [
    ...kept.slice(0, at).map(({ title: t, size }) => ({ title: t, size })),
    { title, size: 1 },
    ...kept.slice(at).map(({ title: t, size }) => ({ title: t, size })),
  ];

  const insertAt = next.slice(0, at).reduce((sum, column) => sum + column.size, 0);
  const order = identityOrder(columns).filter((position) => position !== from);
  order.splice(insertAt, 0, from);
  return { columns: next, order };
}
