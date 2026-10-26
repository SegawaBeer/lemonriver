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
