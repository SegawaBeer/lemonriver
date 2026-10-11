import { Handle, type NodeProps, Position } from '@xyflow/react';
import { Copy, MoveRight, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import { useNotes } from '../../lib/inspector/use-notes';
import { SlidePageProvider } from '../../lib/page-context';
import { CANVAS_WIDTH, type Page } from '../../lib/sdk';
import { SlideCanvas } from '../slide-canvas';
import { CARD_H, CARD_W, NOTE_H } from './layout';

export type PageNodeData = {
  slideId: string;
  page: Page;
  index: number;
  total: number;
  note?: string;
  design?: DesignSystem;
  canDelete: boolean;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMoveToEnd: (index: number) => void;
};

const hiddenHandle = { opacity: 0, width: 1, height: 1, minWidth: 1, minHeight: 1 } as const;

export function PageNode({ data, selected, dragging }: NodeProps) {
  const {
    slideId,
    page: PageComp,
    index,
    total,
    note,
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
      <NoteStrip slideId={slideId} index={index} initial={note} />
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
          placeholder={t.board.notesPlaceholder}
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
            {value || t.board.notesPlaceholder}
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
