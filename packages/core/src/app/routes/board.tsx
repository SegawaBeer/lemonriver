import { ChevronLeft } from 'lucide-react';
import { lazy, Suspense, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/lib/use-document-title';
import { format, useLocale } from '@/lib/use-locale';
import { pad2 } from '@/lib/utils';
import { columnStarts } from '../../files/board-structure';
import { useBoardColumns } from '../components/board/use-board-columns';
import { usePageOrder } from '../components/board/use-page-order';
import type { Page } from '../lib/sdk';
import { useSlideModule } from '../lib/use-slide-module';

const BoardCanvas = lazy(() => import('../components/board/board-canvas'));

// A fresh [] on every render would restart the page-order state in a loop while
// the deck module is still loading.
const NO_PAGES: Page[] = [];

export function Board() {
  const { slideId = '' } = useParams();
  const navigate = useNavigate();
  const { slide, error } = useSlideModule(slideId);
  const t = useLocale();
  useDocumentTitle(slide?.meta?.title);

  const modulePages = slide?.default ?? NO_PAGES;
  const { pages, reorder, duplicate, insert, remove } = usePageOrder(slideId, modulePages);

  const columnTitle = useCallback(
    (n: number) => format(t.board.columnFallback, { n }),
    [t.board.columnFallback],
  );
  const { columns, moveBetweenColumns, resizeColumnAt, growColumn, renameColumn } = useBoardColumns(
    slideId,
    pages,
    columnTitle,
  );

  // Order and structure move together: every path that reorders a deck goes
  // through here, so the columns can never drift out of step with the pages.
  const movePage = useCallback(
    (from: number, to: number) => {
      moveBetweenColumns(from, to);
      void reorder(from, to);
    },
    [moveBetweenColumns, reorder],
  );

  const openPage = useCallback(
    (index: number) => {
      navigate(`/s/${encodeURIComponent(slideId)}?p=${index + 1}`);
    },
    [navigate, slideId],
  );

  const duplicatePage = useCallback(
    (index: number) => {
      resizeColumnAt(index, 1);
      void duplicate(index);
    },
    [duplicate, resizeColumnAt],
  );

  // A new page lands at the end of the column whose + was clicked.
  const addPage = useCallback(
    (columnIndex: number) => {
      if (!columns?.[columnIndex]) return;
      const starts = columnStarts(columns);
      const start = starts[columnIndex];
      const size = columns[columnIndex].size;
      growColumn(columnIndex, 1);
      void insert(size > 0 ? start + size : start);
    },
    [columns, growColumn, insert],
  );

  const moveToEnd = useCallback(
    (index: number) => movePage(index, pages.length - 1),
    [movePage, pages.length],
  );

  const deletePage = useCallback(
    (index: number) => {
      resizeColumnAt(index, -1);
      void remove(index);
    },
    [remove, resizeColumnAt],
  );

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-hairline px-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.board.backToDeck}
          onClick={() => navigate(`/s/${encodeURIComponent(slideId)}`)}
        >
          <ChevronLeft />
        </Button>
        <span className="eyebrow">{t.board.title}</span>
        <span className="truncate text-[13px] text-muted-foreground">
          {slide?.meta?.title ?? slideId}
        </span>
        <span className="folio ml-auto">{pad2(pages.length)}</span>
        <span className="hidden text-[11.5px] text-muted-foreground/70 sm:inline">
          {t.board.hint}
        </span>
      </header>
      <div className="relative min-h-0 flex-1">
        {error ? (
          <p className="grid h-full place-items-center px-6 text-center text-[13px] text-destructive">
            {error}
          </p>
        ) : pages.length === 0 || !columns ? (
          <p className="grid h-full place-items-center text-[13px] text-muted-foreground">
            {t.board.loading}
          </p>
        ) : (
          <Suspense fallback={null}>
            <BoardCanvas
              slideId={slideId}
              pages={pages}
              notes={slide?.notes}
              columns={columns}
              design={slide?.design}
              onOpenPage={openPage}
              onMovePage={movePage}
              onRenameColumn={renameColumn}
              onAddPage={addPage}
              onDuplicate={duplicatePage}
              onDelete={deletePage}
              onMoveToEnd={moveToEnd}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
