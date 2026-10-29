import { ChevronDown, Plus } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAgentSessions, useAgentStatus, useCreateDeck } from '@/lib/agent/use-agent';
import { format, useLocale } from '@/lib/use-locale';
import { cn, pad2 } from '@/lib/utils';
import { FolderIconChip, SystemViewIcon } from '../../components/sidebar/folder-item';
import { ALL_SLIDES_ID, DRAFT_ID } from '../../components/sidebar/sidebar';
import { slideCreatedAt, slideIds } from '../../lib/slides';
import type { HomeOutletContext } from '../../routes/home-shell';
import { isFeatureEnabled } from '../features';
import { LemonEmpty } from '../feedback/lemon-empty';
import { useLrText } from '../text';
import { moveToTrash } from '../trash/api';
import { BriefCard } from './brief-card';
import { SearchInput, SortControl } from './controls';
import { DeckCard } from './deck-card';
import { MoveDialog, RenameDialog, TypedConfirmDialog } from './dialogs';
import { filterDecks, sortDecks, useSortPref } from './sorting';
import { greetingFor } from './time';
import { useDeckTimes } from './use-deck-times';
import { useDelayed } from './use-delayed';

type Dialog = { kind: 'rename' | 'move' | 'delete'; id: string } | null;

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Decks the agent is working on right now. */
function useEditingDecks(): Set<string> {
  const { sessions } = useAgentSessions();
  return useMemo(
    () =>
      new Set(sessions.flatMap((s) => (s.status === 'running' && s.slideId ? [s.slideId] : []))),
    [sessions],
  );
}

export function LemonRiverHome() {
  const ctx = useOutletContext<HomeOutletContext>();
  const { manifest, loading, draftSlides, slidesByFolder, selectedId, titleMap } = ctx;
  const t = useLocale();
  const lr = useLrText();
  const now = useNow();
  const times = useDeckTimes();
  const editing = useEditingDecks();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useSortPref();
  const [dialog, setDialog] = useState<Dialog>(null);

  const isAll = selectedId === ALL_SLIDES_ID;
  const isDraft = selectedId === DRAFT_ID;
  const folder =
    isAll || isDraft ? null : (manifest.folders.find((f) => f.id === selectedId) ?? null);
  const visible = isAll ? slideIds : isDraft ? draftSlides : (slidesByFolder[selectedId] ?? []);
  const filtered = useMemo(() => filterDecks(visible, query, titleMap), [visible, query, titleMap]);
  const sorted = useMemo(
    () => sortDecks(filtered, sortKey, (id) => titleMap[id] ?? id, slideCreatedAt),
    [filtered, sortKey, titleMap],
  );
  const searching = query.trim().length > 0;
  const showLoading = useDelayed(loading);
  const titleOf = (id: string) => titleMap[id] ?? id;

  const greeting = {
    morning: lr.home.greetingMorning,
    afternoon: lr.home.greetingAfternoon,
    evening: lr.home.greetingEvening,
  }[greetingFor(new Date(now).getHours())];

  const duplicate = async (id: string) => {
    try {
      const copy = await ctx.duplicateSlide(id);
      toast.success(format(t.home.toastSlideDuplicated, { slide: titleOf(id), newSlide: copy }));
    } catch {
      toast.error(t.home.toastSlideDuplicateFailed);
    }
  };

  const trash = async (id: string) => {
    try {
      await moveToTrash(id, titleOf(id));
    } catch {
      toast.error(lr.home.toastTrashFailed);
    }
  };

  const current = dialog ? dialog.id : null;
  const trashOn = isFeatureEnabled('trash');

  return (
    <div data-lr-home>
      {import.meta.env.DEV && isAll && (
        <>
          <header className="mb-6">
            <h1 className="font-heading text-[28px] font-bold leading-[34px] tracking-[-0.01em]">
              {greeting}
            </h1>
            <p className="lr-on-lime mt-0.5 text-[14px] text-muted-foreground">
              {lr.home.subtitle}
            </p>
          </header>
          <BriefCard />
        </>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        {folder ? (
          <FolderIconChip icon={folder.icon} className="size-5 text-[16px]" />
        ) : (
          <SystemViewIcon kind={isAll ? 'all' : 'draft'} className="text-muted-foreground" />
        )}
        <h2 className="font-heading text-[20px] font-semibold leading-7">
          {folder?.name ?? (isAll ? t.home.slides : t.home.draft)}
        </h2>
        <FolderSwitcher ctx={ctx} />
        {!loading && (
          <span className="folio ml-0.5">
            {pad2(searching ? filtered.length : visible.length)}
            {searching && <span className="opacity-40">/{pad2(visible.length)}</span>}
          </span>
        )}
        <div className="ml-auto flex w-full items-center gap-2 md:w-auto">
          <SortControl value={sortKey} onChange={setSortKey} />
          <SearchInput value={query} onChange={setQuery} />
        </div>
      </div>

      {loading ? (
        showLoading ? (
          <GridSkeleton />
        ) : null
      ) : visible.length === 0 ? (
        <EmptyHome isDraft={isAll || isDraft} folderName={folder?.name} />
      ) : filtered.length === 0 ? (
        <LemonEmpty
          state="thinking"
          title={t.home.noMatches}
          actions={
            <Button variant="outline" onClick={() => setQuery('')}>
              {t.home.clearSearch}
            </Button>
          }
        >
          {t.home.nothingMatchesPrefix}
          <span className="font-medium text-foreground">&ldquo;{query}&rdquo;</span>
          {t.home.nothingMatchesSuffix} {lr.home.noMatchesHint}
        </LemonEmpty>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-5">
          {import.meta.env.DEV && isAll && !searching && <NewDeckCard />}
          {sorted.map((id, i) => (
            <li
              key={id}
              className="lr-rise"
              style={{ animationDelay: `${Math.min(i, 11) * 40}ms` }}
            >
              <DeckCard
                id={id}
                now={now}
                modifiedAt={times[id]?.modifiedAt}
                editing={editing.has(id)}
                onTitleResolved={ctx.reportTitle}
                actions={{
                  onRename: () => setDialog({ kind: 'rename', id }),
                  onDuplicate: () => void duplicate(id),
                  onMove: () => setDialog({ kind: 'move', id }),
                  onDelete: () => (trashOn ? void trash(id) : setDialog({ kind: 'delete', id })),
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <RenameDialog
        open={dialog?.kind === 'rename'}
        initialName={current ? titleOf(current) : ''}
        onOpenChange={(open) => !open && setDialog(null)}
        onSubmit={async (name) => {
          if (current) await ctx.renameSlide(current, name);
          setDialog(null);
        }}
      />
      <MoveDialog
        open={dialog?.kind === 'move'}
        slideName={current ? titleOf(current) : ''}
        folders={manifest.folders}
        currentFolderId={current ? (manifest.assignments[current] ?? null) : null}
        onOpenChange={(open) => !open && setDialog(null)}
        onSubmit={async (folderId) => {
          if (current) await ctx.assign(current, folderId);
          setDialog(null);
        }}
      />
      <TypedConfirmDialog
        open={dialog?.kind === 'delete'}
        name={current ? titleOf(current) : ''}
        title={t.home.deleteDialogTitle}
        hint={format(lr.trash.confirmHint, { name: current ? titleOf(current) : '' })}
        label={lr.trash.confirmLabel}
        action={t.common.delete}
        onOpenChange={(open) => !open && setDialog(null)}
        onConfirm={async () => {
          if (current) await ctx.deleteSlide(current);
          setDialog(null);
        }}
      />
    </div>
  );
}

function NewDeckCard() {
  const lr = useLrText();
  const createDeck = useCreateDeck();
  return (
    <li>
      <button
        type="button"
        onClick={() => void createDeck()}
        className={cn(
          'flex h-full min-h-[190px] w-full flex-col items-center justify-center gap-2 rounded-[16px]',
          'border-[1.5px] border-dashed border-border text-[14px] font-semibold text-muted-foreground outline-none',
          'transition-colors duration-150 hover:border-[var(--lr-focus)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40',
        )}
      >
        <Plus className="size-7" />
        {lr.shell.newDeckCard}
      </button>
    </li>
  );
}

function GridSkeleton() {
  return (
    <ul aria-hidden className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-5">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="rounded-[16px] border border-border bg-card p-3">
          <span className="lr-skeleton block aspect-video rounded-[12px]" />
          <span className="lr-skeleton mt-3 block h-3.5 w-[70%] rounded-full" />
          <span className="lr-skeleton mt-2 block h-3.5 w-[45%] rounded-full" />
        </li>
      ))}
    </ul>
  );
}

function EmptyHome({ isDraft, folderName }: { isDraft: boolean; folderName?: string }) {
  const t = useLocale();
  const { provider } = useAgentStatus();
  const createDeck = useCreateDeck();
  if (!isDraft) {
    return (
      <LemonEmpty title={t.home.folderEmptyTitle.replace('{name}', folderName ?? '')}>
        {t.home.folderEmptyHint}
      </LemonEmpty>
    );
  }
  return (
    <LemonEmpty
      title={t.home.noSlidesYet}
      actions={
        import.meta.env.DEV &&
        provider && (
          <Button onClick={() => void createDeck()}>
            {format(t.agent.createDeckWith, { provider: provider.name })}
          </Button>
        )
      }
    >
      {!provider && (
        <>
          {t.home.createSlideHintPrefix}
          <code className="rounded-[4px] bg-muted px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">
            /create-slide
          </code>
          {t.home.createSlideHintSuffix}
        </>
      )}
    </LemonEmpty>
  );
}

/** On narrow screens the sidebar is hidden; this picks a folder instead. */
function FolderSwitcher({ ctx }: { ctx: HomeOutletContext }) {
  const t = useLocale();
  const { manifest, draftSlides, slidesByFolder, selectedId, selectFolder } = ctx;
  const item = (id: string, label: string, count: number, chip: ReactNode) => (
    <DropdownMenuItem
      key={id}
      onClick={() => selectFolder(id)}
      className={cn(selectedId === id && 'bg-muted text-foreground')}
    >
      {chip}
      <span className="flex-1 truncate">{label}</span>
      <span className="folio">{pad2(count)}</span>
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={t.home.folders}
            className="flex size-8 items-center justify-center rounded-[8px] border border-border bg-card text-muted-foreground outline-none hover:bg-muted md:hidden"
          >
            <ChevronDown className="size-4" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-[200px]">
        {item(ALL_SLIDES_ID, t.home.slides, slideIds.length, <SystemViewIcon kind="all" />)}
        {item(DRAFT_ID, t.home.draft, draftSlides.length, <SystemViewIcon kind="draft" />)}
        {manifest.folders.map((f) =>
          item(f.id, f.name, slidesByFolder[f.id]?.length ?? 0, <FolderIconChip icon={f.icon} />),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
