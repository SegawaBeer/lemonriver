import type { CardStatus } from './model/cards';

/** One colour per status, shared by the cards, the list and the timeline. */
export const STATUS_STYLE: Record<CardStatus, { dot: string; ring: string; bar: string }> = {
  todo: {
    dot: 'bg-muted-foreground/50',
    ring: 'ring-muted-foreground/35',
    bar: 'bg-muted-foreground/20',
  },
  doing: {
    dot: 'bg-[var(--lr-accent)]',
    ring: 'ring-[var(--lr-accent)]',
    bar: 'bg-[var(--lr-accent)]/25',
  },
  review: {
    dot: 'bg-[var(--lr-warning)]',
    ring: 'ring-[var(--lr-warning)]/75',
    bar: 'bg-[var(--lr-warning)]/30',
  },
  done: {
    dot: 'bg-[var(--lr-success)]',
    ring: 'ring-[var(--lr-success)]/70',
    bar: 'bg-[var(--lr-success)]/30',
  },
};
