import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A sidebar row in the official rows' shape, for the pages we add. */
export function NavRow({
  icon,
  label,
  current,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  current: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-lr-nav
      aria-current={current ? 'page' : undefined}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[5px] px-2 py-[5px] text-left text-[12.5px] outline-none',
        'transition-[background-color,color] duration-150 focus-visible:ring-1 focus-visible:ring-brand',
        current ? 'font-medium text-foreground' : 'text-foreground/70 hover:text-foreground',
      )}
    >
      <span aria-hidden className="flex size-5 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
