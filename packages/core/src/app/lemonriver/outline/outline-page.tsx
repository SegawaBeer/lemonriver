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
import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createSession,
  sendMessage,
  setActiveSession,
  setDockOpen,
  useAgentSessions,
  useAgentStatus,
} from '@/lib/agent/use-agent';
import { format, useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { Mascot } from '../brand/mascot';
import { useLrText } from '../text';
import type { LrText } from '../text/types';
import {
  insertPage,
  movePage,
  type Outline,
  type OutlinePage,
  outlinePrompt,
  PAGE_KINDS,
  type PageKind,
  removePage,
  renamePage,
  setKind,
} from './model';
import { Steps } from './steps';

const SAVE_DELAY_MS = 400;
const POLL_MS = 1500;

function basePath(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, '');
}

function kindLabel(t: LrText['outline'], kind: PageKind): string {
  const labels: Record<PageKind, string> = {
    cover: t.kindCover,
    kpi: t.kindKpi,
    chart: t.kindChart,
    list: t.kindList,
    page: t.kindPage,
    end: t.kindEnd,
  };
  return labels[kind];
}

export function OutlineView() {
  const { slideId = '' } = useParams();
  const lr = useLrText().outline;
  const buildLr = useLrText().build;
  const locale = useLocale();
  const navigate = useNavigate();
  const { sessions } = useAgentSessions();
  const { provider } = useAgentStatus();
  const [outline, setOutline] = useState<Outline | null | undefined>(undefined);
  const [items, setItems] = useState<OutlinePage[]>([]);
  const [building, setBuilding] = useState(false);
  const dirty = useRef(false);
  const saveTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/__lr/outline?slideId=${encodeURIComponent(slideId)}`);
      if (!res.ok) return;
      const body = (await res.json()) as { outline: Outline | null };
      setOutline(body.outline);
      if (!dirty.current) setItems(body.outline?.items ?? []);
    } catch {}
  }, [slideId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (outline?.state !== 'drafting' && outline?.state !== 'building') return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [outline?.state, load]);

  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const onChange = () => void load();
    hot.on('open-slide:slide-changed', onChange);
    return () => hot.off('open-slide:slide-changed', onChange);
  }, [load]);

  const save = useCallback(
    async (next: OutlinePage[]) => {
      try {
        const res = await fetch('/__lr/outline', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slideId, items: next }),
        });
        if (res.ok) dirty.current = false;
      } catch {}
    },
    [slideId],
  );

  const edit = useCallback(
    (next: OutlinePage[]) => {
      setItems(next);
      dirty.current = true;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void save(next), SAVE_DELAY_MS);
    },
    [save],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function sessionForDeck(): Promise<string> {
    const found = sessions.find((session) => session.slideId === slideId);
    if (found) {
      setActiveSession(found.id);
      return found.id;
    }
    if (!provider) throw new Error('no agent');
    const session = await createSession(provider.id, slideId);
    return session.id;
  }

  async function build() {
    if (!outline || building) return;
    setBuilding(true);
    try {
      const res = await fetch('/__lr/outline/build', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slideId }),
      });
      if (!res.ok) throw new Error('build failed');
      setDockOpen(true);
      window.location.assign(`${basePath()}/s/${encodeURIComponent(slideId)}`);
    } catch {
      toast.error(lr.startFailed);
      setBuilding(false);
    }
  }

  async function retry() {
    if (!outline) return;
    try {
      const res = await fetch('/__lr/outline/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slideId,
          brief: outline.brief,
          pages: outline.pages,
          files: outline.files,
        }),
      });
      if (!res.ok) throw new Error('start failed');
      const sessionId = await sessionForDeck();
      await sendMessage(sessionId, outlinePrompt(outline, slideId, locale.id), { slideId });
      await load();
    } catch {
      toast.error(lr.startFailed);
    }
  }

  function editBrief() {
    navigate(`/new?deck=${encodeURIComponent(slideId)}`);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((page) => page.id === active.id);
    const to = items.findIndex((page) => page.id === over.id);
    if (from === -1 || to === -1) return;
    edit(movePage(items, from, to));
  }

  const running = sessions.some(
    (session) => session.slideId === slideId && session.status === 'running',
  );

  return (
    <div data-lr-outline className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-[820px] px-6 py-8">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <ArrowLeft className="size-3.5" />
          {lr.back}
        </button>

        <Steps current={2} />

        {outline === undefined && <div className="mt-10 h-24" />}

        {outline?.state === 'drafting' && (
          <div
            data-lr-outline-state="drafting"
            className="mt-10 flex flex-col items-center gap-3 rounded-[16px] border border-border bg-card px-6 py-12 text-center"
          >
            <Mascot state="thinking" size={56} float />
            <p className="text-[14px] text-muted-foreground">
              {outline.files.length > 0
                ? format(lr.drafting, { n: outline.files.length })
                : lr.draftingNoFiles}
            </p>
          </div>
        )}

        {(outline === null || outline?.state === 'failed') && (
          <div
            data-lr-outline-state="failed"
            className="mt-10 flex items-start gap-3 rounded-[16px] border border-border bg-card px-5 py-5"
          >
            <Mascot state="needs-you" size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{lr.failedTitle}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{lr.failedHint}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!outline || !provider}
                  onClick={() => void retry()}
                >
                  {lr.retry}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={editBrief}>
                  {lr.editBrief}
                </Button>
              </div>
            </div>
          </div>
        )}

        {outline?.state === 'building' && (
          <div
            data-lr-outline-state="building"
            className="mt-10 flex flex-col items-center gap-3 rounded-[16px] border border-border bg-card px-6 py-12 text-center"
          >
            <Mascot state="working" size={56} float />
            <p className="text-[14px] text-muted-foreground">
              {format(buildLr.buildingHere, { k: outline.built, n: outline.items.length })}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate(`/s/${encodeURIComponent(slideId)}`)}
            >
              {buildLr.backToEditor}
            </Button>
          </div>
        )}

        {outline &&
          outline.state !== 'drafting' &&
          outline.state !== 'failed' &&
          outline.state !== 'building' && (
            <>
              <ul className="mt-8 flex flex-col gap-2">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext
                    items={items.map((page) => page.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {items.map((page, index) => (
                      <OutlineRow
                        key={page.id}
                        page={page}
                        index={index}
                        first={index === 0}
                        last={index === items.length - 1}
                        canDelete={items.length > 2}
                        onTitle={(title) => edit(renamePage(items, index, title))}
                        onKind={(kind) => edit(setKind(items, index, kind))}
                        onUp={() => edit(movePage(items, index, index - 1))}
                        onDown={() => edit(movePage(items, index, index + 1))}
                        onRemove={() => edit(removePage(items, index))}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => edit(insertPage(items, items.length))}
                >
                  {lr.addPage}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={editBrief}>
                  {lr.editBrief}
                </Button>
                <span className="ml-auto text-[12.5px] text-muted-foreground tabular-nums">
                  {format(lr.total, { n: items.length })}
                </span>
              </div>

              <div className="mt-6 flex justify-end">
                <Button
                  type="button"
                  disabled={outline.state !== 'ready' || running || building}
                  onClick={() => void build()}
                >
                  {lr.build}
                </Button>
              </div>
            </>
          )}
      </div>
    </div>
  );
}

function OutlineRow({
  page,
  index,
  first,
  last,
  canDelete,
  onTitle,
  onKind,
  onUp,
  onDown,
  onRemove,
}: {
  page: OutlinePage;
  index: number;
  first: boolean;
  last: boolean;
  canDelete: boolean;
  onTitle: (title: string) => void;
  onKind: (kind: PageKind) => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const lr = useLrText().outline;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-lr-outline-row
      className={cn(
        'flex items-center gap-2 rounded-[10px] border border-border bg-card px-2.5 py-2',
        isDragging && 'opacity-70 shadow-[var(--lr-shadow-1)]',
      )}
    >
      <button
        type="button"
        aria-label={lr.dragPage}
        className="cursor-grab rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-5 text-right text-[12px] text-muted-foreground tabular-nums">
        {index + 1}
      </span>
      <Select
        items={Object.fromEntries(PAGE_KINDS.map((kind) => [kind, kindLabel(lr, kind)]))}
        value={page.kind}
        onValueChange={(value) => onKind(value as PageKind)}
      >
        <SelectTrigger size="sm" className="w-[104px] shrink-0 text-[12.5px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {PAGE_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind} className="text-[12.5px]">
                {kindLabel(lr, kind)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <input
        value={page.title}
        onChange={(e) => onTitle(e.target.value)}
        aria-label={format(lr.pageTitle, { n: index + 1 })}
        className="min-w-0 flex-1 rounded-[5px] bg-transparent px-2 py-1 text-[14px] outline-none focus:bg-muted/60"
      />
      <IconButton label={lr.moveUp} disabled={first} onClick={onUp}>
        <ArrowUp className="size-3.5" />
      </IconButton>
      <IconButton label={lr.moveDown} disabled={last} onClick={onDown}>
        <ArrowDown className="size-3.5" />
      </IconButton>
      <IconButton label={lr.removePage} disabled={!canDelete} onClick={onRemove}>
        <Trash2 className="size-3.5" />
      </IconButton>
    </li>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-35"
    >
      {children}
    </button>
  );
}
