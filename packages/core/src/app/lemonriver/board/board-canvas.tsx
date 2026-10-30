import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  type EdgeTypes,
  type InternalNode,
  MarkerType,
  MiniMap,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type OnConnectEnd,
  type OnNodeDrag,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useInternalNode,
  useReactFlow,
} from '@xyflow/react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Columns3,
  GripVertical,
  Link2,
  Link2Off,
  Maximize2,
  Minus,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from '@/lib/use-locale';
import { cn, pad2 } from '@/lib/utils';
import type { DesignSystem } from '../../lib/design';
import type { Page } from '../../lib/sdk';
import { useLrText } from '../text';
import {
  type BoardLayout,
  type Box,
  type CardSize,
  cardAtPoint,
  cardMetrics,
  gapAtPoint,
  identityOrder,
  layoutBoard,
  linkCurve,
  orderAfterMoveMany,
  slotAtPoint,
} from './layout';
import type { PageAction } from './model/agent-tasks';
import type { BoardCard, CardPatch, LinkedPair, LinkKind } from './model/cards';
import { type BoardColumn, type ChapterProgress, columnsAfterMoveMany } from './model/structure';
import { PageNode, type PageNodeData } from './page-node';
import { Progress } from './views/progress';
import '@xyflow/react/dist/base.css';
import './board.css';

type Props = {
  slideId: string;
  pages: Page[];
  columns: BoardColumn[];
  notes?: (string | undefined)[];
  cards: (BoardCard | undefined)[];
  cardsReady: boolean;
  /** Linked pages, as deck positions. */
  links: LinkedPair[];
  showLinks: boolean;
  /** How far along each chapter is, one per chapter. */
  progress: ChapterProgress[];
  design?: DesignSystem;
  size: CardSize;
  /** One flag per chapter: folded chapters draw no cards. */
  collapsed: boolean[];
  /** One flag per page: cards the filter does not pick out are drawn faint. */
  dimmed: boolean[];
  /** One count per page: block moves waiting to be applied. */
  changeCounts: number[];
  /** Pages the last apply touched, lit for a moment. */
  flashed: number[];
  /** Selected pages, by deck position. */
  selected: number[];
  onSelect: (indices: number[]) => void;
  onOpenPage: (index: number) => void;
  onMovePages: (moving: number[], to: number) => void;
  onMoveToNewChapter: (from: number, boundary: number) => void;
  onRenameColumn: (index: number, title: string) => void;
  onAddPage: (columnIndex: number) => void;
  onAddChapter: (after: number) => void;
  onDeleteChapter: (index: number) => void;
  onToggleCollapse: (index: number) => void;
  onMoveChapter: (from: number, to: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMoveToEnd: (index: number) => void;
  onPatchCard: (index: number, patch: CardPatch) => void;
  onLink: (a: number, b: number) => void;
  onUnlink: (a: number, b: number) => void;
  onSetLinkKind: (a: number, b: number, kind: LinkKind | null) => void;
  /** Bring a page into view and select it. */
  onJump: (index: number) => void;
  onToggleLinks: () => void;
  /** Why the one-page agent actions are off, or null when they can run. */
  agentHint: string | null;
  onPageTask: (index: number, action: PageAction) => void;
  /** 'planning' while the agent is out, the number of titles when ready. */
  planFor: (column: number) => 'planning' | number | null;
  onFillChapter: (column: number) => void;
  onViewPlan: (column: number) => void;
};

type ColumnLabelData = {
  title: string;
  count: number;
  index: number;
  width: number;
  collapsed: boolean;
  canDelete: boolean;
  /** How much of this chapter is finished. */
  progress: ChapterProgress;
  /** 'planning' while the agent is out, the number of titles when ready, else null. */
  plan: 'planning' | number | null;
  onRename: (index: number, title: string) => void;
  onAddPage: (index: number) => void;
  onAddChapter: (after: number) => void;
  onDelete: (index: number) => void;
  onToggleCollapse: (index: number) => void;
  onFillChapter: (index: number) => void;
  onViewPlan: (index: number) => void;
};

function ColumnLabel({ data }: NodeProps) {
  const {
    title,
    count,
    index,
    width,
    collapsed,
    canDelete,
    progress,
    plan,
    onRename,
    onAddPage,
    onAddChapter,
    onDelete,
    onToggleCollapse,
    onFillChapter,
    onViewPlan,
  } = data as unknown as ColumnLabelData;
  const lr = useLrText();
  const [editing, setEditing] = useState(false);

  return (
    <div className="pointer-events-auto flex items-baseline gap-1.5" style={{ width }}>
      <GripVertical
        className="size-3.5 shrink-0 cursor-grab self-center text-muted-foreground/40"
        strokeWidth={1.8}
      />
      <button
        type="button"
        onClick={() => onToggleCollapse(index)}
        aria-label={collapsed ? lr.board.expand : lr.board.collapse}
        aria-expanded={!collapsed}
        className="nodrag flex size-5 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground/60 motion-safe:transition-colors hover:bg-muted hover:text-foreground"
      >
        {collapsed ? (
          <ChevronRight className="size-3.5" strokeWidth={2} />
        ) : (
          <ChevronDown className="size-3.5" strokeWidth={2} />
        )}
      </button>
      {editing ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: the field only exists once the title is clicked
          autoFocus
          defaultValue={title}
          aria-label={lr.board.renameColumn}
          placeholder={lr.board.columnTitlePlaceholder}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              e.currentTarget.value = title;
              e.currentTarget.blur();
            }
          }}
          onBlur={(e) => {
            setEditing(false);
            const next = e.currentTarget.value.trim();
            if (next && next !== title) onRename(index, next);
          }}
          className="nodrag eyebrow min-w-0 flex-1 rounded-[4px] bg-muted/60 px-1.5 py-1 text-foreground outline-none ring-1 ring-brand/40"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={lr.board.renameColumn}
          className="nodrag eyebrow min-w-0 truncate rounded-[4px] px-1.5 py-1 text-left motion-safe:transition-colors hover:bg-muted/60"
        >
          {title}
        </button>
      )}
      <span className="folio">{pad2(count)}</span>
      {progress.total > 0 && <Progress progress={progress} />}
      <div className={cn('flex items-center', progress.total === 0 && 'ml-auto')}>
        {plan === 'planning' ? (
          <span className="mr-1 text-[11px] text-muted-foreground" data-lr-planning>
            {lr.board.planning}
          </span>
        ) : typeof plan === 'number' ? (
          <button
            type="button"
            onClick={() => onViewPlan(index)}
            data-lr-view-plan
            className="nodrag mr-1 rounded-[4px] px-1.5 py-0.5 text-[11px] text-[var(--lr-accent)] motion-safe:transition-colors hover:bg-muted"
          >
            {format(lr.board.viewPlan, { n: plan })}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onFillChapter(index)}
          aria-label={lr.board.fillChapter}
          title={lr.board.fillChapter}
          data-lr-fill-chapter
          className="nodrag flex size-6 items-center justify-center rounded-[4px] text-muted-foreground/60 motion-safe:transition-colors hover:bg-muted hover:text-foreground"
        >
          <Sparkles className="size-3.5" strokeWidth={1.9} />
        </button>
        <button
          type="button"
          onClick={() => onAddPage(index)}
          aria-label={lr.board.addPage}
          className={cn(
            'nodrag flex size-6 items-center justify-center rounded-[4px] text-muted-foreground/60',
            'motion-safe:transition-colors hover:bg-muted hover:text-foreground',
          )}
        >
          <Plus className="size-3.5" strokeWidth={1.9} />
        </button>
        <button
          type="button"
          onClick={() => onAddChapter(index)}
          aria-label={lr.board.addChapter}
          className="nodrag flex size-6 items-center justify-center rounded-[4px] text-muted-foreground/60 motion-safe:transition-colors hover:bg-muted hover:text-foreground"
        >
          <Columns3 className="size-3.5" strokeWidth={1.9} />
        </button>
        <button
          type="button"
          disabled={!canDelete}
          onClick={() => onDelete(index)}
          aria-label={lr.board.deleteChapter}
          className="nodrag flex size-6 items-center justify-center rounded-[4px] text-muted-foreground/60 motion-safe:transition-colors hover:bg-muted hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
        >
          <X className="size-3.5" strokeWidth={1.9} />
        </button>
      </div>
    </div>
  );
}

/** Marks the slot a dragged card will take, so the drop point is visible. */
function DropSlot({ data }: NodeProps) {
  const { width, height, newChapter } = data as unknown as {
    width: number;
    height: number;
    newChapter: boolean;
  };
  return (
    <div
      className={cn(
        'rounded-[8px] border-2 border-dashed border-brand/45 bg-brand/[0.04]',
        newChapter && 'flex items-center justify-center border-brand/70 bg-brand/[0.08]',
      )}
      style={{ width, height }}
    >
      {newChapter && <Plus className="size-6 text-brand/70" strokeWidth={1.8} />}
    </div>
  );
}

const nodeTypes: NodeTypes = { page: PageNode, columnLabel: ColumnLabel, dropSlot: DropSlot };

type LinkEdgeData = {
  a: number;
  b: number;
  kind?: LinkKind;
  onUnlink: (a: number, b: number) => void;
  onSetKind: (a: number, b: number, kind: LinkKind | null) => void;
  onJump: (index: number) => void;
};

function boxOf(node: InternalNode | undefined): Box | null {
  if (!node) return null;
  const { x, y } = node.internals.positionAbsolute;
  return {
    x,
    y,
    width: node.measured.width ?? 0,
    height: node.measured.height ?? 0,
  };
}

const LINK_EDGE_CLASS: Record<LinkKind | 'plain', string> = {
  plain: 'osd-board-link osd-board-link--plain',
  cause: 'osd-board-link osd-board-link--cause',
  contrast: 'osd-board-link osd-board-link--contrast',
  echo: 'osd-board-link osd-board-link--echo',
};

/**
 * A loose association between two pages. It is drawn thin so it can never be
 * read as the deck's order, and it follows the cards as they move. Its midpoint
 * names what the two pages have to do with each other, and offers to jump
 * between them.
 */
function LinkEdge({ id, source, target, data }: EdgeProps) {
  const lr = useLrText();
  const { a, b, kind, onUnlink, onSetKind, onJump } = data as unknown as LinkEdgeData;
  const from = boxOf(useInternalNode(source));
  const to = boxOf(useInternalNode(target));
  if (!from || !to) return null;
  const curve = linkCurve(from, to);
  const className = LINK_EDGE_CLASS[kind ?? 'plain'];
  const tag =
    kind === 'cause'
      ? lr.board.linkCause
      : kind === 'contrast'
        ? lr.board.linkContrast
        : kind === 'echo'
          ? lr.board.linkEchoShort
          : '';

  return (
    <>
      {kind === 'contrast' ? (
        // Two lines side by side: a comparison is two things held up together.
        <>
          <BaseEdge
            id={id}
            path={linkCurve({ ...from, y: from.y - 2.5 }, { ...to, y: to.y - 2.5 }).path}
            className={className}
            interactionWidth={14}
          />
          <BaseEdge
            id={`${id}-pair`}
            path={linkCurve({ ...from, y: from.y + 2.5 }, { ...to, y: to.y + 2.5 }).path}
            className={className}
            interactionWidth={14}
          />
        </>
      ) : (
        <BaseEdge id={id} path={curve.path} className={className} interactionWidth={14} />
      )}
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan flex items-center gap-1"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${curve.x}px, ${curve.y}px)`,
          }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              aria-label={lr.board.linkRelation}
              title={lr.board.linkRelation}
              data-lr-link-menu
              className="osd-board-link-menu nodrag nopan"
            >
              <Link2 className="size-3" strokeWidth={2.2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-[176px]">
              {(
                [
                  ['cause', lr.board.linkCause],
                  ['contrast', lr.board.linkContrast],
                  ['echo', lr.board.linkEcho],
                ] as const
              ).map(([value, label]) => (
                <DropdownMenuItem key={value} onClick={() => onSetKind(a, b, value)}>
                  <Check className={cn('size-3.5', kind === value ? 'opacity-100' : 'opacity-0')} />
                  {label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => onSetKind(a, b, null)}>
                <Check className={cn('size-3.5', kind ? 'opacity-0' : 'opacity-100')} />
                {lr.board.linkPlain}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onJump(a)}>
                {format(lr.board.jumpToPage, { n: a + 1 })}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onJump(b)}>
                {format(lr.board.jumpToPage, { n: b + 1 })}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onUnlink(a, b)}>
                {lr.board.removeLink}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {tag && (
            <span className="osd-board-link-tag" data-lr-link-kind={kind}>
              {tag}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes: EdgeTypes = { link: LinkEdge };

const edgeStyle = { stroke: 'var(--osd-board-line)', strokeWidth: 1.5 } as const;
const marker = {
  type: MarkerType.ArrowClosed,
  width: 14,
  height: 14,
  color: 'var(--osd-board-line)',
};

const linkDraftStyle = {
  stroke: 'var(--osd-board-link)',
  strokeWidth: 1.5,
  strokeDasharray: '5 4',
} as const;

const pageIndexOf = (id: string) => Number(id.replace('page-', ''));

type BuildArgs = {
  layout: BoardLayout;
  /** Original page index sitting at each position of this layout. */
  order: number[];
  slideId: string;
  pages: Page[];
  notes?: (string | undefined)[];
  cards: (BoardCard | undefined)[];
  cardsReady: boolean;
  design?: DesignSystem;
  dimmed: boolean[];
  changeCounts: number[];
  flashed: number[];
  selected: Set<number>;
  size: CardSize;
  actions: Pick<
    PageNodeData,
    'onDuplicate' | 'onDelete' | 'onMoveToEnd' | 'onPatchCard' | 'agentHint' | 'onPageTask'
  >;
  columnActions: Pick<
    ColumnLabelData,
    | 'onRename'
    | 'onAddPage'
    | 'onAddChapter'
    | 'onDelete'
    | 'onToggleCollapse'
    | 'onFillChapter'
    | 'onViewPlan'
  > & { columns: number; planFor: (column: number) => 'planning' | number | null };
  progress: ChapterProgress[];
};

/**
 * Card ids stay keyed to the page, not to the position, so a reflow moves cards
 * instead of remounting them — a remount would re-render the whole page preview.
 */
function buildNodes({
  layout,
  order,
  slideId,
  pages,
  notes,
  cards,
  cardsReady,
  design,
  dimmed,
  changeCounts,
  flashed,
  selected,
  size,
  actions,
  columnActions,
  progress,
}: BuildArgs): Node[] {
  const { metrics } = layout;
  const labels: Node[] = layout.columns.map((column, i) => ({
    id: `column-${i}`,
    type: 'columnLabel',
    position: { x: column.x, y: column.y },
    width: column.boxW,
    height: 24,
    data: {
      title: column.title,
      count: column.size,
      index: i,
      width: column.boxW,
      collapsed: column.collapsed,
      canDelete: columnActions.columns > 1,
      progress: progress[i] ?? { done: 0, review: 0, total: 0 },
      plan: columnActions.planFor(i),
      onRename: columnActions.onRename,
      onAddPage: columnActions.onAddPage,
      onAddChapter: columnActions.onAddChapter,
      onDelete: columnActions.onDelete,
      onToggleCollapse: columnActions.onToggleCollapse,
      onFillChapter: columnActions.onFillChapter,
      onViewPlan: columnActions.onViewPlan,
    },
    draggable: true,
    selectable: false,
    deletable: false,
    // React Flow switches pointer events off for a node that is neither
    // selectable nor draggable, which would make the buttons in here dead.
    style: { pointerEvents: 'all' as const },
  }));
  const drop: Node = {
    id: 'drop-slot',
    type: 'dropSlot',
    position: { x: 0, y: 0 },
    width: metrics.boxW,
    height: metrics.boxH,
    draggable: false,
    selectable: false,
    deletable: false,
    hidden: true,
    data: { width: metrics.boxW, height: metrics.boxH, newChapter: false },
  };
  // The structure and the deck are written by separate requests, so for a
  // moment a chapter can still count a page the deck no longer has. Drawing
  // that slot would mount an undefined page.
  const pageNodes: Node[] = layout.slots.flatMap((slot) => {
    const pageIndex = order[slot.index] ?? slot.index;
    if (pageIndex < 0 || pageIndex >= pages.length) return [];
    return {
      id: `page-${pageIndex}`,
      type: 'page',
      position: { x: slot.x, y: slot.y },
      width: metrics.boxW,
      height: metrics.boxH,
      selected: selected.has(pageIndex),
      data: {
        slideId,
        page: pages[pageIndex],
        note: notes?.[pageIndex],
        card: cards[pageIndex],
        cardsReady,
        canLink: cardsReady && pages.length > 1,
        index: pageIndex,
        total: pages.length,
        design,
        canDelete: pages.length > 1,
        size,
        metrics,
        dimmed: dimmed[pageIndex] === true,
        changeCount: changeCounts[pageIndex] ?? 0,
        flash: flashed.includes(pageIndex),
        ...actions,
      } satisfies PageNodeData as unknown as Record<string, unknown>,
    };
  });
  return [...labels, drop, ...pageNodes] as Node[];
}

function sameSelection(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((value) => set.has(value));
}

function BoardFlow({
  slideId,
  pages,
  columns,
  notes,
  cards,
  cardsReady,
  links,
  showLinks,
  design,
  size,
  collapsed,
  dimmed,
  changeCounts,
  flashed,
  selected,
  onSelect,
  onOpenPage,
  onMovePages,
  onMoveToNewChapter,
  onRenameColumn,
  onAddPage,
  onAddChapter,
  onDeleteChapter,
  onToggleCollapse,
  onMoveChapter,
  onDuplicate,
  onDelete,
  onMoveToEnd,
  onPatchCard,
  onLink,
  onUnlink,
  onSetLinkKind,
  onJump,
  onToggleLinks,
  agentHint,
  onPageTask,
  planFor,
  onFillChapter,
  onViewPlan,
  progress: columnProgress,
}: Props) {
  const lr = useLrText();
  const { fitView, zoomIn, zoomOut, screenToFlowPosition, setCenter, getNode, getZoom } =
    useReactFlow();
  const metrics = cardMetrics(size);

  const layout = useMemo(
    () => layoutBoard(columns, { size, collapsed }),
    [columns, size, collapsed],
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const actions = useMemo(
    () => ({ onDuplicate, onDelete, onMoveToEnd, onPatchCard, agentHint, onPageTask }),
    [onDuplicate, onDelete, onMoveToEnd, onPatchCard, agentHint, onPageTask],
  );

  const columnActions = useMemo(
    () => ({
      onRename: onRenameColumn,
      onAddPage,
      onAddChapter,
      onDelete: onDeleteChapter,
      onToggleCollapse,
      onFillChapter,
      onViewPlan,
      planFor,
      columns: columns.length,
    }),
    [
      onRenameColumn,
      onAddPage,
      onAddChapter,
      onDeleteChapter,
      onToggleCollapse,
      onFillChapter,
      onViewPlan,
      planFor,
      columns.length,
    ],
  );

  const buildArgs = useMemo(
    () => ({
      slideId,
      pages,
      notes,
      cards,
      cardsReady,
      design,
      dimmed,
      changeCounts,
      flashed,
      size,
      actions,
      columnActions,
      progress: columnProgress,
    }),
    [
      slideId,
      pages,
      notes,
      cards,
      cardsReady,
      design,
      dimmed,
      changeCounts,
      flashed,
      size,
      actions,
      columnActions,
      columnProgress,
    ],
  );

  const baseNodes = useMemo<Node[]>(
    () =>
      buildNodes({
        ...buildArgs,
        layout,
        order: identityOrder(pages.length),
        selected: selectedSet,
      }),
    [buildArgs, layout, pages.length, selectedSet],
  );

  const [nodes, setNodes] = useState<Node[]>(baseNodes);
  // The deck is the source of truth: a reorder, duplicate or delete rebuilds
  // every position from the layout again.
  useEffect(() => setNodes(baseNodes), [baseNodes]);

  const dropIndexRef = useRef<number | null>(null);
  const dropGapRef = useRef<number | null>(null);
  const shiftAnchorRef = useRef<number | null>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // A box selection arrives as one change per node; the board keeps its own
      // list so the toolbar can act on it, and rebuilds the flags from there.
      const selecting = changes.some((change) => change.type === 'select');
      if (selecting) {
        setNodes((current) =>
          applyNodeChanges(
            changes.filter((c) => c.type !== 'select'),
            current,
          ),
        );
        const picked = new Set(selected);
        for (const change of changes) {
          if (change.type !== 'select') continue;
          const index = pageIndexOf(change.id);
          if (change.selected) picked.add(index);
          else picked.delete(index);
        }
        const next = [...picked].filter((index) => Number.isInteger(index)).sort((a, b) => a - b);
        if (!sameSelection(next, selected)) onSelect(next);
        return;
      }
      setNodes((current) => applyNodeChanges(changes, current));
    },
    [onSelect, selected],
  );

  /** The pages a drag carries: the whole selection when the card is part of it. */
  const movingFor = useCallback(
    (from: number) => (selectedSet.has(from) && selected.length > 1 ? [...selected] : [from]),
    [selected, selectedSet],
  );

  const handleDrag = useCallback<OnNodeDrag>(
    (_event, node) => {
      if (node.type !== 'page') return;
      const from = pageIndexOf(node.id);
      const moving = movingFor(from).sort((a, b) => a - b);

      // Dropping in the gap between two chapters starts a chapter there.
      const gap =
        moving.length === 1
          ? gapAtPoint(
              layout,
              node.position.x + metrics.boxW / 2,
              node.position.y + metrics.boxH / 2,
            )
          : null;
      if (gap !== dropGapRef.current) {
        dropGapRef.current = gap;
        dropIndexRef.current = null;
      }
      if (gap !== null) {
        const left = layout.columns[gap - 1];
        const right = layout.columns[gap];
        const center = (left.x + left.boxW + right.x) / 2;
        dropIndexRef.current = null;
        setNodes((current) =>
          current.map((n) =>
            n.id === 'drop-slot'
              ? {
                  ...n,
                  hidden: false,
                  position: { x: center - metrics.boxW / 2, y: 48 },
                  data: { width: metrics.boxW, height: metrics.boxH, newChapter: true },
                }
              : n.id === node.id
                ? { ...n, position: n.position, dragging: true, zIndex: 20 }
                : n,
          ),
        );
        return;
      }

      // Hit-testing stays on the settled layout: testing against the preview
      // would move the target out from under the cursor and oscillate.
      const to = slotAtPoint(layout, node.position.x, node.position.y, moving[0]);
      if (dropIndexRef.current === to) return;
      dropIndexRef.current = to;

      // Chapters re-form when a chapter page moves, and a column's length decides
      // where the next column starts — so the preview has to be laid out from the
      // prospective deck rather than by shuffling cards through today's geometry.
      const order = orderAfterMoveMany(pages.length, moving, to);
      const previewLayout = layoutBoard(columnsAfterMoveMany(columns, moving, to), {
        size,
        collapsed,
      });
      const preview = buildNodes({
        ...buildArgs,
        layout: previewLayout,
        order,
        selected: selectedSet,
      });
      const target = previewLayout.slots[order.indexOf(moving[0])];

      setNodes((current) => {
        const live = current.find((n) => n.id === node.id);
        return preview.map((n) => {
          if (n.id === 'drop-slot') {
            return target
              ? {
                  ...n,
                  hidden: false,
                  position: { x: target.x, y: target.y },
                  data: {
                    width: metrics.boxW,
                    height: metrics.boxH,
                    newChapter: false,
                  },
                }
              : n;
          }
          // The card under the cursor keeps following the pointer.
          if (n.id === node.id) {
            return { ...n, position: live?.position ?? n.position, dragging: true, zIndex: 20 };
          }
          return n;
        });
      });
    },
    [layout, columns, collapsed, size, metrics, pages.length, buildArgs, movingFor, selectedSet],
  );

  const handleDragStop = useCallback<OnNodeDrag>(
    (_event, node) => {
      const gap = dropGapRef.current;
      const to = dropIndexRef.current;
      dropGapRef.current = null;
      dropIndexRef.current = null;

      setNodes((current) =>
        current.map((n) => (n.id === 'drop-slot' ? { ...n, hidden: true } : n)),
      );

      if (node.type === 'columnLabel') {
        const from = Number(node.id.replace('column-', ''));
        const center = node.position.x + metrics.boxW / 2;
        let to1 = from;
        let best = Number.POSITIVE_INFINITY;
        layout.columns.forEach((column, i) => {
          const distance = Math.abs(column.x + column.boxW / 2 - center);
          if (distance < best) {
            best = distance;
            to1 = i;
          }
        });
        setNodes(baseNodes);
        if (to1 !== from) onMoveChapter(from, to1);
        return;
      }
      if (node.type !== 'page') return;

      const from = pageIndexOf(node.id);
      if (gap !== null) {
        setNodes(baseNodes);
        onMoveToNewChapter(from, gap);
        return;
      }
      const moving = movingFor(from).sort((a, b) => a - b);
      const target = to ?? from;
      const order = orderAfterMoveMany(pages.length, moving, target);
      if (order.every((value, i) => value === i)) {
        // Snap the card back to its own slot instead of leaving it where it was dropped.
        setNodes(baseNodes);
        return;
      }
      onMovePages(moving, target);
    },
    [
      baseNodes,
      layout,
      metrics,
      pages.length,
      movingFor,
      onMovePages,
      onMoveToNewChapter,
      onMoveChapter,
    ],
  );

  // Opening on the whole board squeezes a long deck down to unreadable cards, so
  // the first view frames the opening column at a size you can actually read.
  // The fit button then shows the whole shape.
  const frameStart = useCallback(() => {
    const opening = layout.slots.filter((slot) => slot.column === 0);
    if (opening.length === 0) return;
    fitView({
      // The chapter label sits above its first card, so framing only the cards
      // would cut it off at the top edge.
      nodes: [{ id: 'column-0' }, ...opening.map((slot) => ({ id: `page-${slot.index}` }))],
      padding: 0.22,
      maxZoom: 0.75,
    });
  }, [layout, fitView]);

  const fitAll = useCallback(() => fitView({ padding: 0.12, maxZoom: 0.9 }), [fitView]);

  /** Puts a page in the middle of the canvas, at a size its text can be read at. */
  const centerOn = useCallback(
    (index: number) => {
      const node = getNode(`page-${index}`);
      if (!node) return;
      const width = node.measured?.width ?? metrics.boxW;
      const height = node.measured?.height ?? metrics.boxH;
      void setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: Math.max(getZoom(), 0.6),
        duration: 400,
      });
    },
    [getNode, getZoom, metrics, setCenter],
  );

  const jump = useCallback(
    (index: number) => {
      onJump(index);
      centerOn(index);
    },
    [centerOn, onJump],
  );

  const edges = useMemo<Edge[]>(() => {
    const byIndex = new Map(layout.slots.map((slot) => [slot.index, slot]));
    const mainLine: Edge[] = pages.slice(0, -1).map((_, i) => {
      const sameColumn = byIndex.get(i)?.column === byIndex.get(i + 1)?.column;
      return {
        id: `line-${i}`,
        source: `page-${i}`,
        target: `page-${i + 1}`,
        sourceHandle: sameColumn ? null : 'right',
        targetHandle: sameColumn ? null : 'left',
        type: 'smoothstep',
        style: edgeStyle,
        markerEnd: marker,
        selectable: false,
        focusable: false,
      };
    });
    if (!showLinks) return mainLine;
    const linkLines: Edge[] = links.map(({ a, b, kind }) => ({
      id: `link-${Math.min(a, b)}-${Math.max(a, b)}`,
      source: `page-${a}`,
      target: `page-${b}`,
      type: 'link',
      data: {
        a,
        b,
        kind,
        onUnlink,
        onSetKind: onSetLinkKind,
        onJump: jump,
      } satisfies LinkEdgeData,
      // A cause points the way it was drawn; the other relations have no direction.
      markerEnd: kind === 'cause' ? marker : undefined,
      selectable: false,
      focusable: false,
    }));
    return [...mainLine, ...linkLines];
  }, [layout, pages, links, showLinks, onUnlink, onSetLinkKind, jump]);

  // A link is drawn by dragging a card's dot onto another card. The whole card is
  // the target rather than a handle on it, because a handle is too small to hit
  // at the zoom a long deck is read at.
  const handleConnectEnd = useCallback<OnConnectEnd>(
    (event, state) => {
      const from = state.fromNode;
      if (from?.type !== 'page') return;
      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      if (!point) return;
      const at = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      const target = cardAtPoint(layout, at.x, at.y);
      const source = pageIndexOf(from.id);
      if (target !== null && target !== source) onLink(source, target);
    },
    [layout, screenToFlowPosition, onLink],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeDrag={handleDrag}
      onNodeDragStop={handleDragStop}
      onNodeClick={(event, node) => {
        if (node.type !== 'page') return;
        const index = pageIndexOf(node.id);
        if (event.shiftKey) {
          const anchor = shiftAnchorRef.current ?? index;
          const [a, b] = [Math.min(anchor, index), Math.max(anchor, index)];
          const range: number[] = [];
          for (let i = a; i <= b; i++) range.push(i);
          onSelect(range);
          return;
        }
        shiftAnchorRef.current = index;
      }}
      onNodeDoubleClick={(_, node) => {
        if (node.type === 'page') onOpenPage(pageIndexOf(node.id));
      }}
      onConnectEnd={handleConnectEnd}
      connectionLineStyle={linkDraftStyle}
      edgesFocusable={false}
      onlyRenderVisibleElements
      onInit={frameStart}
      minZoom={0.05}
      maxZoom={1.5}
      panOnScroll
      selectionOnDrag
      // A page is removed only through the board's own confirmation dialog.
      deleteKeyCode={null}
      multiSelectionKeyCode={['Meta', 'Control']}
      selectionKeyCode={null}
      className="osd-board"
    >
      <Background variant={BackgroundVariant.Dots} gap={28} size={1} className="osd-board-bg" />
      <MiniMap
        pannable
        zoomable
        nodeColor="var(--osd-board-minimap-node)"
        nodeStrokeWidth={0}
        className="osd-board-minimap"
        maskColor="var(--osd-board-mask)"
      />
      <Panel position="bottom-left" className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={lr.board.zoomOut}
          onClick={() => zoomOut()}
        >
          <Minus />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={lr.board.zoomIn}
          onClick={() => zoomIn()}
        >
          <Plus />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label={lr.board.fitView} onClick={fitAll}>
          <Maximize2 />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={showLinks ? lr.board.hideLinks : lr.board.showLinks}
          aria-pressed={showLinks}
          title={showLinks ? lr.board.hideLinks : lr.board.showLinks}
          onClick={onToggleLinks}
        >
          {showLinks ? <Link2 /> : <Link2Off />}
        </Button>
      </Panel>
    </ReactFlow>
  );
}

export default function BoardCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <BoardFlow {...props} />
    </ReactFlowProvider>
  );
}
