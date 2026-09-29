import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Edge,
  MarkerType,
  MiniMap,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type OnNodeDrag,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/use-locale';
import { pad2 } from '@/lib/utils';
import { type BoardColumn, columnsAfterMove } from '../../../files/board-structure';
import type { DesignSystem } from '../../lib/design';
import type { Page } from '../../lib/sdk';
import {
  type BoardLayout,
  CARD_BOX_H,
  CARD_BOX_W,
  identityOrder,
  layoutBoard,
  orderAfterMove,
  slotAtPoint,
} from './layout';
import { PageNode, type PageNodeData } from './page-node';
import '@xyflow/react/dist/base.css';
import './board.css';

type Props = {
  pages: Page[];
  columns: BoardColumn[];
  design?: DesignSystem;
  onOpenPage: (index: number) => void;
  onMovePage: (from: number, to: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMoveToEnd: (index: number) => void;
};

function ColumnLabel({ data }: NodeProps) {
  const { title, count } = data as unknown as { title: string; count: number };
  return (
    <div className="flex items-baseline gap-2" style={{ width: CARD_BOX_W }}>
      <span className="eyebrow truncate">{title}</span>
      <span className="folio">{pad2(count)}</span>
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

const edgeStyle = { stroke: 'var(--osd-board-line)', strokeWidth: 1.5 } as const;
const marker = {
  type: MarkerType.ArrowClosed,
  width: 14,
  height: 14,
  color: 'var(--osd-board-line)',
};

const pageIndexOf = (id: string) => Number(id.replace('page-', ''));

type BuildArgs = {
  layout: BoardLayout;
  /** Original page index sitting at each position of this layout. */
  order: number[];
  pages: Page[];
  design?: DesignSystem;
  actions: Pick<PageNodeData, 'onDuplicate' | 'onDelete' | 'onMoveToEnd'>;
};

/**
 * Card ids stay keyed to the page, not to the position, so a reflow moves cards
 * instead of remounting them — a remount would re-render the whole page preview.
 */
function buildNodes({ layout, order, pages, design, actions }: BuildArgs): Node[] {
  const labels: Node[] = layout.columns.map((column, i) => ({
    id: `column-${i}`,
    type: 'columnLabel',
    position: { x: column.x, y: column.y },
    width: CARD_BOX_W,
    height: 24,
    data: { title: column.title, count: column.to - column.from + 1 },
    draggable: false,
    selectable: false,
    deletable: false,
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
  const cards: Node[] = layout.slots.map((slot) => {
    const pageIndex = order[slot.index] ?? slot.index;
    return {
      id: `page-${pageIndex}`,
      type: 'page',
      position: { x: slot.x, y: slot.y },
      width: CARD_BOX_W,
      height: CARD_BOX_H,
      data: {
        page: pages[pageIndex],
        index: pageIndex,
        total: pages.length,
        design,
        canDelete: pages.length > 1,
        ...actions,
      } satisfies PageNodeData as unknown as Record<string, unknown>,
    };
  });
  return [...labels, drop, ...cards];
}

function BoardFlow({
  pages,
  columns,
  design,
  onOpenPage,
  onMovePage,
  onDuplicate,
  onDelete,
  onMoveToEnd,
}: Props) {
  const t = useLocale();
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  const layout = useMemo(() => layoutBoard(columns), [columns]);

  const actions = useMemo(
    () => ({ onDuplicate, onDelete, onMoveToEnd }),
    [onDuplicate, onDelete, onMoveToEnd],
  );

  const baseNodes = useMemo<Node[]>(
    () => buildNodes({ layout, order: identityOrder(pages.length), pages, design, actions }),
    [layout, pages, design, actions],
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
      const preview = buildNodes({ layout: previewLayout, order, pages, design, actions });
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
    [layout, columns, pages, design, actions],
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
    return pages.slice(0, -1).map((_, i) => {
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
  }, [layout, pages]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDrag={handleDrag}
      onNodeDragStop={handleDragStop}
      onNodeDoubleClick={(_, node) => {
        if (node.type === 'page') onOpenPage(pageIndexOf(node.id));
      }}
      nodesConnectable={false}
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
          aria-label={t.board.zoomOut}
          onClick={() => zoomOut()}
        >
          <Minus />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t.board.zoomIn}
          onClick={() => zoomIn()}
        >
          <Plus />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label={t.board.fitView} onClick={fitAll}>
          <Maximize2 />
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
