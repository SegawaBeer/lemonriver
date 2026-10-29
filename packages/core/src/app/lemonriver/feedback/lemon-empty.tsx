import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Mascot, type MascotState } from '../brand/mascot';

/** The design package's empty and error state: Lemon, what happened, what to do next. */
export function LemonEmpty({
  state = 'idle',
  size = 140,
  title,
  children,
  actions,
  compact = false,
  className,
}: {
  state?: MascotState;
  size?: number;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      data-lr-empty
      className={cn(
        'mx-auto flex max-w-[520px] flex-col items-center text-center',
        compact ? 'gap-1.5 px-4 py-8' : 'gap-2 px-4 py-12',
        className,
      )}
    >
      <Mascot state={state} size={size} float={state === 'idle'} className="mb-2" />
      <h2
        className={cn(
          'font-heading font-semibold text-foreground',
          compact ? 'text-[13px]' : 'text-[20px] leading-7',
        )}
      >
        {title}
      </h2>
      {children && (
        <div
          className={cn(
            'text-muted-foreground',
            compact ? 'text-[12px] leading-relaxed' : 'text-[14px] leading-6',
          )}
        >
          {children}
        </div>
      )}
      {actions && <div className="mt-3 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
