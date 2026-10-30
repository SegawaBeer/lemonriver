import { X } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { format, plural } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { useLrText } from '../../text';
import { type Placement, staleChanges } from '../model/changes';
import type { Restructure } from '../model/restructure';
import type { Block } from './classify';

export type ChangeLine = { key: string; text: string; stale: boolean; remove: () => void };

export type ChangeApply = {
  onApply: () => void;
  disabled: boolean;
  /** Why the button cannot be pressed, or null when it can. */
  hint: string | null;
  starting: boolean;
};

/** The change list as sentences, one line per page's worth of block moves. */
export function ChangeList({
  changes,
  restructures,
  pageKeys,
  readOf,
  onRemove,
  onRemoveRestructure,
  readOnly,
  apply,
}: {
  changes: Placement[];
  restructures: Restructure[];
  pageKeys: string[];
  readOf: (page: string) => Block[] | null;
  onRemove: (indices: number[]) => void;
  onRemoveRestructure: (index: number) => void;
  readOnly: boolean;
  apply: ChangeApply;
}) {
  const lr = useLrText();
  const stale = useMemo(() => staleChanges(changes, readOf), [changes, readOf]);

  const lines = useMemo<ChangeLine[]>(() => {
    const pageNumber = (key: string) => pageKeys.indexOf(key) + 1;
    const lines: ChangeLine[] = [];
    const reorderAt = new Map<string, { line: ChangeLine; indices: number[] }>();

    changes.forEach((item, index) => {
      const from = pageNumber(item.origin.page);
      const label = item.block.text || lr.board.blockKinds[item.block.kind];
      const isStale = stale.has(index);

      if (item.to === 'parked') {
        if (from > 0) {
          lines.push({
            key: `p${index}`,
            text: format(lr.board.changeToParking, { from, block: label }),
            stale: isStale,
            remove: () => onRemove([index]),
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
          remove: () => onRemove([index]),
        });
        return;
      }

      if (item.to.page === item.origin.page) {
        const existing = reorderAt.get(item.origin.page);
        if (existing) {
          // Every block reordered on this page is undone by the same line.
          existing.indices.push(index);
          existing.line.stale = existing.line.stale || isStale;
          return;
        }
        const indices = [index];
        const line: ChangeLine = {
          key: `r:${item.origin.page}`,
          text: format(lr.board.changeReorder, { n: from }),
          stale: isStale,
          remove: () => onRemove(indices),
        };
        reorderAt.set(item.origin.page, { line, indices });
        lines.push(line);
        return;
      }

      lines.push({
        key: `t${index}`,
        text: format(lr.board.changeToPage, { from, block: label, to }),
        stale: isStale,
        remove: () => onRemove([index]),
      });
    });

    restructures.forEach((entry, index) => {
      if (entry.kind === 'split') {
        const n = pageNumber(entry.page);
        if (n <= 0) return;
        lines.push({
          key: `s${index}`,
          text: format(plural(entry.blocks.length, lr.board.changeSplit), {
            n,
            k: entry.blocks.length,
          }),
          stale: false,
          remove: () => onRemoveRestructure(index),
        });
        return;
      }
      const a = pageNumber(entry.pages[0]);
      const b = pageNumber(entry.pages[1]);
      if (a <= 0 || b <= 0) return;
      lines.push({
        key: `m${index}`,
        text: format(lr.board.changeMerge, { a: Math.min(a, b), b: Math.max(a, b) }),
        stale: false,
        remove: () => onRemoveRestructure(index),
      });
    });

    return lines;
  }, [changes, restructures, pageKeys, lr.board, stale, onRemove, onRemoveRestructure]);

  if (lines.length === 0) return null;

  return (
    <div data-lr-change-list>
      <ul className="max-h-[360px] overflow-y-auto py-1">
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
              disabled={readOnly}
              onClick={line.remove}
              className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-30"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t border-hairline px-3 py-2">
        <Button
          type="button"
          size="sm"
          className="w-full"
          data-lr-change-apply
          disabled={readOnly || apply.disabled || apply.starting}
          onClick={apply.onApply}
        >
          {lr.board.apply}
        </Button>
        {apply.hint && (
          <p className="mt-1.5 text-[11.5px] text-muted-foreground" data-lr-apply-hint>
            {apply.hint}
          </p>
        )}
      </div>
    </div>
  );
}
