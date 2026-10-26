import { Handle, type NodeProps, Position } from '@xyflow/react';
import { Copy, MoveRight, Trash2 } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { format, useLocale } from '@/lib/use-locale';
import { cn, pad2 } from '@/lib/utils';
import { SlideCanvas } from '../../components/slide-canvas';
import type { DesignSystem } from '../../lib/design';
import { useNotes } from '../../lib/inspector/use-notes';
import { SlidePageProvider } from '../../lib/page-context';
import { CANVAS_WIDTH, type Page } from '../../lib/sdk';
import { useLrText } from '../text';
import { CARD_H, CARD_W, MEMO_H, NOTE_H } from './layout';
import {
  type BoardCard,
  CARD_STATUSES,
  type CardPatch,
  type CardStatus,
  isCardStatus,
} from './model/cards';

export type PageNodeData = {
  slideId: string;
  page: Page;
  index: number;
  total: number;
  note?: string;
  card?: BoardCard;
  /** False until the board's own data has loaded, so nothing can be written over it. */
  cardsReady: boolean;
  /** Whether a link can be drawn from this card right now. */
  canLink: boolean;
  design?: DesignSystem;
  canDelete: boolean;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMoveToEnd: (index: number) => void;
  onPatchCard: (index: number, patch: CardPatch) => void;
};

const hiddenHandle = { opacity: 0, width: 1, height: 1, minWidth: 1, minHeight: 1 } as const;

const STATUS_STYLE: Record<CardStatus, { dot: string; ring: string }> = {
  todo: { dot: 'bg-muted-foreground/50', ring: 'ring-muted-foreground/35' },
  doing: { dot: 'bg-blue-500', ring: 'ring-blue-500/70' },
  review: { dot: 'bg-amber-500', ring: 'ring-amber-500/75' },
  done: { dot: 'bg-emerald-500', ring: 'ring-emerald-500/70' },
};

export function useStatusLabels(): Record<CardStatus, string> {
  const lr = useLrText();
  return {
    todo: lr.board.statusTodo,
    doing: lr.board.statusDoing,
    review: lr.board.statusReview,
    done: lr.board.statusDone,
  };
}

export function PageNode({ data, selected, dragging }: NodeProps) {
  const {
    slideId,
    page: PageComp,
    index,
    total,
    note,
    card,
    cardsReady,
    canLink,
    design,
    canDelete,
    ...actions
  } = data as unknown as PageNodeData;
  const t = useLocale();
  const lr = useLrText();
  const labels = useStatusLabels();
  const status = card?.status;
  const [renaming, setRenaming] = useState(false);
  // A menu hands focus back to the card as it closes, which would pull the caret
  // straight out of the name field "Rename" just opened.
  const renameFromMenu = useRef(false);

  const view = (
    <div
      className={cn(
        'osd-board-card group/card flex flex-col gap-2 rounded-[8px] bg-card p-1.5',
        'motion-safe:transition-[box-shadow,ring-color,scale]',
        selected
          ? 'ring-2 ring-brand'
          : status
            ? cn('ring-2', STATUS_STYLE[status].ring)
            : 'ring-1 ring-hairline hover:ring-muted-foreground/30',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
      style={{ width: CARD_W + 12 }}
    >
      <div
        className="relative overflow-hidden rounded-[4px] bg-white ring-1 ring-hairline"
        style={{ width: CARD_W, height: CARD_H }}
      >
        <PagePreview page={PageComp} index={index} total={total} design={design} />
      </div>
      <div className="flex h-6 items-center gap-2 px-0.5">
        <span className="font-mono text-[10.5px] tracking-[0.08em] tabular-nums text-muted-foreground/70">
          {pad2(index + 1)}
        </span>
        <CardTitle
          title={card?.title}
          editing={renaming}
          disabled={!cardsReady}
          onEditingChange={setRenaming}
          onCommit={(title) => actions.onPatchCard(index, { title })}
        />
        {status && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn('size-2 rounded-full', STATUS_STYLE[status].dot)} />
            {labels[status]}
          </span>
        )}
      </div>
      <NoteStrip slideId={slideId} index={index} initial={note} />
      <MemoStrip
        memo={card?.memo}
        disabled={!cardsReady}
        onCommit={(memo) => actions.onPatchCard(index, { memo })}
      />
    </div>
  );

  return (
    <>
      <Handle type="target" position={Position.Top} style={hiddenHandle} isConnectable={false} />
      <Handle
        type="target"
        id="left"
        position={Position.Left}
        style={hiddenHandle}
        isConnectable={false}
      />
      <ContextMenu>
        <ContextMenuTrigger
          aria-label={format(t.thumbnailRail.pageActionsAria, { n: index + 1 })}
          render={view}
        />
        <ContextMenuContent
          className="min-w-[180px]"
          finalFocus={() => {
            const keep = !renameFromMenu.current;
            renameFromMenu.current = false;
            return keep;
          }}
        >
          <ContextMenuItem
            disabled={!cardsReady}
            onClick={() => {
              renameFromMenu.current = true;
              setRenaming(true);
            }}
          >
            {lr.board.renameCard}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={!cardsReady}>{lr.board.status}</ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-[150px]">
              <ContextMenuRadioGroup
                value={status ?? ''}
                onValueChange={(value: unknown) =>
                  actions.onPatchCard(index, { status: isCardStatus(value) ? value : null })
                }
              >
                <ContextMenuRadioItem value="" closeOnClick>
                  {lr.board.statusNone}
                </ContextMenuRadioItem>
                {CARD_STATUSES.map((value) => (
                  <ContextMenuRadioItem key={value} value={value} closeOnClick>
                    <span className={cn('size-2 rounded-full', STATUS_STYLE[value].dot)} />
                    {labels[value]}
                  </ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => actions.onDuplicate(index)}>
            <Copy />
            {t.thumbnailRail.duplicatePage}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={index === total - 1}
            onClick={() => actions.onMoveToEnd(index)}
          >
            <MoveRight />
            {lr.board.moveToEnd}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            disabled={!canDelete}
            onClick={() => {
              if (canDelete) actions.onDelete(index);
            }}
          >
            <Trash2 />
            {t.thumbnailRail.deletePage}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <Handle type="source" position={Position.Bottom} style={hiddenHandle} isConnectable={false} />
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        style={hiddenHandle}
        isConnectable={false}
      />
      <Handle
        type="source"
        id="link"
        position={Position.Right}
        title={lr.board.linkHandle}
        className={cn('osd-board-link-handle', !canLink && 'hidden')}
        isConnectableStart={canLink}
        isConnectableEnd={false}
      />
    </>
  );
}

/**
 * The live page, kept apart so editing a card's title, status or memo does not
 * re-render a page that can carry thousands of elements.
 */
const PagePreview = memo(function PagePreview({
  page: PageComp,
  index,
  total,
  design,
}: {
  page: Page;
  index: number;
  total: number;
  design?: DesignSystem;
}) {
  return (
    <SlideCanvas scale={CARD_W / CANVAS_WIDTH} center={false} flat freezeMotion design={design}>
      <SlidePageProvider index={index} total={total}>
        <PageComp />
      </SlidePageProvider>
    </SlideCanvas>
  );
});

/** The card's own name, which the deck never sees. Empty until someone names it. */
function CardTitle({
  title,
  editing,
  disabled,
  onEditingChange,
  onCommit,
}: {
  title?: string;
  editing: boolean;
  disabled: boolean;
  onEditingChange: (editing: boolean) => void;
  onCommit: (title: string) => void;
}) {
  const lr = useLrText();
  const ref = useRef<HTMLInputElement | null>(null);

  // Opened from the context menu, the field mounts while the menu is still
  // handing focus back; waiting a frame keeps the caret here.
  useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={ref}
        defaultValue={title ?? ''}
        aria-label={lr.board.renameCard}
        placeholder={lr.board.cardTitlePlaceholder}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.currentTarget.value = title ?? '';
            e.currentTarget.blur();
          }
        }}
        onBlur={(e) => {
          onEditingChange(false);
          const next = e.currentTarget.value.trim();
          if (next !== (title ?? '')) onCommit(next);
        }}
        className="nodrag nopan min-w-0 flex-1 rounded-[4px] bg-muted/60 px-1.5 py-0.5 text-[12.5px] font-medium text-foreground outline-none ring-1 ring-brand/40"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onEditingChange(true)}
      aria-label={lr.board.renameCard}
      className={cn(
        'nodrag nopan min-w-0 truncate rounded-[4px] px-1.5 py-0.5 text-left text-[12.5px]',
        'motion-safe:transition-[background-color,opacity] hover:bg-muted/60 disabled:pointer-events-none',
        title
          ? 'font-medium text-foreground'
          : 'text-muted-foreground/45 opacity-0 group-hover/card:opacity-100',
      )}
    >
      {title || lr.board.cardTitlePlaceholder}
    </button>
  );
}

/**
 * The deck's own speaker notes, edited on the card. Writes go through the same
 * debounced route the notes drawer uses, so the board and the editor never hold
 * two different ideas of a page's script.
 */
function NoteStrip({
  slideId,
  index,
  initial,
}: {
  slideId: string;
  index: number;
  initial?: string;
}) {
  const t = useLocale();
  const lr = useLrText();
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const { value, setValue, status, flush } = useNotes(slideId, index, initial);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const shared = 'w-full rounded-[4px] px-1.5 py-1 text-left text-[11px] leading-[1.45]';

  return (
    <div className="nodrag nopan" style={{ height: NOTE_H }}>
      {editing ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            setEditing(false);
            void flush();
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              e.currentTarget.blur();
            }
          }}
          placeholder={lr.board.notesPlaceholder}
          className={cn(
            shared,
            'nowheel h-full resize-none bg-muted/50 text-foreground outline-none',
            'ring-1 ring-brand/40 placeholder:text-muted-foreground/50',
          )}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            shared,
            'h-full overflow-hidden bg-transparent',
            'motion-safe:transition-[background-color,opacity] hover:bg-muted/60',
            // An empty strip stays invisible so a board without notes reads clean.
            value
              ? 'text-muted-foreground'
              : 'text-muted-foreground/45 opacity-0 group-hover/card:opacity-100',
          )}
        >
          <span className="line-clamp-3 whitespace-pre-wrap">
            {value || lr.board.notesPlaceholder}
          </span>
        </button>
      )}
      {status.kind === 'error' && (
        <span className="sr-only">
          {format(t.notesDrawer.statusError, { msg: status.message })}
        </span>
      )}
    </div>
  );
}

/**
 * A memo for whoever is building the deck — "Q3 numbers still missing". It is
 * board data, so it never reaches the deck, the presenter view or an export,
 * and it is tinted so it cannot be mistaken for the script above it.
 */
function MemoStrip({
  memo,
  disabled,
  onCommit,
}: {
  memo?: string;
  disabled: boolean;
  onCommit: (memo: string) => void;
}) {
  const lr = useLrText();
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const editing = draft !== null;

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const shared = 'w-full rounded-[4px] px-1.5 py-1 text-left text-[11px] leading-[1.45]';

  return (
    <div className="nodrag nopan" style={{ height: MEMO_H }}>
      {editing ? (
        <textarea
          ref={ref}
          value={draft}
          aria-label={lr.board.memoPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const next = draft.trim();
            setDraft(null);
            if (next !== (memo ?? '')) onCommit(next);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') e.currentTarget.blur();
          }}
          placeholder={lr.board.memoPlaceholder}
          className={cn(
            shared,
            'nowheel h-full resize-none bg-amber-500/10 text-foreground outline-none',
            'ring-1 ring-amber-500/50 placeholder:text-muted-foreground/50',
          )}
        />
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setDraft(memo ?? '')}
          className={cn(
            shared,
            'h-full overflow-hidden disabled:pointer-events-none',
            'motion-safe:transition-[background-color,opacity]',
            memo
              ? 'bg-amber-500/10 text-amber-900 hover:bg-amber-500/15 dark:text-amber-200'
              : 'text-muted-foreground/45 opacity-0 hover:bg-amber-500/10 group-hover/card:opacity-100',
          )}
        >
          <span className="line-clamp-2 whitespace-pre-wrap">
            {memo || lr.board.memoPlaceholder}
          </span>
        </button>
      )}
    </div>
  );
}
