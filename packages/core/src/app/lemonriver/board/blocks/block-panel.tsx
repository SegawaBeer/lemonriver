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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlignLeft,
  BarChart3,
  GripVertical,
  Hash,
  Image as ImageIcon,
  ListChecks,
  Maximize2,
  MoreHorizontal,
  PenLine,
  Quote,
  Scissors,
  Sparkles,
  StickyNote,
  Type,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import type { DesignSystem } from '../../../lib/design';
import { CANVAS_WIDTH, type Page } from '../../../lib/sdk';
import { useLrText } from '../../text';
import { PAGE_ACTIONS, type PageAction } from '../model/agent-tasks';
import {
  type EffectiveBlock,
  effectiveBlocks,
  type Placement,
  parkedBlocks,
  placeBlock,
  type Spot,
  unparkBlock,
} from '../model/changes';
import type { SplitBlock } from '../model/restructure';
import { PagePreview } from '../page-node';
import type { PageRead } from './cache';
import type { BlockKind } from './classify';

const PANEL_WIDTH = 320;
const PREVIEW_WIDTH = 288;
const PREVIEW_SCALE = PREVIEW_WIDTH / CANVAS_WIDTH;

const KIND_ICON: Record<BlockKind, typeof Type> = {
  title: Type,
  point: ListChecks,
  text: AlignLeft,
  image: ImageIcon,
  chart: BarChart3,
  quote: Quote,
  number: Hash,
};

const blockInfo = (block: EffectiveBlock) => ({
  kind: block.kind,
  text: block.text,
  loc: block.loc,
});

const ASK_ICON: Record<PageAction, typeof Type> = {
  rewrite: PenLine,
  chart: BarChart3,
  memo: StickyNote,
  expand: Maximize2,
};

const DRAG_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  ' ',
  'Spacebar',
  'Enter',
  'Escape',
  'Tab',
]);

const listId = (block: string) => `block:${block}`;
const parkedId = (item: Placement) => `parked:${item.origin.page}:${item.origin.block}`;

export type BlockPanelProps = {
  slideId: string;
  pages: Page[];
  pageKeys: string[];
  design?: DesignSystem;
  /** The card last clicked, or null. */
  selected: number | null;
  changes: Placement[];
  onChanges: (next: Placement[]) => void;
  cardTitle: (index: number) => string;
  cardMemo: (index: number) => string;
  /** The four one-page actions, for the page in the panel. */
  agent: { hint: string | null; onTask: (action: PageAction) => void };
  /** The agent is applying the list: nothing here may be touched. */
  readOnly?: boolean;
  onSplit: (page: string, blocks: SplitBlock[]) => void;
};

/**
 * The blocks of one page, and the holding area. Nothing here reaches the deck:
 * every move is written down and handed over later.
 */
export function BlockPanel({
  slideId,
  pages,
  pageKeys,
  design,
  selected,
  changes,
  onChanges,
  cardTitle,
  cardMemo,
  agent,
  readOnly = false,
  onSplit,
}: BlockPanelProps) {
  const lr = useLrText();
  const askLabels: Record<PageAction, string> = {
    rewrite: lr.board.askRewrite,
    chart: lr.board.askChart,
    memo: lr.board.askMemo,
    expand: lr.board.askExpand,
  };
  const page = selected !== null ? pages[selected] : undefined;
  const pageKey = selected !== null ? (pageKeys[selected] ?? null) : null;
  const [readFor, setReadFor] = useState<{ page: Page; read: PageRead } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (page) setHovered(null);
  }, [page]);

  useEffect(() => {
    if (page) setChecked(new Set());
  }, [page]);

  const onRead = useCallback(
    (next: PageRead) => {
      if (page) setReadFor({ page, read: next });
    },
    [page],
  );
  // A read belongs to the page it was taken from; one still arriving from the
  // page clicked a moment ago must not be drawn as this page's blocks.
  const read = readFor && readFor.page === page ? readFor.read : undefined;

  const original = read && 'blocks' in read ? read.blocks : [];
  const whole = read && 'whole' in read ? read.whole : null;
  const effective = pageKey ? effectiveBlocks(pageKey, original, changes) : [];
  const parked = parkedBlocks(changes);

  const originOf = useCallback(
    (block: EffectiveBlock): (Spot & { block: string }) | null => {
      if (block.pending && block.from) {
        const found = changes.find(
          (item) => item.origin.page === block.from && item.origin.block === block.id,
        );
        return found ? found.origin : null;
      }
      if (!pageKey) return null;
      const at = original.findIndex((candidate) => candidate.id === block.id);
      if (at < 0) return null;
      return { page: pageKey, before: original[at + 1]?.id ?? null, block: block.id };
    },
    [changes, original, pageKey],
  );

  const moveTo = useCallback(
    (block: EffectiveBlock, target: Spot) => {
      const origin = originOf(block);
      if (!origin) return;
      const existing = changes.find(
        (item) => item.origin.page === origin.page && item.origin.block === origin.block,
      );
      onChanges(placeBlock(changes, origin, blockInfo(block), target, existing?.code));
    },
    [changes, onChanges, originOf],
  );

  const park = useCallback(
    async (block: EffectiveBlock) => {
      const origin = originOf(block);
      if (!origin) return;
      if (!block.loc) {
        toast.error(lr.board.parkNeedsSource);
        return;
      }
      let code: string | null = null;
      try {
        const res = await fetch('/__board/blocks/source', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slideId, loc: block.loc, text: block.text }),
        });
        if (res.ok) code = ((await res.json()) as { code?: string }).code ?? null;
      } catch {
        code = null;
      }
      if (!code) {
        toast.error(lr.board.parkNeedsSource);
        return;
      }
      onChanges(placeBlock(changes, origin, blockInfo(block), 'parked', code));
    },
    [changes, lr.board.parkNeedsSource, onChanges, originOf, slideId],
  );

  const unpark = useCallback(
    (item: Placement, target: Spot) => {
      onChanges(unparkBlock(changes, item, target));
    },
    [changes, onChanges],
  );

  const toggleChecked = useCallback((id: string) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Every block on the page is already a page of its own, and none of them is
  // the page: the split is a part of it.
  const canSplit =
    !readOnly && pageKey !== null && !whole && checked.size > 0 && checked.size < effective.length;

  const split = useCallback(() => {
    if (!pageKey) return;
    const picked = effective.filter((block) => checked.has(block.id));
    if (picked.length === 0) return;
    onSplit(
      pageKey,
      picked.map((block) => ({ id: block.id, kind: block.kind, text: block.text })),
    );
    setChecked(new Set());
  }, [checked, effective, onSplit, pageKey]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : null;
      if (!overId || activeId === overId) return;

      const fromParking = activeId.startsWith('parked:');
      const toParking = overId.startsWith('parked:');
      if (fromParking && toParking) return;

      if (!fromParking && toParking) {
        const moving = effective.find((block) => listId(block.id) === activeId);
        if (moving) void park(moving);
        return;
      }

      const overIndex = effective.findIndex((block) => listId(block.id) === overId);

      if (fromParking) {
        const item = parked.find((placement) => parkedId(placement) === activeId);
        if (!item || !pageKey) return;
        unpark(item, { page: pageKey, before: overIndex >= 0 ? effective[overIndex].id : null });
        return;
      }

      const fromIndex = effective.findIndex((block) => listId(block.id) === activeId);
      const moving = effective[fromIndex];
      if (!moving || overIndex < 0) return;
      const order = arrayMove(effective, fromIndex, overIndex);
      const at = order.findIndex((block) => block.id === moving.id);
      moveTo(moving, { page: pageKey ?? '', before: order[at + 1]?.id ?? null });
    },
    [effective, moveTo, pageKey, park, parked, unpark],
  );

  const pageOptions = useMemo(
    () =>
      pages.map((_, index) => ({
        key: pageKeys[index] ?? '',
        number: format(lr.board.blockPageOption, { n: index + 1 }),
        title: cardTitle(index),
      })),
    [pages, pageKeys, cardTitle, lr.board.blockPageOption],
  );

  const hoveredBox = useMemo(() => {
    const block = effective.find((candidate) => candidate.id === hovered);
    return block?.box ?? null;
  }, [effective, hovered]);

  // A picture or a chart has no words, so its row is named by what it is and
  // which one of them it is on this page.
  const labels = useMemo(() => {
    const counts = new Map<BlockKind, number>();
    const named = new Map<string, string>();
    for (const block of effective) {
      if (block.text) {
        named.set(block.id, block.text);
        continue;
      }
      const n = (counts.get(block.kind) ?? 0) + 1;
      counts.set(block.kind, n);
      named.set(
        block.id,
        format(lr.board.blockKindN, { kind: lr.board.blockKinds[block.kind], n }),
      );
    }
    return named;
  }, [effective, lr.board]);

  const labelOf = useCallback(
    (block: EffectiveBlock) =>
      labels.get(block.id) ?? block.text ?? lr.board.blockKinds[block.kind],
    [labels, lr.board],
  );

  const menuFor = (block: EffectiveBlock): ReactNode => (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <span className="truncate">{lr.board.moveBlockTo}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-[320px] min-w-[190px] overflow-y-auto">
          {pageOptions.map((option) => (
            <DropdownMenuItem
              key={option.key}
              onClick={() => moveTo(block, { page: option.key, before: null })}
            >
              <span className="shrink-0 tabular-nums">{option.number}</span>
              <span className="min-w-0 truncate text-muted-foreground">{option.title}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem onClick={() => void park(block)}>{lr.board.parkBlock}</DropdownMenuItem>
    </>
  );

  const parkingMenuFor = (item: Placement): ReactNode => (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="truncate">{lr.board.unparkBlockTo}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-[320px] min-w-[190px] overflow-y-auto">
        {pageOptions.map((option) => (
          <DropdownMenuItem
            key={option.key}
            onClick={() => unpark(item, { page: option.key, before: null })}
          >
            <span className="shrink-0 tabular-nums">{option.number}</span>
            <span className="min-w-0 truncate text-muted-foreground">{option.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );

  return (
    // Board shortcuts (delete, escape) and React Flow's own delete key stop at
    // the panel: inside it those keys belong to the blocks.
    <aside
      data-lr-block-panel
      style={{ width: PANEL_WIDTH }}
      onKeyDown={(event) => {
        const mod = event.metaKey || event.ctrlKey;
        if (mod && (event.key === 'z' || event.key === 'Z')) return;
        // Arrow and pickup keys have to reach the drag sensor on the document;
        // every other board shortcut ends here.
        if (DRAG_KEYS.has(event.key)) return;
        event.stopPropagation();
      }}
      className="flex shrink-0 flex-col overflow-hidden border-l border-hairline bg-background"
    >
      <div className="shrink-0 border-b border-hairline p-4">
        {page ? (
          <div
            className="relative overflow-hidden rounded-[4px] bg-white ring-1 ring-hairline"
            style={{ width: PREVIEW_WIDTH, height: (PREVIEW_WIDTH * 9) / 16 }}
          >
            <PagePreview
              page={page}
              index={selected ?? 0}
              total={pages.length}
              design={design}
              scale={PREVIEW_SCALE}
              onRead={onRead}
            />
            {hoveredBox && (
              <div
                className="pointer-events-none absolute rounded-[2px] ring-2 ring-[var(--lr-accent)]"
                style={{
                  left: hoveredBox.x * PREVIEW_SCALE,
                  top: hoveredBox.y * PREVIEW_SCALE,
                  width: hoveredBox.w * PREVIEW_SCALE,
                  height: hoveredBox.h * PREVIEW_SCALE,
                }}
              />
            )}
          </div>
        ) : (
          <p className="grid h-[162px] place-items-center px-4 text-center text-[12.5px] text-muted-foreground">
            {lr.board.blockPanelEmpty}
          </p>
        )}
      </div>

      {page && (
        <div className="shrink-0 border-b border-hairline px-4 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              data-lr-ask-agent
              disabled={readOnly}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}
            >
              <Sparkles />
              {lr.board.askAgent}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[210px]">
              {PAGE_ACTIONS.map((action) => {
                const needsMemo = action === 'memo' && !cardMemo(selected ?? 0).trim();
                const hint = agent.hint ?? (needsMemo ? lr.board.askNeedsMemo : null);
                const Icon = ASK_ICON[action];
                return (
                  <DropdownMenuItem
                    key={action}
                    disabled={readOnly || hint !== null}
                    title={hint ?? undefined}
                    onClick={() => agent.onTask(action)}
                  >
                    <Icon />
                    {askLabels[action]}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {canSplit && (
        <div className="shrink-0 border-b border-hairline px-4 py-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            data-lr-split-page
            onClick={split}
          >
            <Scissors />
            {lr.board.splitPage}
          </Button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {!page ? null : whole ? (
            <p className="px-2 py-3 text-[12.5px] text-muted-foreground">{lr.board.whole[whole]}</p>
          ) : !read ? (
            <p className="px-2 py-3 text-[12.5px] text-muted-foreground">{lr.board.loading}</p>
          ) : effective.length === 0 ? (
            <p className="px-2 py-3 text-[12.5px] text-muted-foreground">
              {lr.board.blockPanelEmpty}
            </p>
          ) : (
            <SortableContext
              items={effective.map((block) => listId(block.id))}
              strategy={verticalListSortingStrategy}
            >
              <ul data-lr-block-list className="flex flex-col gap-0.5">
                {effective.map((block) => (
                  <BlockRow
                    key={listId(block.id)}
                    id={listId(block.id)}
                    kind={block.kind}
                    label={labelOf(block)}
                    readOnly={readOnly}
                    checked={checked.has(block.id)}
                    onToggle={() => toggleChecked(block.id)}
                    pending={block.pending === true && block.from !== pageKey}
                    from={
                      block.pending && block.from && block.from !== pageKey
                        ? format(lr.board.blockFrom, {
                            n: pageKeys.indexOf(block.from) + 1,
                          })
                        : undefined
                    }
                    onHover={() => setHovered(block.id)}
                    onHoverEnd={() => setHovered(null)}
                  >
                    {menuFor(block)}
                  </BlockRow>
                ))}
              </ul>
            </SortableContext>
          )}
        </div>

        <div className="shrink-0 border-t border-hairline bg-muted/25 px-2 py-2">
          <p className="px-2 pb-1.5 pt-1 text-[11.5px] font-medium text-muted-foreground">
            {format(lr.board.parking, { n: parked.length })}
          </p>
          {parked.length === 0 ? (
            <p className="px-2 pb-2 text-[12px] text-muted-foreground/70">
              {lr.board.parkingEmpty}
            </p>
          ) : (
            <SortableContext
              items={parked.map((item) => parkedId(item))}
              strategy={verticalListSortingStrategy}
            >
              <ul
                data-lr-parking-list
                className="flex max-h-[280px] flex-col gap-0.5 overflow-y-auto"
              >
                {parked.map((item) => (
                  <BlockRow
                    key={parkedId(item)}
                    id={parkedId(item)}
                    kind={item.block.kind}
                    label={item.block.text || lr.board.blockKinds[item.block.kind]}
                    readOnly={readOnly}
                    onHover={() => {}}
                    onHoverEnd={() => {}}
                  >
                    {parkingMenuFor(item)}
                  </BlockRow>
                ))}
              </ul>
            </SortableContext>
          )}
        </div>
      </DndContext>
    </aside>
  );
}

function BlockRow({
  id,
  kind,
  label,
  readOnly,
  checked,
  onToggle,
  pending,
  from,
  onHover,
  onHoverEnd,
  children,
}: {
  id: string;
  kind: BlockKind;
  label: string;
  readOnly: boolean;
  checked?: boolean;
  /** Present on the blocks of a page: they can be picked to leave it. */
  onToggle?: () => void;
  pending?: boolean;
  from?: string;
  onHover: () => void;
  onHoverEnd: () => void;
  children: ReactNode;
}) {
  const lr = useLrText();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: readOnly,
  });
  const Icon = KIND_ICON[kind];
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-lr-block-row
      data-lr-block-kind={kind}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      className={cn(
        'group/row flex items-center gap-1 rounded-[6px] px-1 py-1 text-[12.5px]',
        'hover:bg-muted/60',
        isDragging && 'bg-card opacity-80 shadow-edge',
      )}
    >
      {onToggle && !readOnly && (
        <input
          type="checkbox"
          checked={checked === true}
          onChange={onToggle}
          aria-label={label}
          className="size-3.5 shrink-0 cursor-pointer accent-[var(--lr-accent)]"
        />
      )}
      <button
        type="button"
        aria-label={lr.board.blockDrag}
        disabled={readOnly}
        className="cursor-grab rounded p-1 text-muted-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {pending && (
        <span
          title={from}
          className="flex shrink-0 items-center gap-1 text-[10.5px] text-[var(--lr-accent)]"
        >
          <span className="size-1.5 rounded-full bg-[var(--lr-accent)]" />
          {lr.board.blockPending}
        </span>
      )}
      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger
            type="button"
            aria-label={lr.board.blockMenu}
            className="rounded p-1 text-muted-foreground/60 opacity-0 outline-none hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40 group-hover/row:opacity-100"
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[190px]">
            {children}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
