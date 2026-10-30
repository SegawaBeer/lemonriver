import { format } from '@/lib/use-locale';
import { useLrText } from '../../text';

/** How much of a chapter is finished, as a thin bar and the count beside it. */
export function Progress({
  progress,
  compact = false,
}: {
  progress: { done: number; review: number; total: number };
  /** The count without the bar, for a header too narrow to draw one. */
  compact?: boolean;
}) {
  const lr = useLrText();
  if (progress.total === 0) return null;
  const share = Math.round((progress.done / progress.total) * 100);
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
      {!compact && (
        <span className="h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span
            className="block h-full rounded-full bg-[var(--lr-success)]"
            style={{ width: `${share}%` }}
          />
        </span>
      )}
      <span data-lr-progress>
        {format(lr.board.progress, { done: progress.done, total: progress.total })}
        {progress.review > 0 && ` · ${format(lr.board.progressReview, { n: progress.review })}`}
      </span>
    </span>
  );
}
