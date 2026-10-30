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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, StickyNote } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { format, plural, useLocale } from '@/lib/use-locale';
import { cn, pad2 } from '@/lib/utils';
import type { Page } from '../../../lib/sdk';
import { useLrText } from '../../text';
import type { Block } from '../blocks/classify';
import { pageName } from '../layout';
import type { BoardCard, BoardCards, CardPatch } from '../model/cards';
import { type BoardColumn, chapterProgress, columnStarts } from '../model/structure';
import { estimateSeconds, formatDuration } from '../model/timing';
import { useStatusLabels } from '../page-node';
import { STATUS_STYLE } from '../status-style';
import { Progress } from './progress';

type Props = {
  pages: Page[];
  keys: string[];
  cards: (BoardCard | undefined)[];
  byKey: BoardCards;
  columns: BoardColumn[];
  notes?: (string | undefined)[];
  /** One flag per page: the page has an open comment. */
  comments: boolean[];
  /** One flag per page: the filter does not pick this page out. */
  dimmed: boolean[];
  /** One count per page: block moves waiting to be applied. */
  changeCounts: number[];
  selected: number[];
  /** A page another view asked to show, as a counter so the same page again still scrolls. */
  jumpTo: { index: number; seq: number } | null;
  onSelect: (indices: number[]) => void;
  onOpenPage: (index: number) => void;
  onPatchCard: (index: number, patch: CardPatch) => void;
  onMovePages: (moving: number[], to: number) => void;
  blocksOfPage: (key: string) => Block[] | null;
};

const pageIndexOf = (id: string) => Number(id.replace('page-', ''));

/**
 * The deck as rows, one chapter after another. It reads the same board data as
 * the cards — the same titles, the same statuses, the same undo — and reorders
 * through the same page function, so a move here lands in the deck exactly as a
 * dropped card does.
 */
export function ListView({
  pages,
  keys,
  cards,
  byKey,
  columns,
  notes,
  comments,
  dimmed,
  changeCounts,
  selected,
  jumpTo,
  onSelect,
  onOpenPage,
  onPatchCard,
  onMovePages,
  blocksOfPage,
}: Props) {
  const lr = useLrText();
  const locale = useLocale();
  const anchor = useRef<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const rowRefs = useRef(new Map<number, HTMLLIElement>());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!jumpTo) return;
    const row = rowRefs.current.get(jumpTo.index);
    row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    onSelect([jumpTo.index]);
  }, [jumpTo, onSelect]);

  const pick = (
    index: number,
    event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  ) => {
    if (event.shiftKey) {
      const from = anchor.current ?? index;
      const [a, b] = [Math.min(from, index), Math.max(from, index)];
      const range: number[] = [];
      for (let i = a; i <= b; i++) range.push(i);
      onSelect(range);
      return;
    }
    anchor.current = index;
    if (event.metaKey || event.ctrlKey) {
      onSelect(
        selected.includes(index)
          ? selected.filter((value) => value !== index)
          : [...selected, index].sort((a, b) => a - b),
      );
      return;
    }
    onSelect([index]);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = pageIndexOf(String(active.id));
    const to = pageIndexOf(String(over.id));
    if (!Number.isInteger(from) || !Number.isInteger(to)) return;
    onMovePages([from], to);
  };

  const titleOf = (index: number) => cards[index]?.title ?? pageName(pages[index]) ?? '';
  const timingOf = (index: number) => {
    const key = keys[index];
    return estimateSeconds({ notes: notes?.[index], blocks: key ? blocksOfPage(key) : null });
  };

  const starts = columnStarts(columns);
  const total = pages.length;

  return (
    <div className="h-full overflow-y-auto" data-lr-list-view>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-6 py-6">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={Array.from({ length: total }, (_, i) => `page-${i}`)}
            strategy={verticalListSortingStrategy}
          >
            {columns.map((column, columnIndex) => {
              const from = starts[columnIndex] ?? 0;
              const indices = Array.from({ length: column.size }, (_, i) => from + i).filter(
                (index) => index < total,
              );
              const progress = chapterProgress(
                byKey,
                indices.map((index) => keys[index]).filter((key): key is string => !!key),
              );
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: a chapter is its position in the deck
                <section key={`column-${columnIndex}`} data-lr-list-chapter>
                  <header className="mb-2 flex items-center gap-2 border-b border-hairline pb-1.5">
                    <span className="eyebrow truncate text-foreground">
                      {column.title || format(lr.board.columnFallback, { n: columnIndex + 1 })}
                    </span>
                    <span className="folio">{pad2(column.size)}</span>
                    {progress.total > 0 && <Progress progress={progress} />}
                  </header>
                  <ul className="flex flex-col">
                    {indices.map((index) => (
                      <ListRow
                        key={`page-${index}`}
                        id={`page-${index}`}
                        index={index}
                        title={titleOf(index)}
                        pageTitle={pageName(pages[index])}
                        card={cards[index]}
                        notes={notes?.[index]}
                        hasComment={comments[index] === true}
                        dimmed={dimmed[index] === true}
                        changeCount={changeCounts[index] ?? 0}
                        selected={selected.includes(index)}
                        editing={editing === index}
                        duration={formatDuration(timingOf(index).seconds, locale.id)}
                        onEdit={() => {
                          setEditing(index);
                          onSelect([index]);
                        }}
                        onStopEditing={() => setEditing(null)}
                        onTitle={(title) => onPatchCard(index, { title })}
                        onPick={(event) => pick(index, event)}
                        onOpen={() => onOpenPage(index)}
                        register={(node) => {
                          if (node) rowRefs.current.set(index, node);
                          else rowRefs.current.delete(index);
                        }}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

type RowProps = {
  id: string;
  index: number;
  title: string;
  pageTitle: string;
  card?: BoardCard;
  notes?: string;
  hasComment: boolean;
  dimmed: boolean;
  changeCount: number;
  selected: boolean;
  editing: boolean;
  duration: string;
  onEdit: () => void;
  onStopEditing: () => void;
  onTitle: (title: string) => void;
  onPick: (event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  onOpen: () => void;
  register: (node: HTMLLIElement | null) => void;
};

function ListRow({
  id,
  index,
  title,
  pageTitle,
  card,
  hasComment,
  dimmed,
  changeCount,
  selected,
  editing,
  duration,
  onEdit,
  onStopEditing,
  onTitle,
  onPick,
  onOpen,
  register,
}: RowProps) {
  const lr = useLrText();
  const labels = useStatusLabels();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const status = card?.status;

  return (
    <li
      ref={(node) => {
        setNodeRef(node);
        register(node);
      }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-lr-list-row
      data-page={index + 1}
      onClick={(event) => onPick(event)}
      onKeyDown={(event) => {
        // Space lifts a row for dragging, so only Enter picks one here.
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onPick(event);
      }}
      onDoubleClick={onOpen}
      className={cn(
        'group flex items-center gap-2 rounded-[6px] px-1.5 py-1.5 motion-safe:transition-colors hover:bg-muted/50',
        selected && 'bg-muted',
        isDragging && 'opacity-70 shadow-[var(--lr-shadow-1)]',
        dimmed && 'opacity-35',
      )}
    >
      <button
        type="button"
        aria-label={lr.board.dragPage}
        className="cursor-grab rounded p-1 text-muted-foreground/40 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={(event) => event.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <span className="w-6 shrink-0 text-right text-[11.5px] text-muted-foreground tabular-nums">
        {pad2(index + 1)}
      </span>
      <span
        title={status ? labels[status] : ''}
        className={cn(
          'size-2 shrink-0 rounded-full',
          status ? STATUS_STYLE[status].dot : 'bg-transparent ring-1 ring-hairline',
        )}
      />
      {editing ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: the field only exists once the title is clicked
          autoFocus
          defaultValue={title}
          aria-label={lr.board.renameCard}
          placeholder={lr.board.cardTitlePlaceholder}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              event.currentTarget.value = title;
              event.currentTarget.blur();
            }
          }}
          onBlur={(event) => {
            onStopEditing();
            const next = event.currentTarget.value.trim();
            if (next !== title) onTitle(next);
          }}
          className="min-w-0 flex-1 rounded-[4px] bg-background px-1.5 py-0.5 text-[13px] outline-none ring-1 ring-brand/40"
        />
      ) : (
        <button
          type="button"
          data-lr-list-title
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          className="min-w-0 flex-1 truncate rounded-[4px] px-1.5 py-0.5 text-left text-[13px] hover:bg-muted"
        >
          <span className={cn(!card?.title && 'text-muted-foreground')}>
            {title || pageTitle || lr.board.cardTitlePlaceholder}
          </span>
        </button>
      )}
      {changeCount > 0 && (
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {plural(changeCount, lr.board.pageChanges)}
        </span>
      )}
      {card?.memo && (
        <span title={card.memo} className="shrink-0 text-muted-foreground/70" data-lr-list-memo>
          <StickyNote className="size-3.5" />
          <span className="sr-only">{card.memo}</span>
        </span>
      )}
      {hasComment && <span className="size-1.5 shrink-0 rounded-full bg-[var(--lr-warning)]" />}
      <span className="w-16 shrink-0 text-right text-[11.5px] text-muted-foreground tabular-nums">
        {duration}
      </span>
    </li>
  );
}
