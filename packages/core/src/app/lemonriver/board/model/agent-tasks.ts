import { type OutlinePage, sanitizeItems } from '../../outline/model.ts';

export const PAGE_ACTIONS = ['rewrite', 'chart', 'memo', 'expand'] as const;
export type PageAction = (typeof PAGE_ACTIONS)[number];

export const MAX_PLAN_ITEMS = 8;
export const MAX_CHAPTER_BRIEF = 500;
export const MAX_CHAPTER_TITLE = 120;

/** One thing the board asks the agent to do. `changes` is the hand-over list. */
export type BoardTask =
  | { kind: 'changes' }
  | { kind: 'page'; page: string; action: PageAction }
  | { kind: 'chapter-plan'; chapter: number; title: string; brief: string; count: number }
  | { kind: 'chapter-write'; chapter: number; title: string };

export function isPageAction(value: unknown): value is PageAction {
  return typeof value === 'string' && (PAGE_ACTIONS as readonly string[]).includes(value);
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
}

export function sanitizeTask(raw: unknown): BoardTask | null {
  if (!raw || typeof raw !== 'object') return null;
  const task = raw as Record<string, unknown>;
  switch (task.kind) {
    case 'changes':
      return { kind: 'changes' };
    case 'page': {
      if (!isPageAction(task.action)) return null;
      if (typeof task.page !== 'string' || task.page === '') return null;
      return { kind: 'page', page: task.page, action: task.action };
    }
    case 'chapter-plan': {
      const chapter = wholeNumber(task.chapter, 0, 999);
      const count = wholeNumber(task.count, 1, MAX_PLAN_ITEMS);
      if (chapter === null || count === null) return null;
      return {
        kind: 'chapter-plan',
        chapter,
        title: typeof task.title === 'string' ? task.title.slice(0, MAX_CHAPTER_TITLE) : '',
        brief: typeof task.brief === 'string' ? task.brief.slice(0, MAX_CHAPTER_BRIEF).trim() : '',
        count,
      };
    }
    case 'chapter-write': {
      const chapter = wholeNumber(task.chapter, 0, 999);
      if (chapter === null) return null;
      return {
        kind: 'chapter-write',
        chapter,
        title: typeof task.title === 'string' ? task.title.slice(0, MAX_CHAPTER_TITLE) : '',
      };
    }
    default:
      return null;
  }
}

const QUOTED = (title: string) => (title ? ` "${title}"` : '');

const LANGUAGE = (lang: string) => `Write in the language "${lang}".`;

const DONE = 'When you are done, reply with one short sentence saying what changed.';

const ACTION_LINE: Record<Exclude<PageAction, 'memo'>, string> = {
  rewrite: 'Rewrite this page: keep what it says, make it clearer and better laid out.',
  chart: 'Turn the main numbers on this page into a chart. Keep the title and the point it makes.',
  expand:
    'Expand this page into two pages: keep this one, and add one more right after it that goes deeper. Add a speaker note for the new page.',
};

/** The message for one page. A note action without a note has nothing to say. */
export function pageTaskPrompt({
  slideId,
  page,
  action,
  lang,
}: {
  slideId: string;
  page: { n: number; title: string; memo?: string };
  action: PageAction;
  lang: string;
}): string | null {
  const memo = page.memo?.trim() ?? '';
  if (action === 'memo' && !memo) return null;
  const work =
    action === 'memo'
      ? `Change this page as the note says: ${JSON.stringify(memo)}`
      : ACTION_LINE[action];
  return [
    `Work on page ${page.n}${QUOTED(page.title)} of slides/${slideId}/index.tsx only. Leave every other page, the theme and the speaker notes of other pages as they are.`,
    work,
    `${LANGUAGE(lang)} ${DONE}`,
  ].join('\n');
}

/** Planning only: the agent answers with the titles, and touches no file. */
export function chapterPlanPrompt({
  slideId,
  chapter,
  title,
  brief,
  count,
  pages,
  lang,
}: {
  slideId: string;
  chapter: number;
  title: string;
  brief: string;
  count: number;
  pages: { n: number; title: string }[];
  lang: string;
}): string {
  const now =
    pages.length > 0
      ? `It has these pages now: ${pages
          .map((page) => `page ${page.n}${QUOTED(page.title)}`)
          .join(', ')}.`
      : 'It has no pages yet.';
  return [
    `Plan new pages for chapter ${chapter + 1}${QUOTED(title)} of slides/${slideId}/index.tsx. This turn is planning only: do not write, edit or create any file.`,
    `The chapter should cover: ${brief}`,
    now,
    `Plan ${count} new pages that come after them.`,
    LANGUAGE(lang),
    'Finish with one line of its own holding a JSON array between the tags <lemonriver-chapter> and </lemonriver-chapter>,',
    'each entry shaped like {"title": "…", "kind": "page"}.',
    '"kind" is one of: cover, kpi, chart, list, page, end.',
    `Give 1 to ${MAX_PLAN_ITEMS} entries.`,
  ].join('\n');
}

/** Writing the titles the user settled on, right where the chapter sits. */
export function chapterWritePrompt({
  slideId,
  chapter,
  title,
  items,
  anchor,
  lang,
}: {
  slideId: string;
  chapter: number;
  title: string;
  items: OutlinePage[];
  /** The page the new ones go after, or null for the start of the deck. */
  anchor: { n: number; title: string } | null;
  lang: string;
}): string {
  const where = anchor
    ? `, right after page ${anchor.n}${QUOTED(anchor.title)}`
    : ', at the start of the deck';
  const lines = items.map((item, i) => `${i + 1}. "${item.title}" (${item.kind})`);
  return [
    `Add these pages to chapter ${chapter + 1}${QUOTED(title)} of slides/${slideId}/index.tsx${where}.`,
    ...lines,
    "Follow the deck's existing theme and layout. Add a speaker note for each new page. Do not change any other page.",
    `${LANGUAGE(lang)} ${DONE}`,
  ].join('\n');
}

const CHAPTER_BLOCK_RE = /<lemonriver-chapter>([\s\S]*?)<\/lemonriver-chapter>/gi;

/** The last block wins, and a block still streaming in is not read at all. */
export function parseChapterBlock(text: string): OutlinePage[] | null {
  let last: string | null = null;
  for (const match of text.matchAll(CHAPTER_BLOCK_RE)) last = match[1] ?? '';
  if (last === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(last.trim());
  } catch {
    return null;
  }
  const items = sanitizeItems(parsed).slice(0, MAX_PLAN_ITEMS);
  return items.length >= 1 ? items : null;
}

export function stripChapterBlock(text: string): string {
  return text
    .replace(CHAPTER_BLOCK_RE, '')
    .replace(/<lemonriver-chapter>[\s\S]*$/i, '')
    .trim();
}
