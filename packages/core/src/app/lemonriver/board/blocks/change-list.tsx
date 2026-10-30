import { X } from 'lucide-react';
import { useMemo } from 'react';
import { format } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { useLrText } from '../../text';
import { type Placement, staleChanges } from '../model/changes';
import type { Block } from './classify';

export type ChangeLine = { key: string; text: string; stale: boolean; remove: number[] };

/** The change list as sentences, one line per page's worth of block moves. */
export function ChangeList({
  changes,
  pageKeys,
  readOf,
  onRemove,
}: {
  changes: Placement[];
  pageKeys: string[];
  readOf: (page: string) => Block[] | null;
  onRemove: (indices: number[]) => void;
}) {
  const lr = useLrText();
  const stale = useMemo(() => staleChanges(changes, readOf), [changes, readOf]);

  const lines = useMemo<ChangeLine[]>(() => {
    const pageNumber = (key: string) => pageKeys.indexOf(key) + 1;
    const lines: ChangeLine[] = [];
    const reorderAt = new Map<string, ChangeLine>();

    changes.forEach((item, index) => {
      const from = pageNumber(item.origin.page);
      const label = item.block.text;
      const isStale = stale.has(index);

      if (item.to === 'parked') {
        if (from > 0) {
          lines.push({
            key: `p${index}`,
            text: format(lr.board.changeToParking, { from, block: label }),
            stale: isStale,
            remove: [index],
          });
        }
        return;
      }

      const to = pageNumber(item.to.page);
      if (to <= 0) return;

      if (item.fromParking) {
        lines.push({
          key: `f${index}`,
          text: format(lr.board.changeFromParking, { block: label, to }),
          stale: isStale,
          remove: [index],
        });
        return;
      }

      if (item.to.page === item.origin.page) {
        const existing = reorderAt.get(item.origin.page);
        if (existing) {
          existing.remove.push(index);
          existing.stale = existing.stale || isStale;
          return;
        }
        const line: ChangeLine = {
          key: `r:${item.origin.page}`,
          text: format(lr.board.changeReorder, { n: from }),
          stale: isStale,
          remove: [index],
        };
        reorderAt.set(item.origin.page, line);
        lines.push(line);
        return;
      }

      lines.push({
        key: `t${index}`,
        text: format(lr.board.changeToPage, { from, block: label, to }),
        stale: isStale,
        remove: [index],
      });
    });

    return lines;
  }, [changes, pageKeys, lr.board, stale]);

  if (lines.length === 0) return null;

  return (
    <ul data-lr-change-list className="max-h-[360px] overflow-y-auto py-1">
      {lines.map((line) => (
        <li
          key={line.key}
          className={cn(
            'flex items-start gap-2 px-3 py-1.5 text-[12.5px]',
            line.stale ? 'text-destructive' : 'text-foreground',
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2">{line.text}</span>
            {line.stale && (
              <span className="mt-0.5 block text-[11.5px] text-destructive/80">
                {lr.board.changeStale}
              </span>
            )}
          </span>
          <button
            type="button"
            aria-label={lr.board.changeRemove}
            title={lr.board.changeRemove}
            onClick={() => onRemove(line.remove)}
            className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
