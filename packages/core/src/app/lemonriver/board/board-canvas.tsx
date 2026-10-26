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
import { Link2, Link2Off, Maximize2, Minus, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn, pad2 } from '@/lib/utils';
import type { DesignSystem } from '../../lib/design';
import type { Page } from '../../lib/sdk';
import { useLrText } from '../text';
import {
  type BoardLayout,
  type Box,
  CARD_BOX_H,
  CARD_BOX_W,
  cardAtPoint,
  identityOrder,
  layoutBoard,
  linkCurve,
  orderAfterMove,
  slotAtPoint,
} from './layout';
import type { BoardCard, CardPatch } from './model/cards';
import { type BoardColumn, columnsAfterMove } from './model/structure';
import { PageNode, type PageNodeData } from './page-node';
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
  links: [number, number][];
  showLinks: boolean;
  design?: DesignSystem;
  onOpenPage: (index: number) => void;
  onMovePage: (from: number, to: number) => void;
  onRenameColumn: (index: number, title: string) => void;
  onAddPage: (columnIndex: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMoveToEnd: (index: number) => void;
  onPatchCard: (index: number, patch: CardPatch) => void;
  onLink: (a: number, b: number) => void;
  onUnlink: (a: number, b: number) => void;
  onToggleLinks: () => void;
};

type ColumnLabelData = {
  title: string;
  count: number;
  index: number;
  onRename: (index: number, title: string) => void;
  onAddPage: (index: number) => void;
};

function ColumnLabel({ data }: NodeProps) {
  const { title, count, index, onRename, onAddPage } = data as unknown as ColumnLabelData;
  const lr = useLrText();
  const [editing, setEditing] = useState(false);

  return (
    <div
      className="nodrag pointer-events-auto flex items-baseline gap-2"
      style={{ width: CARD_BOX_W }}
    >
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
          className="eyebrow min-w-0 flex-1 rounded-[4px] bg-muted/60 px-1.5 py-1 text-foreground outline-none ring-1 ring-brand/40"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={lr.board.renameColumn}
          className="eyebrow min-w-0 truncate rounded-[4px] px-1.5 py-1 text-left motion-safe:transition-colors hover:bg-muted/60"
        >
          {title}
        </button>
      )}
      <span className="folio">{pad2(count)}</span>
      <button
        type="button"
        onClick={() => onAddPage(index)}
        aria-label={lr.board.addPage}
        className={cn(
          'ml-auto flex size-6 items-center justify-center rounded-[4px] text-muted-foreground/60',
          'motion-safe:transition-colors hover:bg-muted hover:text-foreground',
        )}
      >
        <Plus className="size-3.5" strokeWidth={1.9} />
      </button>
    </div>
  );
}

/** Marks the slot a dragged card will take, so the drop point is visible. */
function DropSlot() {
  return (
    <div
      className="rounded-[8px] border-2 border-dashed border-brand/45 bg-brand/[0.04]"
      style={{ width: CARD_BOX_W, height: CARD_BOX_H }}
    />
  );
}

const nodeTypes: NodeTypes = { page: PageNode, columnLabel: ColumnLabel, dropSlot: DropSlot };

type LinkEdgeData = { a: number; b: number; onUnlink: (a: number, b: number) => void };

function boxOf(node: InternalNode | undefined): Box | null {
  if (!node) return null;
  const { x, y } = node.internals.positionAbsolute;
  return {
    x,
    y,
    width: node.measured.width ?? CARD_BOX_W,
    height: node.measured.height ?? CARD_BOX_H,
  };
}

/**
 * A loose association between two pages. It is drawn thin and dashed so it can
 * never be read as the deck's order, and it follows the cards as they move.
 */
function LinkEdge({ id, source, target, data }: EdgeProps) {
  const lr = useLrText();
  const { a, b, onUnlink } = data as unknown as LinkEdgeData;
  const from = boxOf(useInternalNode(source));
  const to = boxOf(useInternalNode(target));
  if (!from || !to) return null;
  const curve = linkCurve(from, to);

  return (
    <>
      <BaseEdge id={id} path={curve.path} className="osd-board-link" interactionWidth={14} />
      <EdgeLabelRenderer>
        <button
          type="button"
          aria-label={lr.board.removeLink}
          title={lr.board.removeLink}
          onClick={() => onUnlink(a, b)}
          className="osd-board-link-remove nodrag nopan"
          style={{ transform: `translate(-50%, -50%) translate(${curve.x}px, ${curve.y}px)` }}
        >
          <X className="size-3" strokeWidth={2.2} />
        </button>
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
  actions: Pick<PageNodeData, 'onDuplicate' | 'onDelete' | 'onMoveToEnd' | 'onPatchCard'>;
  columnActions: {
    onRename: (index: number, title: string) => void;
    onAddPage: (index: number) => void;
  };
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
  actions,
  columnActions,
}: BuildArgs): Node[] {
  const labels: Node[] = layout.columns.map((column, i) => ({
    id: `column-${i}`,
    type: 'columnLabel',
    position: { x: column.x, y: column.y },
    width: CARD_BOX_W,
    height: 24,
    data: {
      title: column.title,
      count: column.size,
      index: i,
      ...columnActions,
    },
    draggable: false,
    selectable: false,
    deletable: false,
    // React Flow switches pointer events off for a node that is neither
    // selectable nor draggable, which would make the buttons in here dead.
    style: { pointerEvents: 'all' },
  }));
  const drop: Node = {
    id: 'drop-slot',
    type: 'dropSlot',
    position: { x: 0, y: 0 },
    width: CARD_BOX_W,
    height: CARD_BOX_H,
    draggable: false,
    selectable: false,
    deletable: false,
    hidden: true,
    data: {},
  };
  const pageNodes: Node[] = layout.slots.map((slot) => {
    const pageIndex = order[slot.index] ?? slot.index;
    return {
      id: `page-${pageIndex}`,
      type: 'page',
      position: { x: slot.x, y: slot.y },
      width: CARD_BOX_W,
      height: CARD_BOX_H,
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
        ...actions,
      } satisfies PageNodeData as unknown as Record<string, unknown>,
    };
  });
  return [...labels, drop, ...pageNodes];
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
  onOpenPage,
  onMovePage,
  onRenameColumn,
  onAddPage,
  onDuplicate,
  onDelete,
  onMoveToEnd,
  onPatchCard,
  onLink,
  onUnlink,
  onToggleLinks,
}: Props) {
  const lr = useLrText();
  const { fitView, zoomIn, zoomOut, screenToFlowPosition } = useReactFlow();

  const layout = useMemo(() => layoutBoard(columns), [columns]);

  const actions = useMemo(
    () => ({ onDuplicate, onDelete, onMoveToEnd, onPatchCard }),
    [onDuplicate, onDelete, onMoveToEnd, onPatchCard],
  );

  const columnActions = useMemo(
    () => ({ onRename: onRenameColumn, onAddPage }),
    [onRenameColumn, onAddPage],
  );

  const baseNodes = useMemo<Node[]>(
    () =>
      buildNodes({
        layout,
        order: identityOrder(pages.length),
        slideId,
        pages,
        notes,
        cards,
        cardsReady,
        design,
        actions,
        columnActions,
      }),
    [layout, slideId, pages, notes, cards, cardsReady, design, actions, columnActions],
  );

  const [nodes, setNodes] = useState<Node[]>(baseNodes);
  // The deck is the source of truth: a reorder, duplicate or delete rebuilds
  // every position from the layout again.
  useEffect(() => setNodes(baseNodes), [baseNodes]);

  const dropIndexRef = useRef<number | null>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );

  const handleDrag = useCallback<OnNodeDrag>(
    (_event, node) => {
      if (node.type !== 'page') return;
      const from = pageIndexOf(node.id);
      // Hit-testing stays on the settled layout: testing against the preview
      // would move the target out from under the cursor and oscillate.
      const to = slotAtPoint(layout, node.position.x, node.position.y, from);
      if (dropIndexRef.current === to) return;
      dropIndexRef.current = to;

      // Chapters re-form when a chapter page moves, and a column's length decides
      // where the next column starts — so the preview has to be laid out from the
      // prospective deck rather than by shuffling cards through today's geometry.
      const order = orderAfterMove(pages.length, from, to);
      const previewLayout = layoutBoard(columnsAfterMove(columns, from, to));
      const preview = buildNodes({
        layout: previewLayout,
        order,
        slideId,
        pages,
        notes,
        cards,
        cardsReady,
        design,
        actions,
        columnActions,
      });
      const target = previewLayout.slots[order.indexOf(from)];

      setNodes((current) => {
        const live = current.find((n) => n.id === node.id);
        return preview.map((n) => {
          if (n.id === 'drop-slot') {
            return target ? { ...n, hidden: false, position: { x: target.x, y: target.y } } : n;
          }
          // The card under the cursor keeps following the pointer.
          if (n.id === node.id) {
            return { ...n, position: live?.position ?? n.position, dragging: true, zIndex: 20 };
          }
          return n;
        });
      });
    },
    [layout, columns, slideId, pages, notes, cards, cardsReady, design, actions, columnActions],
  );

  const handleDragStop = useCallback<OnNodeDrag>(
    (_event, node) => {
      if (node.type !== 'page') return;
      const from = pageIndexOf(node.id);
      const to = dropIndexRef.current ?? from;
      dropIndexRef.current = null;
      setNodes((current) =>
        current.map((n) => (n.id === 'drop-slot' ? { ...n, hidden: true } : n)),
      );
      if (to === from) {
        // Snap the card back to its own slot instead of leaving it where it was dropped.
        setNodes(baseNodes);
        return;
      }
      onMovePage(from, to);
    },
    [baseNodes, onMovePage],
  );

  // Opening on the whole board squeezes a long deck down to unreadable cards, so
  // the first view frames the opening column at a size you can actually read.
  // The fit button then shows the whole shape.
  const frameStart = useCallback(() => {
    const opening = layout.slots.filter((slot) => slot.column === 0);
    if (opening.length === 0) return;
    fitView({
      nodes: opening.map((slot) => ({ id: `page-${slot.index}` })),
      padding: 0.22,
      maxZoom: 0.75,
    });
  }, [layout, fitView]);

  const fitAll = useCallback(() => fitView({ padding: 0.12, maxZoom: 0.9 }), [fitView]);

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
    const linkLines: Edge[] = links.map(([a, b]) => ({
      id: `link-${Math.min(a, b)}-${Math.max(a, b)}`,
      source: `page-${a}`,
      target: `page-${b}`,
      type: 'link',
      data: { a, b, onUnlink } satisfies LinkEdgeData,
      selectable: false,
      focusable: false,
    }));
    return [...mainLine, ...linkLines];
  }, [layout, pages, links, showLinks, onUnlink]);

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
