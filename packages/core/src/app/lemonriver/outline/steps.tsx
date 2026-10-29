import { cn } from '@/lib/utils';
import { useLrText } from '../text';

/** The four moves of the guided flow, with the current one marked. */
export function Steps({ current }: { current: 1 | 2 | 3 | 4 }) {
  const lr = useLrText().outline;
  const labels = [lr.stepDescribe, lr.stepOutline, lr.stepBuild, lr.stepDone];
  return (
    <ol data-lr-steps className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {labels.map((label, index) => {
        const step = index + 1;
        const active = step === current;
        const done = step < current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex size-6 items-center justify-center rounded-full border text-[11.5px] font-semibold tabular-nums',
                active
                  ? 'border-transparent bg-brand text-brand-foreground'
                  : done
                    ? 'border-[var(--lr-focus)] text-foreground'
                    : 'border-border text-muted-foreground',
              )}
            >
              {step}
            </span>
            <span
              className={cn(
                'text-[13px]',
                active ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            {step < labels.length && <span aria-hidden className="h-px w-5 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}
