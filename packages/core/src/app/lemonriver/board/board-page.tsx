import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Columns3,
  Combine,
  Copy,
  Filter,
  Grid2X2,
  Image as ImageIcon,
  List,
  Plus,
  Redo2,
  Rows3,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { setDockOpen } from '@/lib/agent/use-agent';
import { isTypingTarget } from '@/lib/keys';
import { useDocumentTitle } from '@/lib/use-document-title';
import { format, useLocale } from '@/lib/use-locale';
import { cn, pad2 } from '@/lib/utils';
import type { Page } from '../../lib/sdk';
import { useSlideModule } from '../../lib/use-slide-module';
import { useLrText } from '../text';
import { BlockPanel } from './blocks/block-panel';
import { pageReadOf } from './blocks/cache';
import { ChangeList } from './blocks/change-list';
import type { Block } from './blocks/classify';
import { type CardSize, orderAfterMoveMany } from './layout';
import type { PageAction } from './model/agent-tasks';
import {
  type BoardApplying,
  type BoardLastApply,
  type ChapterPlan,
  sanitizeChapterPlan,
} from './model/apply';
import {
  type BoardCard,
  CARD_STATUSES,
  type CardPatch,
  type CardStatus,
  entriesAfter,
  isSettledKey,
  originAfter,
  type PageOp,
  pageKeys,
} from './model/cards';
import { carryChanges, type Placement, sanitizeChanges, staleChanges } from './model/changes';
import {
  type BoardFilter,
  EMPTY_FILTER,
  isFilterActive,
  matchesFilter,
  toggleStatus,
} from './model/filter';
import type { HistoryStep } from './model/history';
import {
  addMerge,
  addSplit,
  carryRestructures,
  type Restructure,
  restructureReplaced,
  type SplitBlock,
  sanitizeRestructures,
} from './model/restructure';
import {
  addColumnAfter,
  type BoardColumn,
  columnStarts,
  columnsAfterInsert,
  columnsAfterMoveMany,
  columnsAfterRemove,
  deleteColumnAt,
  insertPageColumn,
  moveColumnBlock,
  orderAfterColumnMove,
  renameColumnAt,
} from './model/structure';
import { useStatusLabels } from './page-node';
import { useBoardApply } from './use-board-apply';
import { countAfter, useBoardCards } from './use-board-cards';
import { useBoardChanges } from './use-board-changes';
import { useBoardColumns } from './use-board-columns';
import { useBoardComments } from './use-board-comments';
import { useBoardRestructures } from './use-board-restructures';
import { useHistory } from './use-history';
import { usePageOrder } from './use-page-order';

const BoardCanvas = lazy(() => import('./board-canvas'));

// A fresh [] on every render would restart the page-order state in a loop while
// the deck module is still loading.
const NO_PAGES: Page[] = [];

const LINKS_KEY = 'open-slide:board-links-visible';
const SIZE_KEY = 'open-slide:board-card-size';
const BLOCKS_KEY = 'open-slide:board-blocks-visible';
const collapsedKey = (slideId: string) => `open-slide:board-collapsed:${slideId}`;

function useBlocksVisible() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(BLOCKS_KEY) === '1';
  });
  useEffect(() => {
    window.localStorage.setItem(BLOCKS_KEY, visible ? '1' : '0');
  }, [visible]);
  const toggle = useCallback(() => setVisible((v) => !v), []);
  return [visible, toggle] as const;
}

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

/** How much of a page the cards show. A preference, so it outlives the visit. */
function useCardSize(): [CardSize, (size: CardSize) => void] {
  const [size, setSize] = useState<CardSize>(() => {
    if (typeof window === 'undefined') return 'large';
    const stored = window.localStorage.getItem(SIZE_KEY);
    return stored === 'small' || stored === 'title' ? stored : 'large';
  });
  const choose = useCallback((next: CardSize) => {
    setSize(next);
    window.localStorage.setItem(SIZE_KEY, next);
  }, []);
  return [size, choose];
}

/** Folded chapters, by index. A view state, kept per deck in the browser. */
function useFolded(slideId: string): [boolean[], (index: number) => void, (count: number) => void] {
  const read = useCallback((): number[] => {
    if (typeof window === 'undefined') return [];
    try {
      const parsed: unknown = JSON.parse(
        window.localStorage.getItem(collapsedKey(slideId)) ?? '[]',
      );
      return Array.isArray(parsed)
        ? parsed.filter((value): value is number => typeof value === 'number' && value >= 0)
        : [];
    } catch {
      return [];
    }
  }, [slideId]);

  const [folded, setFolded] = useState<number[]>(read);
  useEffect(() => setFolded(read()), [read]);

  const toggle = useCallback(
    (index: number) => {
      setFolded((current) => {
        const next = current.includes(index)
          ? current.filter((value) => value !== index)
          : [...current, index];
        window.localStorage.setItem(collapsedKey(slideId), JSON.stringify(next));
        return next;
      });
    },
    [slideId],
  );

  // A chapter that went away takes its folded state with it, so a chapter that
  // later lands on that index does not open folded for no reason.
  const trim = useCallback(
    (count: number) =>
      setFolded((current) => {
        const next = current.filter((index) => index < count);
        return next.length === current.length ? current : next;
      }),
    [],
  );

  const collapsed = useMemo(() => {
    const flags: boolean[] = [];
    for (const index of folded) flags[index] = true;
    return flags;
  }, [folded]);

  return [collapsed, toggle, trim];
}

/** The inverse of a page permutation, both expressed as `next[index] = previous[?]`. */
function invertOrder(order: number[]): number[] {
  const inverse = new Array<number>(order.length);
  order.forEach((from, to) => {
    inverse[from] = to;
  });
  return inverse;
}

const isIdentity = (order: number[]) => order.every((value, index) => value === index);

export function Board() {
  const { slideId = '' } = useParams();
  const navigate = useNavigate();
  const { slide, error } = useSlideModule(slideId);
  const lr = useLrText();
  const t = useLocale();
  const labels = useStatusLabels();
  useDocumentTitle(slide?.meta?.title);

  const modulePages = slide?.default ?? NO_PAGES;
  const { pages, reorderAll, duplicate, insert, restore, remove } = usePageOrder(
    slideId,
    modulePages,
  );

  const columnTitle = useCallback(
    (n: number) => format(lr.board.columnFallback, { n }),
    [lr.board.columnFallback],
  );
  const { columns, applyColumns, adoptColumns } = useBoardColumns(slideId, pages, columnTitle);
  const {
    ready,
    keys,
    entries,
    cards,
    pairs,
    links,
    patch,
    link,
    unlink,
    beginOp,
    entryAt,
    addLinks,
    refreshCards,
  } = useBoardCards(slideId, modulePages, pages.length);
  const comments = useBoardComments(slideId, pages.length);
  const history = useHistory(slideId);
  const { changes, setChanges, replace: replaceChanges } = useBoardChanges(slideId);
  const {
    restructures,
    setRestructures,
    replace: replaceRestructures,
  } = useBoardRestructures(slideId);
  const [showLinks, toggleLinks] = useLinksVisible();
  const [showBlocks, toggleBlocks] = useBlocksVisible();
  const [size, chooseSize] = useCardSize();
  const [collapsed, toggleCollapse, trimFolded] = useFolded(slideId);
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER);
  const [selected, setSelected] = useState<number[]>([]);
  const [pendingDelete, setPendingDelete] = useState<number[] | null>(null);

  const pageCount = useRef(pages.length);
  pageCount.current = pages.length;

  const changesRef = useRef(changes);
  changesRef.current = changes;

  const restructuresRef = useRef(restructures);
  restructuresRef.current = restructures;

  /** A page operation carries the block moves and the splits along with it. */
  const beginPageOp = useCallback(
    (op: PageOp, count: number) => {
      const snapshot = changesRef.current;
      const savedRestructures = restructuresRef.current;
      const before = pageKeys(entries, count);
      if (before.every(isSettledKey)) {
        const after = pageKeys(entriesAfter(op, entries, count), countAfter(op, count));
        setChanges(carryChanges(snapshot, before, after, originAfter(op, count)));
        setRestructures(
          carryRestructures(savedRestructures, before, after, originAfter(op, count)),
        );
      }
      const settle = beginOp(op, count);
      return (ok: boolean) => {
        if (!ok) {
          setChanges(snapshot);
          setRestructures(savedRestructures);
        }
        settle(ok);
      };
    },
    [entries, setChanges, setRestructures, beginOp],
  );

  const applyChanges = useCallback(
    (next: Placement[]) => {
      const previous = changesRef.current;
      setChanges(next);
      history.record({ undo: () => setChanges(previous), redo: () => setChanges(next) });
    },
    [setChanges, history],
  );

  const removeChanges = useCallback(
    (indices: number[]) => {
      const drop = new Set(indices);
      applyChanges(changesRef.current.filter((_, index) => !drop.has(index)));
    },
    [applyChanges],
  );

  const applyRestructures = useCallback(
    (next: Restructure[]) => {
      const previous = restructuresRef.current;
      setRestructures(next);
      history.record({ undo: () => setRestructures(previous), redo: () => setRestructures(next) });
    },
    [setRestructures, history],
  );

  const removeRestructures = useCallback(
    (indices: number[]) => {
      const drop = new Set(indices);
      applyRestructures(restructuresRef.current.filter((_, index) => !drop.has(index)));
    },
    [applyRestructures],
  );

  /** Splitting the same page again replaces what the board already recorded. */
  const splitPage = useCallback(
    (page: string, blocks: SplitBlock[]) => {
      const entry: Restructure = { kind: 'split', page, blocks: blocks.map((block) => block.id) };
      if (restructureReplaced(restructuresRef.current, entry)) {
        toast.info(lr.board.restructureReplaced);
      }
      applyRestructures(addSplit(restructuresRef.current, page, blocks));
    },
    [applyRestructures, lr.board.restructureReplaced],
  );

  const mergeSelected = useCallback(() => {
    if (selected.length !== 2) return;
    const [a, b] = [...selected].sort((one, other) => one - other);
    const first = keys[a];
    const second = keys[b];
    if (!first || !second) return;
    if (restructureReplaced(restructuresRef.current, { kind: 'merge', pages: [first, second] })) {
      toast.info(lr.board.restructureReplaced);
    }
    applyRestructures(addMerge(restructuresRef.current, first, second));
  }, [applyRestructures, keys, lr.board.restructureReplaced, selected]);

  useEffect(() => {
    setSelected((current) => current.filter((index) => index < pages.length));
  }, [pages.length]);

  useEffect(() => {
    if (columns) trimFolded(columns.length);
  }, [columns, trimFolded]);

  const filterActive = isFilterActive(filter);

  const dimmed = useMemo(
    () => cards.map((card, index) => !matchesFilter(card, comments[index] === true, filter)),
    [cards, comments, filter],
  );

  const changeCounts = useMemo(() => {
    const counts = new Array<number>(pages.length).fill(0);
    const at = new Map(keys.map((key, index) => [key, index]));
    for (const item of changes) {
      const from = at.get(item.origin.page);
      if (from !== undefined) counts[from] += 1;
      if (item.to === 'parked') continue;
      const to = at.get(item.to.page);
      if (to !== undefined && to !== from) counts[to] += 1;
    }
    for (const entry of restructures) {
      const touched = entry.kind === 'split' ? [entry.page] : entry.pages;
      for (const key of touched) {
        const index = at.get(key);
        if (index !== undefined) counts[index] += 1;
      }
    }
    return counts;
  }, [changes, restructures, keys, pages.length]);

  const blocksOfPage = useCallback(
    (key: string): Block[] | null => {
      const index = keys.indexOf(key);
      const page = index >= 0 ? pages[index] : undefined;
      if (!page) return null;
      const read = pageReadOf(page);
      return read && 'blocks' in read ? read.blocks : null;
    },
    [keys, pages],
  );

  // ----- handing the list to the agent -----

  const [flashed, setFlashed] = useState<string[]>([]);
  const [undoOpen, setUndoOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [chapterAt, setChapterAt] = useState<number | null>(null);
  const [chapterBrief, setChapterBrief] = useState('');
  const [chapterCount, setChapterCount] = useState(3);
  const [planItems, setPlanItems] = useState<ChapterPlan['items']>([]);
  const [syncedPlan, setSyncedPlan] = useState<string | null>(null);

  const refreshLists = useCallback(async () => {
    try {
      const [found, splits] = await Promise.all([
        fetch(`/__board/changes?slideId=${encodeURIComponent(slideId)}`),
        fetch(`/__board/restructures?slideId=${encodeURIComponent(slideId)}`),
      ]);
      if (found.ok) {
        const body = (await found.json()) as { changes?: unknown };
        replaceChanges(sanitizeChanges(body.changes));
      }
      if (splits.ok) {
        const body = (await splits.json()) as { restructures?: unknown };
        replaceRestructures(sanitizeRestructures(body.restructures));
      }
    } catch {}
  }, [replaceChanges, replaceRestructures, slideId]);

  const askUndo = useCallback(() => setUndoOpen(true), []);

  /** A hand-over that has just ended: say how it went, and light up what changed. */
  const onSettled = useCallback(
    (last: BoardLastApply | null, was: BoardApplying | null) => {
      void refreshLists();
      // The task may have named the pages it added; those titles are the
      // server's, not anything this board knows.
      void refreshCards();
      if (!last) return;
      if (!last.ok) {
        toast.error(format(lr.board.applyFailed, { reason: last.error ?? '' }), {
          duration: 10_000,
          action: { label: lr.outline.openAgent, onClick: () => setDockOpen(true) },
        });
        return;
      }
      setFlashed(last.pages);
      const undo = { label: lr.board.undoTask, onClick: askUndo };
      const task = was?.task;
      if (task?.kind === 'page') {
        const n = keys.indexOf(task.page) + 1;
        toast.success(
          task.action === 'expand'
            ? format(lr.board.askExpanded, { n })
            : format(lr.board.askDone, { n }),
          { duration: 10_000, action: undo },
        );
        return;
      }
      if (task?.kind === 'chapter-write') {
        toast.success(
          format(lr.board.chapterWritten, { n: task.chapter + 1, k: last.pages.length }),
          {
            duration: 10_000,
            action: undo,
          },
        );
        return;
      }
      toast.success(lr.board.applyDone, {
        duration: 10_000,
        action: { label: lr.board.applyUndo, onClick: askUndo },
      });
    },
    [
      askUndo,
      keys,
      lr.board.applyDone,
      lr.board.applyFailed,
      lr.board.applyUndo,
      lr.board.askDone,
      lr.board.askExpanded,
      lr.board.chapterWritten,
      lr.board.undoTask,
      lr.outline.openAgent,
      refreshCards,
      refreshLists,
    ],
  );

  const boardApply = useBoardApply(slideId, onSettled);
  const applying = boardApply.applying !== null;

  // A task that adds or removes pages rewrites the chapters on the server; the
  // board takes them as they are instead of sharing the new pages out itself.
  useEffect(() => {
    if (boardApply.columns) adoptColumns(boardApply.columns);
  }, [adoptColumns, boardApply.columns]);

  /** Why "ask the agent" is off for every page, before a page's own reasons. */
  const agentHint = applying
    ? lr.board.askBusy
    : !boardApply.connected
      ? lr.board.askNeedsAgent
      : building
        ? lr.board.askBuilding
        : null;

  const startPageTask = useCallback(
    (index: number, action: PageAction) => {
      const key = keys[index];
      if (!key || agentHint || changeCounts[index] > 0) return;
      if (action === 'memo' && !cards[index]?.memo?.trim()) return;
      void boardApply.start({ kind: 'page', page: key, action });
    },
    [agentHint, boardApply, cards, changeCounts, keys],
  );

  const applyingLabel = useMemo(() => {
    const task = boardApply.applying?.task;
    if (!task) return lr.board.applying;
    if (task.kind === 'page') {
      return format(lr.board.askingPage[task.action], { n: keys.indexOf(task.page) + 1 });
    }
    if (task.kind === 'chapter-plan') {
      return format(lr.board.planningChapter, { n: task.chapter + 1 });
    }
    if (task.kind === 'chapter-write') {
      return format(lr.board.writingChapter, { n: task.chapter + 1 });
    }
    return lr.board.applying;
  }, [boardApply.applying, keys, lr.board]);

  const planFor = useCallback(
    (column: number): 'planning' | number | null => {
      const task = boardApply.applying?.task;
      if (task?.kind === 'chapter-plan' && task.chapter === column) return 'planning';
      const plan = boardApply.chapterPlan;
      if (plan && plan.chapter === column && plan.state === 'ready') return plan.items.length;
      return null;
    },
    [boardApply.applying, boardApply.chapterPlan],
  );

  const openChapter = useCallback((column: number) => {
    setChapterAt(column);
    setChapterBrief('');
    setChapterCount(3);
    setPlanItems([]);
    setSyncedPlan(null);
  }, []);

  const planAt =
    boardApply.chapterPlan && chapterAt !== null && boardApply.chapterPlan.chapter === chapterAt
      ? boardApply.chapterPlan
      : null;
  const planningHere =
    boardApply.applying?.task.kind === 'chapter-plan' &&
    chapterAt !== null &&
    boardApply.applying.task.chapter === chapterAt;
  const writingHere =
    boardApply.applying?.task.kind === 'chapter-write' &&
    chapterAt !== null &&
    boardApply.applying.task.chapter === chapterAt;

  // The titles arrive once; a later read of the same record must not wipe what
  // the user has typed into them since.
  const planKey = planAt
    ? `${planAt.chapter}|${planAt.state}|${planAt.items.map((item) => item.title).join('\u0001')}`
    : null;
  useEffect(() => {
    if (planAt?.state !== 'ready' || planKey === null || syncedPlan === planKey) return;
    setPlanItems(planAt.items);
    setChapterBrief(planAt.brief);
    setSyncedPlan(planKey);
  }, [planAt, planKey, syncedPlan]);

  const startChapterPlan = useCallback(() => {
    if (chapterAt === null || !chapterBrief.trim()) return;
    const brief = planAt?.brief || chapterBrief.trim();
    void boardApply.start({
      kind: 'chapter-plan',
      chapter: chapterAt,
      title: columns?.[chapterAt]?.title ?? '',
      brief,
      count: chapterCount,
    });
  }, [boardApply, chapterAt, chapterBrief, chapterCount, columns, planAt]);

  const dropChapterPlan = useCallback(() => {
    void boardApply.savePlan(null);
    setChapterAt(null);
  }, [boardApply]);

  const writeChapter = useCallback(async () => {
    if (chapterAt === null) return;
    const title = columns?.[chapterAt]?.title ?? planAt?.title ?? '';
    const saved = sanitizeChapterPlan({
      chapter: chapterAt,
      title,
      brief: planAt?.brief ?? chapterBrief,
      items: planItems,
      state: 'ready',
    });
    if (!saved) return;
    await boardApply.savePlan(saved);
    setChapterAt(null);
    void boardApply.start({ kind: 'chapter-write', chapter: chapterAt, title });
  }, [boardApply, chapterAt, chapterBrief, columns, planAt, planItems]);

  const movePlanItem = useCallback((from: number, to: number) => {
    setPlanItems((items) => {
      if (to < 0 || to >= items.length || from === to) return items;
      const next = items.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const editPlanItem = useCallback((at: number, title: string) => {
    setPlanItems((items) => items.map((item, i) => (i === at ? { ...item, title } : item)));
  }, []);

  const addPlanItem = useCallback(() => {
    setPlanItems((items) =>
      items.length >= 8
        ? items
        : [
            ...items,
            { id: `plan-${Date.now().toString(36)}-${items.length}`, title: '', kind: 'page' },
          ],
    );
  }, []);

  useEffect(() => {
    if (flashed.length === 0) return;
    const timer = window.setTimeout(() => setFlashed([]), 1600);
    return () => window.clearTimeout(timer);
  }, [flashed]);

  // The outline lays the deck out page by page; a change list applied on top
  // of that would fight it.
  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      try {
        const res = await fetch(`/__lr/outline?slideId=${encodeURIComponent(slideId)}`);
        if (!res.ok) return;
        const body = (await res.json()) as { outline?: { state?: string } | null };
        if (!cancelled) setBuilding(body.outline?.state === 'building');
      } catch {}
    };
    void read();
    const timer = window.setInterval(() => void read(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [slideId]);

  const undoLastApply = useCallback(async () => {
    const ok = await boardApply.undoLast();
    setUndoOpen(false);
    if (ok) {
      toast.success(lr.board.applyUndone);
      void refreshLists();
    } else {
      toast.error(lr.board.undoFailed);
    }
  }, [boardApply, lr.board.applyUndone, lr.board.undoFailed, refreshLists]);

  const staleCount = useMemo(
    () => staleChanges(changes, blocksOfPage).size,
    [changes, blocksOfPage],
  );

  const applyHint = applying
    ? null
    : !boardApply.connected
      ? lr.board.applyNeedsAgent
      : building
        ? lr.board.applyBuilding
        : staleCount > 0
          ? lr.board.applyStale
          : null;

  const totalChanges = changes.length + restructures.length;
  const flashedPages = useMemo(
    () => flashed.map((key) => keys.indexOf(key)).filter((index) => index >= 0),
    [flashed, keys],
  );

  // ----- deck operations, each with the step that takes it back -----

  /** Applies a whole new page order together with the chapters it implies. */
  const performOrder = useCallback(
    async (order: number[], nextColumns: BoardColumn[], count: number) => {
      const settle = beginPageOp({ kind: 'reorder', order }, count);
      applyColumns(nextColumns);
      await reorderAll(order).then(settle);
    },
    [beginPageOp, applyColumns, reorderAll],
  );

  const performDuplicate = useCallback(
    async (indices: number[], startCount: number, nextColumns: BoardColumn[]) => {
      const sorted = [...new Set(indices)].sort((a, b) => b - a);
      applyColumns(nextColumns);
      let total = startCount;
      for (const index of sorted) {
        const settle = beginPageOp({ kind: 'duplicate', index }, total);
        const ok = await duplicate(index);
        settle(ok);
        if (!ok) return false;
        total += 1;
      }
      return true;
    },
    [applyColumns, beginPageOp, duplicate],
  );

  /** Removes pages from the highest index down. */
  const performDelete = useCallback(
    async (indices: number[], startCount: number, nextColumns: BoardColumn[]) => {
      const sorted = [...new Set(indices)].sort((a, b) => b - a);
      applyColumns(nextColumns);
      let total = startCount;
      for (const index of sorted) {
        const settle = beginPageOp({ kind: 'delete', index }, total);
        const ok = await remove(index);
        settle(ok);
        if (!ok) return false;
        total -= 1;
      }
      return true;
    },
    [applyColumns, beginPageOp, remove],
  );

  const performRestore = useCallback(
    async (
      restores: { index: number; entry: string; card?: BoardCard | null }[],
      startCount: number,
      nextColumns: BoardColumn[],
    ) => {
      const sorted = [...restores].sort((a, b) => a.index - b.index);
      applyColumns(nextColumns);
      let total = startCount;
      for (const { index, entry, card } of sorted) {
        const settle = beginPageOp({ kind: 'restore', index, entry, card }, total);
        const ok = await restore(index, entry);
        settle(ok);
        if (!ok) return false;
        total += 1;
      }
      return true;
    },
    [applyColumns, beginPageOp, restore],
  );

  const movePages = useCallback(
    (moving: number[], to: number) => {
      if (!columns) return;
      const order = orderAfterMoveMany(pageCount.current, moving, to);
      if (isIdentity(order)) return;
      const nextColumns = columnsAfterMoveMany(columns, moving, to);
      const inverse = invertOrder(order);
      const count = pageCount.current;
      void performOrder(order, nextColumns, count);
      history.record({
        undo: () => performOrder(inverse, columns, count),
        redo: () => performOrder(order, nextColumns, count),
      });
    },
    [columns, performOrder, history],
  );

  const duplicatePages = useCallback(
    (indices: number[]) => {
      if (!columns) return;
      const count = pageCount.current;
      const sorted = [...new Set(indices)].sort((a, b) => b - a);
      const after = (done: number) => columnsAfterInsert(columns, sorted.slice(0, done));
      const steps: HistoryStep[] = sorted.map((index, at) => ({
        undo: async () => {
          await performDelete([index + 1], count + 1 + at, after(at));
        },
        redo: async () => {
          await performDuplicate([index], count + at, after(at));
        },
      }));
      void performDuplicate(sorted, count, after(sorted.length));
      history.record(groupSteps(steps));
    },
    [columns, performDelete, performDuplicate, history],
  );

  const deletePages = useCallback(
    (indices: number[]) => {
      if (!columns) return;
      const count = pageCount.current;
      const sorted = [...new Set(indices)].sort((a, b) => b - a);
      if (sorted.length === 0 || count - sorted.length < 1) return;
      // What the page carried lives beside the deck, so it has to be held here
      // while the page is gone or the undo would bring back an empty card.
      const saved = sorted.map((index) => {
        const entry = entryAt(index);
        return {
          index,
          entry,
          card: cards[index] ?? null,
          linked: entry ? links.filter((link) => link.a === entry || link.b === entry) : [],
        };
      });
      // Block moves that involve a removed page go with it, and come back with
      // it: the page lands on the same entry, so the whole list is restored.
      const changesBefore = changesRef.current;
      const restructuresBefore = restructuresRef.current;
      const before = (done: number) => columnsAfterRemove(columns, sorted.slice(0, done));
      const steps: HistoryStep[] = saved.map(({ index, entry, card, linked }, at) => ({
        undo: entry
          ? async () => {
              await performRestore([{ index, entry, card }], count - 1 - at, before(at));
              addLinks(linked);
              setChanges(changesBefore);
              setRestructures(restructuresBefore);
            }
          : null,
        redo: async () => {
          await performDelete([index], count - at, before(at + 1));
        },
      }));
      void performDelete(sorted, count, before(sorted.length));
      history.record(groupSteps(steps));
      setSelected([]);
    },
    [
      columns,
      performDelete,
      performRestore,
      entryAt,
      cards,
      links,
      addLinks,
      history,
      setChanges,
      setRestructures,
    ],
  );

  const insertPage = useCallback(
    (at: number, columnIndex: number) => {
      if (!columns) return;
      const count = pageCount.current;
      const previous = columns;
      const nextColumns = columns.map((column, i) =>
        i === columnIndex ? { ...column, size: column.size + 1 } : column,
      );
      const run = async () => {
        applyColumns(nextColumns);
        const settle = beginPageOp({ kind: 'insert', index: at }, count);
        const ok = await insert(at);
        settle(ok);
      };
      void run();
      history.record({
        undo: async () => {
          await performDelete([at], count + 1, previous);
        },
        redo: run,
      });
    },
    [columns, applyColumns, beginPageOp, insert, performDelete, history],
  );

  const addPageToColumn = useCallback(
    (columnIndex: number) => {
      if (!columns?.[columnIndex]) return;
      const starts = columnStarts(columns);
      const start = starts[columnIndex];
      const size = columns[columnIndex].size;
      insertPage(size > 0 ? start + size : start, columnIndex);
    },
    [columns, insertPage],
  );

  const moveToNewChapter = useCallback(
    (from: number, boundary: number) => {
      if (!columns) return;
      const result = insertPageColumn(columns, from, boundary, lr.board.newChapterTitle);
      if (!result) return;
      const inverse = invertOrder(result.order);
      const count = pageCount.current;
      void performOrder(result.order, result.columns, count);
      history.record({
        undo: () => performOrder(inverse, columns, count),
        redo: () => performOrder(result.order, result.columns, count),
      });
    },
    [columns, performOrder, history, lr.board.newChapterTitle],
  );

  const moveChapter = useCallback(
    (from: number, to: number) => {
      if (!columns) return;
      const nextColumns = moveColumnBlock(columns, from, to);
      if (!nextColumns) return;
      const order = orderAfterColumnMove(columns, from, to);
      const inverse = invertOrder(order);
      const count = pageCount.current;
      void performOrder(order, nextColumns, count);
      history.record({
        undo: () => performOrder(inverse, columns, count),
        redo: () => performOrder(order, nextColumns, count),
      });
    },
    [columns, performOrder, history],
  );

  const addChapter = useCallback(
    (after: number) => {
      if (!columns) return;
      const previous = columns;
      const next = addColumnAfter(previous, after, lr.board.newChapterTitle);
      applyColumns(next);
      history.record({
        undo: () => applyColumns(previous),
        redo: () => applyColumns(next),
      });
    },
    [columns, applyColumns, history, lr.board.newChapterTitle],
  );

  const deleteChapter = useCallback(
    (index: number) => {
      if (!columns) return;
      const previous = columns;
      const next = deleteColumnAt(previous, index);
      if (!next) return;
      applyColumns(next);
      history.record({
        undo: () => applyColumns(previous),
        redo: () => applyColumns(next),
      });
    },
    [columns, applyColumns, history],
  );

  const renameChapter = useCallback(
    (index: number, title: string) => {
      if (!columns?.[index]) return;
      const previous = columns;
      const next = renameColumnAt(previous, index, title);
      applyColumns(next);
      history.record({
        undo: () => applyColumns(previous),
        redo: () => applyColumns(next),
      });
    },
    [columns, applyColumns, history],
  );

  const setStatusFor = useCallback(
    (indices: number[], status: CardStatus | null) => {
      if (indices.length === 0) return;
      const before = indices.map((index) => cards[index]?.status ?? null);
      for (const index of indices) patch(index, { status });
      history.record({
        undo: () => {
          for (const [at, index] of indices.entries()) patch(index, { status: before[at] });
        },
        redo: () => {
          for (const index of indices) patch(index, { status });
        },
      });
    },
    [cards, patch, history],
  );

  const patchCard = useCallback(
    (index: number, change: CardPatch) => {
      const card = cards[index];
      const before: CardPatch = {};
      if ('title' in change) before.title = card?.title ?? null;
      if ('status' in change) before.status = card?.status ?? null;
      if ('memo' in change) before.memo = card?.memo ?? null;
      patch(index, change);
      history.record({
        undo: () => patch(index, before),
        redo: () => patch(index, change),
      });
    },
    [cards, patch, history],
  );

  const setLink = useCallback(
    (a: number, b: number, linked: boolean) => {
      if (linked) link(a, b);
      else unlink(a, b);
      history.record({
        undo: () => (linked ? unlink(a, b) : link(a, b)),
        redo: () => (linked ? link(a, b) : unlink(a, b)),
      });
    },
    [link, unlink, history],
  );

  const openPage = useCallback(
    (index: number) => {
      navigate(`/s/${encodeURIComponent(slideId)}?p=${index + 1}`);
    },
    [navigate, slideId],
  );

  const moveToEnd = useCallback(
    (index: number) => movePages([index], pageCount.current - 1),
    [movePages],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      const undoKey = mod && (event.key === 'z' || event.key === 'Z');
      // Keys pressed inside the block panel are the panel's, not the board's;
      // undo is the one shortcut that still carries across.
      if (!undoKey && (event.target as Element | null)?.closest?.('[data-lr-block-panel]')) {
        return;
      }
      if (undoKey) {
        event.preventDefault();
        void (event.shiftKey ? history.redo() : history.undo());
        return;
      }
      if (event.key === 'Escape') {
        setSelected([]);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length > 0) {
        event.preventDefault();
        setPendingDelete([...selected]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, selected]);

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    deletePages(pendingDelete);
    setPendingDelete(null);
  }, [pendingDelete, deletePages]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-3">
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
        <span className="hidden truncate text-[11.5px] text-muted-foreground/70 xl:inline">
          {lr.board.hint}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={lr.board.undo}
            title={history.undoBlocked ? lr.board.undoUnavailable : lr.board.undo}
            disabled={!history.canUndo}
            onClick={() => void history.undo()}
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={lr.board.redo}
            title={lr.board.redo}
            disabled={!history.canRedo}
            onClick={() => void history.redo()}
          >
            <Redo2 />
          </Button>
          <span className="mx-1 h-5 w-px bg-hairline" aria-hidden />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={lr.board.addChapter}
            title={lr.board.addChapter}
            disabled={!columns}
            onClick={() => addChapter((columns?.length ?? 1) - 1)}
          >
            <Columns3 />
          </Button>
          <div className="flex items-center rounded-[6px] border border-hairline p-0.5">
            {(
              [
                ['large', ImageIcon, lr.board.sizeLarge],
                ['small', Grid2X2, lr.board.sizeSmall],
                ['title', List, lr.board.sizeTitle],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                title={label}
                aria-pressed={size === value}
                onClick={() => chooseSize(value)}
                className={cn(
                  'flex size-6 items-center justify-center rounded-[4px] motion-safe:transition-colors',
                  size === value
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground/60 hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" strokeWidth={1.8} />
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={lr.board.blockPanel}
            title={lr.board.blockPanel}
            aria-pressed={showBlocks}
            onClick={toggleBlocks}
            className={cn(showBlocks && 'text-foreground')}
          >
            <Rows3 />
          </Button>
          {applying ? (
            boardApply.stalled ? (
              <span className="flex items-center gap-1">
                <span className="text-[12px] text-destructive" data-lr-apply-stalled>
                  {lr.board.applyStalled}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void boardApply.cancel()}
                  data-lr-apply-cancel
                >
                  {lr.board.applyCancel}
                </Button>
              </span>
            ) : (
              <span
                className="flex items-center gap-1.5 text-[12px] text-muted-foreground"
                data-lr-applying
              >
                <span className="size-1.5 rounded-full bg-[var(--lr-accent)]" />
                {applyingLabel}
              </span>
            )
          ) : (
            <>
              {totalChanges > 0 && (
                <Popover open={listOpen} onOpenChange={setListOpen}>
                  <PopoverTrigger
                    type="button"
                    className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'tabular-nums')}
                  >
                    {format(lr.board.changes, { n: totalChanges })}
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[360px] p-0">
                    <ChangeList
                      changes={changes}
                      restructures={restructures}
                      pageKeys={keys}
                      readOf={blocksOfPage}
                      onRemove={removeChanges}
                      onRemoveRestructure={(index) => removeRestructures([index])}
                      readOnly={applying}
                      apply={{
                        onApply: () => {
                          setListOpen(false);
                          void boardApply.start({ kind: 'changes' });
                        },
                        disabled: applyHint !== null,
                        hint: applyHint,
                        starting: boardApply.starting,
                      }}
                    />
                  </PopoverContent>
                </Popover>
              )}
              {boardApply.lastApply?.ok && (
                <Button variant="ghost" size="sm" data-lr-undo-last onClick={askUndo}>
                  {lr.board.applyUndoLast}
                </Button>
              )}
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              aria-label={lr.board.filter}
              title={lr.board.filter}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                filterActive && 'text-foreground',
              )}
            >
              <Filter />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[190px]">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{lr.board.filterStatus}</DropdownMenuLabel>
                {CARD_STATUSES.map((value) => (
                  <DropdownMenuCheckboxItem
                    key={value}
                    checked={filter.statuses.includes(value)}
                    onCheckedChange={() => setFilter((current) => toggleStatus(current, value))}
                  >
                    {labels[value]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuCheckboxItem
                  checked={filter.memo}
                  onCheckedChange={() =>
                    setFilter((current) => ({ ...current, memo: !current.memo }))
                  }
                >
                  {lr.board.filterMemo}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filter.comments}
                  onCheckedChange={() =>
                    setFilter((current) => ({ ...current, comments: !current.comments }))
                  }
                >
                  {lr.board.filterComments}
                </DropdownMenuCheckboxItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setFilter(EMPTY_FILTER)}>
                {lr.board.filterClear}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <span className="folio">{pad2(pages.length)}</span>
      </header>

      <div className="flex min-h-0 flex-1">
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
            <>
              {selected.length > 0 && (
                <div className="pointer-events-auto absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-[8px] border border-hairline bg-card px-2 py-1 shadow-edge">
                  <span className="px-1 text-[12px] text-muted-foreground">
                    {format(lr.board.selected, { n: selected.length })}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      type="button"
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      {lr.board.status}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="min-w-[150px]">
                      {CARD_STATUSES.map((value) => (
                        <DropdownMenuItem key={value} onClick={() => setStatusFor(selected, value)}>
                          {labels[value]}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setStatusFor(selected, null)}>
                        {lr.board.statusNone}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {selected.length === 2 && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={lr.board.mergePages}
                      title={lr.board.mergePages}
                      data-lr-merge-pages
                      onClick={mergeSelected}
                    >
                      <Combine />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.thumbnailRail.duplicatePage}
                    title={t.thumbnailRail.duplicatePage}
                    onClick={() => duplicatePages(selected)}
                  >
                    <Copy />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.thumbnailRail.deletePage}
                    title={t.thumbnailRail.deletePage}
                    onClick={() => setPendingDelete([...selected])}
                  >
                    <Trash2 />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={lr.board.clearSelection}
                    title={lr.board.clearSelection}
                    onClick={() => setSelected([])}
                  >
                    <X />
                  </Button>
                </div>
              )}
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
                  size={size}
                  collapsed={collapsed}
                  dimmed={dimmed}
                  changeCounts={changeCounts}
                  selected={selected}
                  onSelect={setSelected}
                  onOpenPage={openPage}
                  onMovePages={movePages}
                  onMoveToNewChapter={moveToNewChapter}
                  onRenameColumn={renameChapter}
                  onAddPage={addPageToColumn}
                  onAddChapter={addChapter}
                  onDeleteChapter={deleteChapter}
                  onToggleCollapse={toggleCollapse}
                  onMoveChapter={moveChapter}
                  onDuplicate={(index) => duplicatePages([index])}
                  onDelete={(index) => deletePages([index])}
                  onMoveToEnd={moveToEnd}
                  onPatchCard={patchCard}
                  onLink={(a, b) => setLink(a, b, true)}
                  onUnlink={(a, b) => setLink(a, b, false)}
                  onToggleLinks={toggleLinks}
                  flashed={flashedPages}
                  agentHint={agentHint}
                  onPageTask={startPageTask}
                  planFor={planFor}
                  onFillChapter={openChapter}
                  onViewPlan={openChapter}
                />
              </Suspense>
            </>
          )}
        </div>
        {showBlocks && (
          <BlockPanel
            slideId={slideId}
            pages={pages}
            pageKeys={keys}
            design={slide?.design}
            selected={selected.length > 0 ? selected[selected.length - 1] : null}
            changes={changes}
            onChanges={applyChanges}
            cardTitle={(index) => cards[index]?.title ?? ''}
            cardMemo={(index) => cards[index]?.memo ?? ''}
            agent={{
              hint:
                agentHint ??
                (selected.length > 0 && changeCounts[selected[selected.length - 1]] > 0
                  ? lr.board.askHasChanges
                  : null),
              onTask: (action) => {
                const at = selected[selected.length - 1];
                if (at !== undefined) startPageTask(at, action);
              },
            }}
            readOnly={applying}
            onSplit={splitPage}
          />
        )}
      </div>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {format(lr.board.deleteSelectedTitle, { n: pendingDelete?.length ?? 0 })}
            </DialogTitle>
            <DialogDescription>{lr.board.deleteSelectedHint}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPendingDelete(null)}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete}>
              {t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={undoOpen} onOpenChange={setUndoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lr.board.applyUndoConfirm.title}</DialogTitle>
            <DialogDescription>{lr.board.applyUndoConfirm.body}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setUndoOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void undoLastApply()}>
              {lr.board.applyUndoConfirm.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={chapterAt !== null}
        onOpenChange={(open) => {
          if (!open) setChapterAt(null);
        }}
      >
        <DialogContent data-lr-chapter-dialog>
          <DialogHeader>
            <DialogTitle>{lr.board.fillChapter}</DialogTitle>
            <DialogDescription>
              {chapterAt === null
                ? ''
                : columns?.[chapterAt]?.title ||
                  format(lr.board.columnFallback, { n: chapterAt + 1 })}
            </DialogDescription>
          </DialogHeader>

          {planAt?.state === 'ready' ? (
            <div className="flex flex-col gap-1.5" data-lr-plan-list>
              {planItems.map((item, at) => (
                <div key={item.id} className="flex items-center gap-1" data-lr-plan-item>
                  <input
                    value={item.title}
                    aria-label={`${lr.board.writeChapter} ${at + 1}`}
                    onChange={(event) => editPlanItem(at, event.currentTarget.value)}
                    className="min-w-0 flex-1 rounded-[4px] border border-hairline bg-background px-2 py-1 text-[12.5px] outline-none focus:ring-1 focus:ring-brand/50"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={lr.board.planMoveUp}
                    disabled={at === 0}
                    onClick={() => movePlanItem(at, at - 1)}
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={lr.board.planMoveDown}
                    disabled={at === planItems.length - 1}
                    onClick={() => movePlanItem(at, at + 1)}
                  >
                    <ChevronDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={lr.board.planRemove}
                    onClick={() => setPlanItems((items) => items.filter((_, i) => i !== at))}
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                data-lr-add-plan-item
                disabled={planItems.length >= 8}
                onClick={addPlanItem}
              >
                <Plus />
                {lr.board.addPlanItem}
              </Button>
            </div>
          ) : planAt?.state === 'failed' ? (
            <p className="text-[12.5px] text-destructive" data-lr-plan-error>
              {planAt.error || lr.board.planFailed}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-[12.5px]">
                <span>{lr.board.chapterBrief}</span>
                <textarea
                  value={chapterBrief}
                  maxLength={500}
                  rows={4}
                  data-lr-chapter-brief
                  onChange={(event) => setChapterBrief(event.currentTarget.value)}
                  className="resize-none rounded-[4px] border border-hairline bg-background px-2 py-1.5 text-[12.5px] outline-none focus:ring-1 focus:ring-brand/50"
                />
              </label>
              <label className="flex items-center gap-2 text-[12.5px]">
                <span>{lr.board.chapterCount}</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={chapterCount}
                  data-lr-chapter-count
                  onChange={(event) =>
                    setChapterCount(
                      Math.min(8, Math.max(1, Math.trunc(Number(event.currentTarget.value) || 1))),
                    )
                  }
                  className="w-16 rounded-[4px] border border-hairline bg-background px-2 py-1 text-[12.5px] tabular-nums outline-none focus:ring-1 focus:ring-brand/50"
                />
              </label>
            </div>
          )}

          {planningHere && (
            <p className="text-[12px] text-muted-foreground" data-lr-planning-dialog>
              {lr.board.planning}
            </p>
          )}

          <DialogFooter>
            {planAt?.state === 'ready' ? (
              <>
                <Button variant="outline" size="sm" onClick={dropChapterPlan}>
                  {lr.board.dropPlan}
                </Button>
                <Button
                  size="sm"
                  data-lr-write-chapter
                  disabled={writingHere || planItems.length === 0}
                  onClick={() => void writeChapter()}
                >
                  {format(lr.board.writeChapter, { n: planItems.length })}
                </Button>
              </>
            ) : planAt?.state === 'failed' ? (
              <>
                <Button variant="outline" size="sm" onClick={dropChapterPlan}>
                  {lr.board.dropPlan}
                </Button>
                <Button
                  size="sm"
                  data-lr-retry-plan
                  disabled={planningHere || agentHint !== null}
                  onClick={startChapterPlan}
                >
                  {lr.board.retryPlan}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setChapterAt(null)}>
                  {t.common.cancel}
                </Button>
                <Button
                  size="sm"
                  data-lr-plan-chapter
                  disabled={!chapterBrief.trim() || planningHere || agentHint !== null}
                  onClick={startChapterPlan}
                >
                  {lr.board.planChapter}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Several steps taken as one, so a single undo takes back the whole batch. */
function groupSteps(steps: HistoryStep[]): HistoryStep {
  return {
    undo: async () => {
      for (const step of [...steps].reverse()) if (step.undo) await step.undo();
    },
    redo: async () => {
      for (const step of steps) await step.redo();
    },
  };
}
