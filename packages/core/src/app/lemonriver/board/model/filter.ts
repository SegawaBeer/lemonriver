import type { BoardCard, CardStatus } from './cards';

/**
 * Filters never remove a card: a card that does not match stays where it is and
 * is drawn faint, so the deck's order and the board's shape stay readable while
 * a subset is picked out.
 */
export type BoardFilter = {
  /** Statuses to keep. Empty keeps every status. */
  statuses: CardStatus[];
  /** Keep only cards carrying a work memo. */
  memo: boolean;
  /** Keep only cards carrying an unhandled comment. */
  comments: boolean;
};

export const EMPTY_FILTER: BoardFilter = { statuses: [], memo: false, comments: false };

export function isFilterActive(filter: BoardFilter): boolean {
  return filter.statuses.length > 0 || filter.memo || filter.comments;
}

export function matchesFilter(
  card: BoardCard | undefined,
  hasComments: boolean,
  filter: BoardFilter,
): boolean {
  if (!isFilterActive(filter)) return true;
  if (filter.statuses.length > 0 && !(card?.status && filter.statuses.includes(card.status))) {
    return false;
  }
  if (filter.memo && !card?.memo) return false;
  if (filter.comments && !hasComments) return false;
  return true;
}

export function toggleStatus(filter: BoardFilter, status: CardStatus): BoardFilter {
  const statuses = filter.statuses.includes(status)
    ? filter.statuses.filter((value) => value !== status)
    : [...filter.statuses, status];
  return { ...filter, statuses };
}
