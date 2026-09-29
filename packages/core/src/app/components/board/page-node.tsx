import { Handle, type NodeProps, Position } from '@xyflow/react';
import { Copy, MoveRight, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { format, useLocale } from '@/lib/use-locale';
import { cn, pad2 } from '@/lib/utils';
import type { DesignSystem } from '../../lib/design';
import { SlidePageProvider } from '../../lib/page-context';
import { CANVAS_WIDTH, type Page } from '../../lib/sdk';
import { SlideCanvas } from '../slide-canvas';
import { CARD_H, CARD_W } from './layout';

export type PageNodeData = {
  page: Page;
  index: number;
  total: number;
  design?: DesignSystem;
  canDelete: boolean;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMoveToEnd: (index: number) => void;
};

const hiddenHandle = { opacity: 0, width: 1, height: 1, minWidth: 1, minHeight: 1 } as const;

export function PageNode({ data, selected, dragging }: NodeProps) {
  const {
    page: PageComp,
    index,
    total,
    design,
    canDelete,
    ...actions
  } = data as unknown as PageNodeData;
  const t = useLocale();

  const card = (
    <div
      className={cn(
        'osd-board-card group/card flex flex-col gap-2 rounded-[8px] bg-card p-1.5 ring-1',
        'motion-safe:transition-[box-shadow,ring-color,scale]',
        selected ? 'ring-2 ring-brand' : 'ring-hairline hover:ring-muted-foreground/30',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
      style={{ width: CARD_W + 12 }}
    >
      <div
        className="relative overflow-hidden rounded-[4px] bg-white ring-1 ring-hairline"
        style={{ width: CARD_W, height: CARD_H }}
      >
        <SlideCanvas scale={CARD_W / CANVAS_WIDTH} center={false} flat freezeMotion design={design}>
          <SlidePageProvider index={index} total={total}>
            <PageComp />
          </SlidePageProvider>
        </SlideCanvas>
      </div>
      <div className="flex h-4 items-center justify-between px-0.5">
        <span className="font-mono text-[10.5px] tracking-[0.08em] tabular-nums text-muted-foreground/70">
          {pad2(index + 1)}
        </span>
      </div>
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
          render={card}
        />
        <ContextMenuContent className="min-w-[180px]">
          <ContextMenuItem onClick={() => actions.onDuplicate(index)}>
            <Copy />
            {t.thumbnailRail.duplicatePage}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={index === total - 1}
            onClick={() => actions.onMoveToEnd(index)}
          >
            <MoveRight />
            {t.board.moveToEnd}
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
    </>
  );
}
