import { Copy, FolderInput, MoreHorizontal, Palette, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, plural, useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { SLIDE_DND_MIME } from '../../components/sidebar/folder-item';
import { SlideCanvas } from '../../components/slide-canvas';
import { SlidePageProvider } from '../../lib/page-context';
import type { SlideModule } from '../../lib/sdk';
import { loadSlide } from '../../lib/slides';
import { Mascot } from '../brand/mascot';
import { useLrText } from '../text';
import { relativeTime } from './time';
import { useDelayed } from './use-delayed';

export type DeckCardActions = {
  onRename: () => void;
  onDuplicate: () => void;
  onMove: () => void;
  onDelete: () => void;
};

export function DeckCard({
  id,
  modifiedAt,
  editing,
  now,
  onTitleResolved,
  actions,
}: {
  id: string;
  modifiedAt: number | undefined;
  editing: boolean;
  now: number;
  onTitleResolved: (id: string, title: string) => void;
  actions: DeckCardActions;
}) {
  const t = useLocale();
  const lr = useLrText();
  const [slide, setSlide] = useState<SlideModule | null>(null);
  const [dragging, setDragging] = useState(false);
  const skeleton = useDelayed(!slide);

  useEffect(() => {
    let cancelled = false;
    loadSlide(id)
      .then((mod) => {
        if (!cancelled) setSlide(mod);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  const title = slide?.meta?.title ?? id;
  const FirstPage = slide?.default[0];
  const pages = slide?.default.length ?? 0;

  useEffect(() => {
    if (slide) onTitleResolved(id, title);
  }, [id, slide, title, onTitleResolved]);

  const sub = [
    slide ? format(plural(pages, lr.home.pages), { n: pages }) : null,
    modifiedAt ? relativeTime(modifiedAt, now, t.id) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag source wraps the card's links
    <div
      data-lr-deck={id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(SLIDE_DND_MIME, id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={cn(
        'group relative rounded-[16px] border border-border bg-card shadow-[var(--lr-shadow-1)]',
        'motion-safe:transition-[translate,box-shadow,opacity] motion-safe:duration-[160ms] hover:-translate-y-0.5 hover:shadow-[var(--lr-shadow-2)]',
        dragging && 'opacity-40',
      )}
    >
      <Link
        to={`/s/${id}`}
        tabIndex={-1}
        aria-hidden
        className="relative block aspect-video overflow-hidden rounded-t-[16px] bg-white"
      >
        {FirstPage ? (
          <SlideCanvas flat freezeMotion design={slide?.design}>
            <SlidePageProvider index={0} total={pages}>
              <FirstPage />
            </SlidePageProvider>
          </SlideCanvas>
        ) : skeleton ? (
          <span className="lr-skeleton absolute inset-0" />
        ) : null}
        {editing && (
          <span className="absolute top-2.5 left-2.5 inline-flex h-[26px] items-center gap-1.5 rounded-full bg-[rgba(19,36,15,0.82)] pr-2.5 pl-1 text-[12px] font-semibold text-white">
            <Mascot state="working" size={20} />
            {lr.home.editing}
          </span>
        )}
      </Link>
      <div className="flex items-start gap-2 py-3 pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <Link
            to={`/s/${id}`}
            className="block rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <h3 className="truncate text-[14px] font-semibold leading-5 text-foreground">
              {title}
            </h3>
          </Link>
          <p className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] leading-4 text-muted-foreground">
            {sub && <span className="truncate">{sub}</span>}
            {slide?.meta?.theme && (
              <Link
                to={`/themes/${encodeURIComponent(slide.meta.theme)}`}
                className="inline-flex shrink-0 items-center gap-1 hover:text-foreground"
              >
                <Palette className="size-3" aria-hidden />
                <span className="max-w-[110px] truncate">{slide.meta.theme}</span>
              </Link>
            )}
          </p>
        </div>
        {import.meta.env.DEV && <DeckMenu actions={actions} />}
      </div>
    </div>
  );
}

function DeckMenu({ actions }: { actions: DeckCardActions }) {
  const t = useLocale();
  const lr = useLrText();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={t.home.slideActions}
            className="-mt-1 flex size-9 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 aria-expanded:bg-muted"
          >
            <MoreHorizontal className="size-[18px]" />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[168px]">
        <DropdownMenuItem onClick={actions.onRename}>
          <Pencil />
          {t.common.rename}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={actions.onDuplicate}>
          <Copy />
          {t.home.duplicate}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={actions.onMove}>
          <FolderInput />
          {t.home.moveToFolder}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={actions.onDelete}>
          <Trash2 />
          {lr.home.moveToTrash}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
