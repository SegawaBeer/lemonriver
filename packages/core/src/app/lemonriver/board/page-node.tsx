import { Handle, type NodeProps, Position } from '@xyflow/react';
import { BarChart3, Copy, Maximize2, MoveRight, PenLine, StickyNote, Trash2 } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
import { format, plural, useLocale } from '@/lib/use-locale';
import { cn, pad2 } from '@/lib/utils';
import { SlideCanvas } from '../../components/slide-canvas';
import type { DesignSystem } from '../../lib/design';
import { useNotes } from '../../lib/inspector/use-notes';
import { SlidePageProvider } from '../../lib/page-context';
import { CANVAS_WIDTH, type Page } from '../../lib/sdk';
import { useLrText } from '../text';
import { type PageRead, pageReadOf, rememberPageRead, sameRead } from './blocks/cache';
import { readBlocks } from './blocks/classify';
import { snapshotPage } from './blocks/snapshot';
import type { CardMetrics, CardSize } from './layout';
import { PAGE_ACTIONS, type PageAction } from './model/agent-tasks';
import {
  type BoardCard,
  CARD_STATUSES,
  type CardPatch,
  type CardStatus,
  isCardStatus,
} from './model/cards';
import { STATUS_STYLE } from './status-style';

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
  size: CardSize;
  metrics: CardMetrics;
  /** True when a filter is on and this card is not one of the ones picked out. */
  dimmed: boolean;
  /** How many block moves this page is a source or a target of. */
  changeCount?: number;
  /** The last apply touched this page: it lights up for a moment. */
  flash?: boolean;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMoveToEnd: (index: number) => void;
  onPatchCard: (index: number, patch: CardPatch) => void;
  /** Why the one-page agent actions are off, or null when they can run. */
  agentHint: string | null;
  onPageTask: (index: number, action: PageAction) => void;
};

const hiddenHandle = { opacity: 0, width: 1, height: 1, minWidth: 1, minHeight: 1 } as const;

const ASK_ICON: Record<PageAction, typeof PenLine> = {
  rewrite: PenLine,
  chart: BarChart3,
  memo: StickyNote,
  expand: Maximize2,
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
    size,
    metrics,
    dimmed,
    changeCount = 0,
    flash = false,
    ...actions
  } = data as unknown as PageNodeData;
  const t = useLocale();
  const lr = useLrText();
  const labels = useStatusLabels();
  const askLabels: Record<PageAction, string> = {
    rewrite: lr.board.askRewrite,
    chart: lr.board.askChart,
    memo: lr.board.askMemo,
    expand: lr.board.askExpand,
  };
  const status = card?.status;
  const [renaming, setRenaming] = useState(false);
  const [readFor, setReadFor] = useState<{ page: Page; read: PageRead } | null>(null);
  const onRead = useCallback(
    (next: PageRead) =>
      setReadFor((previous) =>
        previous && previous.page === PageComp && sameRead(previous.read, next)
          ? previous
          : { page: PageComp, read: next },
      ),
    [PageComp],
  );
  const read = readFor && readFor.page === PageComp ? readFor.read : pageReadOf(PageComp);
  const whole = read && 'whole' in read ? read.whole : null;
  // A menu hands focus back to the card as it closes, which would pull the caret
  // straight out of the name field "Rename" just opened.
  const renameFromMenu = useRef(false);

  const ring = selected
    ? 'ring-2 ring-brand'
    : status
      ? cn('ring-2', STATUS_STYLE[status].ring)
      : 'ring-1 ring-hairline hover:ring-muted-foreground/30';

  const statusLabel = status && (
    <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className={cn('size-2 rounded-full', STATUS_STYLE[status].dot)} />
      {labels[status]}
    </span>
  );

  /** What the board knows about this page's blocks, beside its status. */
  const meta = (whole || changeCount > 0 || statusLabel) && (
    <span className="ml-auto flex shrink-0 items-center gap-1.5">
      {whole && (
        <span
          title={lr.board.whole[whole]}
          className="rounded-[3px] bg-muted px-1 py-0.5 text-[10.5px] text-muted-foreground"
        >
          {lr.board.wholeBadge}
        </span>
      )}
      {changeCount > 0 && (
        <span className="rounded-[3px] bg-[var(--lr-accent)]/12 px-1 py-0.5 text-[10.5px] text-[var(--lr-accent)]">
          {format(plural(changeCount, lr.board.pageChanges), { n: changeCount })}
        </span>
      )}
      {statusLabel}
    </span>
  );

  const title = (
    <CardTitle
      title={card?.title}
      editing={renaming}
      disabled={!cardsReady}
      onEditingChange={setRenaming}
      onCommit={(next) => actions.onPatchCard(index, { title: next })}
    />
  );

  const view =
    size === 'title' ? (
      <div
        className={cn(
          'osd-board-card group/card flex items-center gap-2 rounded-[8px] bg-card px-2.5',
          'motion-safe:transition-[box-shadow,ring-color,scale,opacity]',
          ring,
          flash && 'osd-board-applied',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{ width: metrics.boxW, height: metrics.boxH, opacity: dimmed ? 0.35 : 1 }}
      >
        <span className="font-mono text-[10.5px] tracking-[0.08em] tabular-nums text-muted-foreground/70">
          {pad2(index + 1)}
        </span>
        {title}
        {meta}
      </div>
    ) : (
      <div
        className={cn(
          'osd-board-card group/card flex flex-col gap-2 rounded-[8px] bg-card p-1.5',
          'motion-safe:transition-[box-shadow,ring-color,scale,opacity]',
          ring,
          flash && 'osd-board-applied',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{ width: metrics.boxW, opacity: dimmed ? 0.35 : 1 }}
      >
        <div
          className="relative overflow-hidden rounded-[4px] bg-white ring-1 ring-hairline"
          style={{ width: metrics.cardW, height: metrics.cardH }}
        >
          <PagePreview
            page={PageComp}
            index={index}
            total={total}
            design={design}
            scale={metrics.cardW / CANVAS_WIDTH}
            onRead={onRead}
          />
        </div>
        <div className="flex h-6 items-center gap-2 px-0.5">
          <span className="font-mono text-[10.5px] tracking-[0.08em] tabular-nums text-muted-foreground/70">
            {pad2(index + 1)}
          </span>
          {title}
          {meta}
        </div>
        {size === 'large' && (
          <NoteStrip slideId={slideId} index={index} initial={note} height={metrics.noteH} />
        )}
        {size === 'large' && (
          <MemoStrip
            memo={card?.memo}
            disabled={!cardsReady}
            height={metrics.memoH}
            onCommit={(memo) => actions.onPatchCard(index, { memo })}
          />
        )}
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
          <ContextMenuSub>
            <ContextMenuSubTrigger>{lr.board.askAgent}</ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-[210px]">
              {PAGE_ACTIONS.map((action) => {
                const needsMemo = action === 'memo' && !card?.memo?.trim();
                const hint =
                  actions.agentHint ??
                  (changeCount > 0 ? lr.board.askHasChanges : null) ??
                  (needsMemo ? lr.board.askNeedsMemo : null);
                const Icon = ASK_ICON[action];
                return (
                  <ContextMenuItem
                    key={action}
                    disabled={hint !== null}
                    title={hint ?? undefined}
                    onClick={() => actions.onPageTask(index, action)}
                  >
                    <Icon />
                    {askLabels[action]}
                  </ContextMenuItem>
                );
              })}
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
 * re-render a page that can carry thousands of elements. It is also where a
 * page is read for its blocks: the DOM is already here, and the reading waits
 * for the browser to be idle so a board of thirty cards still opens quickly.
 */
export const PagePreview = memo(function PagePreview({
  page: PageComp,
  index,
  total,
  design,
  scale,
  onRead,
}: {
  page: Page;
  index: number;
  total: number;
  design?: DesignSystem;
  scale: number;
  onRead?: (read: PageRead) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const read = () => {
      const canvas = host.current?.querySelector<HTMLElement>('[data-osd-canvas]');
      if (!canvas) return;
      const next = readBlocks(snapshotPage(canvas, scale));
      rememberPageRead(PageComp, next);
      onRead?.(next);
    };

    const idle =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(read, { timeout: 2000 })
        : window.setTimeout(read, 200);

    // Editing a page in another tab, or a hot update to its source, redraws the
    // same component in place, so the read is refreshed when the canvas changes.
    const canvas = host.current?.querySelector<HTMLElement>('[data-osd-canvas]');
    const observer = canvas
      ? new MutationObserver(() => {
          if (timer !== null) window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            timer = null;
            if (!cancelled) read();
          }, 300);
        })
      : null;
    observer?.observe(canvas as HTMLElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (timer !== null) window.clearTimeout(timer);
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [PageComp, scale, onRead]);

  return (
    <div ref={host} className="h-full w-full">
      <SlideCanvas scale={scale} center={false} flat freezeMotion design={design}>
        <SlidePageProvider index={index} total={total}>
          <PageComp />
        </SlidePageProvider>
      </SlideCanvas>
    </div>
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
  height,
}: {
  slideId: string;
  index: number;
  initial?: string;
  height: number;
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
    <div className="nodrag nopan" style={{ height }}>
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
  height,
  onCommit,
}: {
  memo?: string;
  disabled: boolean;
  height: number;
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
    <div className="nodrag nopan" style={{ height }}>
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
