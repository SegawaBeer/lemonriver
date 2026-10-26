import { ChevronLeft } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/lib/use-document-title';
import { format } from '@/lib/use-locale';
import { pad2 } from '@/lib/utils';
import type { Page } from '../../lib/sdk';
import { useSlideModule } from '../../lib/use-slide-module';
import { useLrText } from '../text';
import { columnStarts } from './model/structure';
import { useBoardCards } from './use-board-cards';
import { useBoardColumns } from './use-board-columns';
import { usePageOrder } from './use-page-order';

const BoardCanvas = lazy(() => import('./board-canvas'));

// A fresh [] on every render would restart the page-order state in a loop while
// the deck module is still loading.
const NO_PAGES: Page[] = [];

const LINKS_KEY = 'open-slide:board-links-visible';

function useLinksVisible() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(LINKS_KEY) !== '0';
  });
  useEffect(() => {
    window.localStorage.setItem(LINKS_KEY, visible ? '1' : '0');
  }, [visible]);
  const toggle = useCallback(() => setVisible((v) => !v), []);
  return [visible, toggle] as const;
}

export function Board() {
  const { slideId = '' } = useParams();
  const navigate = useNavigate();
  const { slide, error } = useSlideModule(slideId);
  const lr = useLrText();
  useDocumentTitle(slide?.meta?.title);

  const modulePages = slide?.default ?? NO_PAGES;
  const { pages, reorder, duplicate, insert, remove } = usePageOrder(slideId, modulePages);

  const columnTitle = useCallback(
    (n: number) => format(lr.board.columnFallback, { n }),
    [lr.board.columnFallback],
  );
  const { columns, moveBetweenColumns, resizeColumnAt, growColumn, renameColumn } = useBoardColumns(
    slideId,
    pages,
    columnTitle,
  );
  const { ready, cards, pairs, patch, link, unlink, beginOp } = useBoardCards(
    slideId,
    modulePages,
    pages.length,
  );
  const [showLinks, toggleLinks] = useLinksVisible();

  // Order, structure and the board's own card data move together: every path
  // that changes the deck's pages goes through here, so none of them can drift
  // out of step with the pages.
  const movePage = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const settle = beginOp({ kind: 'move', from, to });
      moveBetweenColumns(from, to);
      void reorder(from, to).then(settle);
    },
    [beginOp, moveBetweenColumns, reorder],
  );

  const openPage = useCallback(
    (index: number) => {
      navigate(`/s/${encodeURIComponent(slideId)}?p=${index + 1}`);
    },
    [navigate, slideId],
  );

  const duplicatePage = useCallback(
    (index: number) => {
      const settle = beginOp({ kind: 'duplicate', index });
      resizeColumnAt(index, 1);
      void duplicate(index).then(settle);
    },
    [beginOp, duplicate, resizeColumnAt],
  );

  // A new page lands at the end of the column whose + was clicked.
  const addPage = useCallback(
    (columnIndex: number) => {
      if (!columns?.[columnIndex]) return;
      const starts = columnStarts(columns);
      const start = starts[columnIndex];
      const size = columns[columnIndex].size;
      const at = size > 0 ? start + size : start;
      const settle = beginOp({ kind: 'insert', index: at });
      growColumn(columnIndex, 1);
      void insert(at).then(settle);
    },
    [beginOp, columns, growColumn, insert],
  );

  const moveToEnd = useCallback(
    (index: number) => movePage(index, pages.length - 1),
    [movePage, pages.length],
  );

  const deletePage = useCallback(
    (index: number) => {
      if (pages.length <= 1) return;
      const settle = beginOp({ kind: 'delete', index });
      resizeColumnAt(index, -1);
      void remove(index).then(settle);
    },
    [beginOp, pages.length, remove, resizeColumnAt],
  );

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-hairline px-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={lr.board.backToDeck}
          onClick={() => navigate(`/s/${encodeURIComponent(slideId)}`)}
        >
          <ChevronLeft />
        </Button>
        <span className="eyebrow">{lr.board.title}</span>
        <span className="truncate text-[13px] text-muted-foreground">
          {slide?.meta?.title ?? slideId}
        </span>
        <span className="folio ml-auto">{pad2(pages.length)}</span>
        <span className="hidden text-[11.5px] text-muted-foreground/70 sm:inline">
          {lr.board.hint}
        </span>
      </header>
      <div className="relative min-h-0 flex-1">
        {error ? (
          <p className="grid h-full place-items-center px-6 text-center text-[13px] text-destructive">
            {error}
          </p>
        ) : pages.length === 0 || !columns ? (
          <p className="grid h-full place-items-center text-[13px] text-muted-foreground">
            {lr.board.loading}
          </p>
        ) : (
          <Suspense fallback={null}>
            <BoardCanvas
              slideId={slideId}
              pages={pages}
              notes={slide?.notes}
              cards={cards}
              cardsReady={ready}
              links={pairs}
              showLinks={showLinks}
              columns={columns}
              design={slide?.design}
              onOpenPage={openPage}
              onMovePage={movePage}
              onRenameColumn={renameColumn}
              onAddPage={addPage}
              onDuplicate={duplicatePage}
              onDelete={deletePage}
              onMoveToEnd={moveToEnd}
              onPatchCard={patch}
              onLink={link}
              onUnlink={unlink}
              onToggleLinks={toggleLinks}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
