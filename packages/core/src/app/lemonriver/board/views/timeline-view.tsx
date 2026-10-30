import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useState } from 'react';
import { format, useLocale } from '@/lib/use-locale';
import { cn, pad2 } from '@/lib/utils';
import type { Page } from '../../../lib/sdk';
import { useLrText } from '../../text';
import type { Block } from '../blocks/classify';
import { pageName } from '../layout';
import type { BoardCard } from '../model/cards';
import { type BoardColumn, chapterProgress, columnStarts } from '../model/structure';
import {
  estimateSeconds,
  formatDuration,
  type Timing,
  timelineSegments,
  xForSeconds,
} from '../model/timing';
import { useStatusLabels } from '../page-node';
import { STATUS_STYLE } from '../status-style';
import { Progress } from './progress';

type Props = {
  pages: Page[];
  keys: string[];
  cards: (BoardCard | undefined)[];
  columns: BoardColumn[];
  notes?: (string | undefined)[];
  dimmed: boolean[];
  selected: number[];
  target: number | null;
  targetFor: (minutes: number | null) => void;
  onSelect: (indices: number[]) => void;
  onOpenPage: (index: number) => void;
  onMovePages: (moving: number[], to: number) => void;
  blocksOfPage: (key: string) => Block[] | null;
};

const pageIndexOf = (id: string) => Number(id.replace('page-', ''));

const BASIS: Record<Timing['basis'], 'basisNotes' | 'basisPage' | 'basisNone'> = {
  notes: 'basisNotes',
  page: 'basisPage',
  none: 'basisNone',
};

/**
 * The deck laid out as the talk it will be: every page a stretch of the track as
 * wide as it takes to say, chapter after chapter, with the target marked on it.
 */
export function TimelineView({
  pages,
  keys,
  cards,
  columns,
  notes,
  dimmed,
  selected,
  target,
  targetFor,
  onSelect,
  onOpenPage,
  onMovePages,
  blocksOfPage,
}: Props) {
  const lr = useLrText();
  const locale = useLocale();
  const [draft, setDraft] = useState(target === null ? '' : String(target));

  useEffect(() => setDraft(target === null ? '' : String(target)), [target]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const timings = pages.map((_, index) => {
    const key = keys[index];
    return estimateSeconds({ notes: notes?.[index], blocks: key ? blocksOfPage(key) : null });
  });
  const seconds = timings.map((timing) => timing.seconds);
  const segments = timelineSegments(seconds);
  const total = seconds.reduce((sum, value) => sum + value, 0);
  const trackWidth = segments.reduce((sum, segment) => sum + segment.width, 0);

  const targetSeconds = target === null ? null : target * 60;
  const over = targetSeconds !== null && total > targetSeconds;
  const targetX = targetSeconds === null ? null : xForSeconds(seconds, targetSeconds);

  const starts = columnStarts(columns);
  const chapterOf = (index: number) => {
    for (let i = starts.length - 1; i >= 0; i--) if (index >= starts[i]) return i;
    return 0;
  };
  const byKey = cards.reduce<Record<string, BoardCard>>((all, card, index) => {
    const key = keys[index];
    if (card && key) all[key] = card;
    return all;
  }, {});

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over: on } = event;
    if (!on || active.id === on.id) return;
    const from = pageIndexOf(String(active.id));
    const to = pageIndexOf(String(on.id));
    if (!Number.isInteger(from) || !Number.isInteger(to)) return;
    onMovePages([from], to);
  };

  const commitTarget = (value: string) => {
    setDraft(value);
    if (!value.trim()) {
      targetFor(null);
      return;
    }
    const minutes = Math.trunc(Number(value));
    if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 180) targetFor(minutes);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" data-lr-timeline-view>
      <div className="flex shrink-0 items-center gap-3 border-b border-hairline px-6 py-2.5">
        <span
          className={cn('text-[13px] tabular-nums', over ? 'text-destructive' : 'text-foreground')}
          data-lr-total
          data-over={over ? 'true' : 'false'}
        >
          {format(lr.board.totalDuration, { d: formatDuration(total, locale.id) })}
        </span>
        {target !== null && targetSeconds !== null && (
          <span
            className={cn(
              'text-[12px] tabular-nums',
              over ? 'text-destructive' : 'text-muted-foreground',
            )}
            data-lr-target-diff
          >
            {over
              ? format(lr.board.overTarget, {
                  d: formatDuration(total - targetSeconds, locale.id),
                })
              : format(lr.board.underTarget, {
                  d: formatDuration(targetSeconds - total, locale.id),
                })}
          </span>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted-foreground">
          {lr.board.target}
          <input
            type="number"
            min={1}
            max={180}
            value={draft}
            aria-label={lr.board.target}
            data-lr-target
            onChange={(event) => commitTarget(event.currentTarget.value)}
            className="w-16 rounded-[4px] border border-hairline bg-background px-2 py-1 text-[12.5px] tabular-nums text-foreground outline-none focus:ring-1 focus:ring-brand/50"
          />
        </label>
      </div>

      <div className="min-h-0 w-full flex-1 overflow-auto px-6 py-5">
        {pages.length === 0 ? null : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <div className="relative" style={{ width: trackWidth }}>
              <div className="mb-2 flex">
                {columns.map((column, columnIndex) => {
                  const from = starts[columnIndex] ?? 0;
                  const width = segments
                    .slice(from, from + column.size)
                    .reduce((sum, segment) => sum + segment.width, 0);
                  const chapterSeconds = seconds
                    .slice(from, from + column.size)
                    .reduce((sum, value) => sum + value, 0);
                  const progress = chapterProgress(byKey, keys.slice(from, from + column.size));
                  return (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: a chapter is its position in the deck
                      key={`chapter-${columnIndex}`}
                      data-lr-timeline-chapter
                      className={cn(
                        'flex min-w-0 items-baseline gap-1.5 overflow-hidden pr-2',
                        columnIndex > 0 && 'border-l border-hairline pl-2',
                      )}
                      style={{ width }}
                    >
                      <span className="eyebrow truncate text-foreground">
                        {column.title || format(lr.board.columnFallback, { n: columnIndex + 1 })}
                      </span>
                      {/* A short chapter cannot show its numbers; the name is what it
                          has to keep. */}
                      {width >= 120 && (
                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                          {formatDuration(chapterSeconds, locale.id)}
                        </span>
                      )}
                      {width >= 140 && <Progress progress={progress} compact={width < 260} />}
                    </div>
                  );
                })}
              </div>

              <div className="relative flex h-20" data-lr-timeline-track>
                <SortableContext
                  items={segments.map((_, index) => `page-${index}`)}
                  strategy={horizontalListSortingStrategy}
                >
                  {segments.map((segment, index) => {
                    const chapter = chapterOf(index);
                    const chapterHead = index === starts[chapter];
                    return (
                      <Segment
                        // biome-ignore lint/suspicious/noArrayIndexKey: a page is its position in the deck
                        key={`page-${index}`}
                        id={`page-${index}`}
                        index={index}
                        width={segment.width}
                        chapterHead={chapterHead}
                        pages={pages}
                        card={cards[index]}
                        timing={timings[index]}
                        dimmed={dimmed[index] === true}
                        beyond={
                          targetX !== null && segment.start >= targetX && targetSeconds !== null
                        }
                        selected={selected.includes(index)}
                        onSelect={() => onSelect([index])}
                        onOpen={() => onOpenPage(index)}
                      />
                    );
                  })}
                </SortableContext>

                {targetX !== null && (
                  <span
                    aria-hidden
                    data-lr-target-line
                    className="pointer-events-none absolute top-0 bottom-0 w-px bg-destructive/70"
                    style={{ left: Math.min(targetX, trackWidth) }}
                  />
                )}
              </div>
            </div>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function Segment({
  id,
  index,
  width,
  chapterHead,
  pages,
  card,
  timing,
  dimmed,
  beyond,
  selected,
  onSelect,
  onOpen,
}: {
  id: string;
  index: number;
  width: number;
  chapterHead: boolean;
  pages: Page[];
  card?: BoardCard;
  timing: Timing;
  dimmed: boolean;
  beyond: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const lr = useLrText();
  const locale = useLocale();
  const labels = useStatusLabels();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const status = card?.status;
  const title = card?.title || pageName(pages[index]) || '';
  const duration = formatDuration(timing.seconds, locale.id);
  const hint = [
    `${pad2(index + 1)}${title ? ` ${title}` : ''}`,
    duration,
    lr.board[BASIS[timing.basis]],
    status ? labels[status] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      ref={setNodeRef}
      type="button"
      title={hint}
      data-lr-timeline-segment
      data-page={index + 1}
      data-selected={selected ? 'true' : 'false'}
      onClick={onSelect}
      onDoubleClick={onOpen}
      style={{ width, transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'relative flex h-full flex-col items-start justify-start overflow-hidden rounded-[4px] border-r border-background px-1.5 py-1 text-left',
        status ? STATUS_STYLE[status].bar : 'bg-muted',
        'hover:brightness-[0.97]',
        chapterHead && 'border-l-2 border-l-foreground/25',
        selected && 'ring-2 ring-brand ring-inset',
        dimmed && 'opacity-35',
        beyond && 'opacity-40',
        isDragging && 'z-10 opacity-70 shadow-[var(--lr-shadow-1)]',
      )}
      {...attributes}
      {...listeners}
    >
      <span className="text-[11px] tabular-nums text-muted-foreground">{pad2(index + 1)}</span>
      {width >= 120 && title && (
        <span className="line-clamp-2 text-[11.5px] text-foreground/80">{title}</span>
      )}
      <span className="mt-auto text-[10.5px] tabular-nums text-muted-foreground">{duration}</span>
    </button>
  );
}
