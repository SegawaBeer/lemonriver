import type { AgentItem } from '../../../agent/types';
import { type AgentPrefs, prefsLines, sanitizePrefs } from '../agent-prefs/prefs';

export const PAGE_KINDS = ['cover', 'kpi', 'chart', 'list', 'page', 'end'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export const OUTLINE_STATES = ['drafting', 'ready', 'failed', 'building', 'built'] as const;
export type OutlineState = (typeof OUTLINE_STATES)[number];

export type OutlinePage = { id: string; title: string; kind: PageKind };

export type BuildStage = 'pages' | 'review';

export type BuildStep = { kind: 'page' | 'review'; n: number; at: number };

export type BuildTurn = { kind: 'page' | 'review'; n: number; ok: boolean; at: number };

export type Decision = { id: string; question: string; answer: string };

export type Outline = {
  state: OutlineState;
  brief: string;
  pages: number;
  files: string[];
  items: OutlinePage[];
  updatedAt: number;
  built: number;
  paused: boolean;
  stage: BuildStage;
  dispatched: BuildStep | null;
  lastTurn: BuildTurn | null;
  prefs: AgentPrefs;
  decisions: Decision[];
};

export const OUTLINE_PAGE_SIZES = [5, 8, 12] as const;
export const MAX_ITEMS = 30;
export const MIN_ITEMS = 2;
export const MAX_TITLE = 120;
export const MAX_BRIEF = 2000;
export const MAX_DECISIONS = 20;
export const MAX_DECISION_TEXT = 120;

const ID_RE = /^[a-z0-9-]{1,40}$/;
const BLOCK_RE = /<lemonriver-outline>([\s\S]*?)<\/lemonriver-outline>/gi;

let idSeq = 0;

export function newPageId(): string {
  idSeq += 1;
  return `p-${Date.now().toString(36)}-${idSeq.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function isPageKind(value: unknown): value is PageKind {
  return typeof value === 'string' && (PAGE_KINDS as readonly string[]).includes(value);
}

export function isOutlineState(value: unknown): value is OutlineState {
  return typeof value === 'string' && (OUTLINE_STATES as readonly string[]).includes(value);
}

function cleanTitle(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TITLE) : '';
}

function cleanItem(raw: unknown): OutlinePage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && ID_RE.test(r.id) ? r.id : newPageId();
  return { id, title: cleanTitle(r.title), kind: isPageKind(r.kind) ? r.kind : 'page' };
}

export function sanitizeItems(raw: unknown): OutlinePage[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ITEMS).flatMap((item) => {
    const cleaned = cleanItem(item);
    return cleaned ? [cleaned] : [];
  });
}

function cleanStep(raw: unknown, maxPage: number): BuildStep | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind === 'page' || r.kind === 'review' ? r.kind : null;
  if (!kind) return null;
  const n = typeof r.n === 'number' && Number.isFinite(r.n) ? Math.trunc(r.n) : -1;
  const at = typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : -1;
  if (n < 0 || at < 0) return null;
  return { kind, n: Math.min(n, maxPage), at };
}

function cleanTurn(raw: unknown, maxPage: number): BuildTurn | null {
  const step = cleanStep(raw, maxPage);
  if (!step || !raw || typeof raw !== 'object') return null;
  return { ...step, ok: (raw as Record<string, unknown>).ok === true };
}

export function sanitizeDecisions(raw: unknown): Decision[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_DECISIONS).flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const r = entry as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id === '') return [];
    return [
      {
        id: r.id.slice(0, 80),
        question: typeof r.question === 'string' ? r.question.slice(0, MAX_DECISION_TEXT) : '',
        answer: typeof r.answer === 'string' ? r.answer.slice(0, MAX_DECISION_TEXT) : '',
      },
    ];
  });
}

export type AnsweredQuestion = {
  id: string;
  kind: string;
  status?: string;
  questions?: readonly { question: string; header?: string }[];
  answers?: Record<string, string> | null;
};

/**
 * Every answered question in a review session becomes one decision. Ids are
 * the question item plus its index, so a resumed turn that reports the same
 * item again does not add a duplicate.
 */
export function collectDecisions(
  existing: readonly Decision[],
  items: readonly AnsweredQuestion[],
): Decision[] {
  const seen = new Set(existing.map((decision) => decision.id));
  const next = existing.slice();
  for (const item of items) {
    if (item.kind !== 'question' || item.status !== 'answered') continue;
    const questions = item.questions ?? [];
    for (let index = 0; index < questions.length; index += 1) {
      if (next.length >= MAX_DECISIONS) return next;
      const id = `${item.id}:${index}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const question = questions[index];
      const answer = item.answers?.[question.question] ?? '';
      next.push({
        id,
        question: (question.header || question.question).slice(0, MAX_DECISION_TEXT),
        answer: answer.slice(0, MAX_DECISION_TEXT),
      });
    }
  }
  return next;
}

export function sanitizeOutline(raw: unknown): Outline | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isOutlineState(r.state)) return null;
  const pages = OUTLINE_PAGE_SIZES.find((size) => size === r.pages) ?? 8;
  const brief = typeof r.brief === 'string' ? r.brief.slice(0, MAX_BRIEF) : '';
  const files = Array.isArray(r.files)
    ? r.files.filter((file): file is string => typeof file === 'string' && file.trim() !== '')
    : [];
  const updatedAt =
    typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : 0;
  const items = sanitizeItems(r.items);
  const builtRaw =
    typeof r.built === 'number' && Number.isFinite(r.built) ? Math.trunc(r.built) : 0;
  return {
    state: r.state,
    brief,
    pages,
    files,
    items,
    updatedAt,
    built: Math.min(Math.max(builtRaw, 0), items.length),
    paused: r.paused === true,
    stage: r.stage === 'review' ? 'review' : 'pages',
    dispatched: cleanStep(r.dispatched, items.length),
    lastTurn: cleanTurn(r.lastTurn, items.length),
    prefs: sanitizePrefs(r.prefs),
    decisions: sanitizeDecisions(r.decisions),
  };
}

/** The last outline block wins: a retried answer may carry an earlier draft. */
export function parseOutlineBlock(text: string): OutlinePage[] | null {
  let last: string | null = null;
  for (const match of text.matchAll(BLOCK_RE)) last = match[1] ?? '';
  if (last === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(last.trim());
  } catch {
    return null;
  }
  const items = sanitizeItems(parsed);
  return items.length >= MIN_ITEMS ? items : null;
}

// Also drops a block that is still streaming in, so the JSON never flashes
// in the transcript.
export function stripOutlineBlock(text: string): string {
  return text
    .replace(BLOCK_RE, '')
    .replace(/<lemonriver-outline>[\s\S]*$/i, '')
    .trim();
}

function validIndex(items: OutlinePage[], index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < items.length;
}

export function movePage(items: OutlinePage[], from: number, to: number): OutlinePage[] {
  if (!validIndex(items, from) || !Number.isInteger(to) || to < 0 || to >= items.length) {
    return items;
  }
  if (from === to) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function insertPage(
  items: OutlinePage[],
  at: number,
  kind: PageKind = 'page',
): OutlinePage[] {
  if (items.length >= MAX_ITEMS) return items;
  const index = Math.min(Math.max(Math.trunc(at), 0), items.length);
  const next = items.slice();
  next.splice(index, 0, { id: newPageId(), title: '', kind });
  return next;
}

export function removePage(items: OutlinePage[], index: number): OutlinePage[] {
  if (items.length <= MIN_ITEMS || !validIndex(items, index)) return items;
  return items.filter((_, i) => i !== index);
}

export function renamePage(items: OutlinePage[], index: number, title: string): OutlinePage[] {
  if (!validIndex(items, index)) return items;
  // Not trimmed here: the title is typed into an input, and trailing spaces are
  // what the next word needs. The server trims when it stores the outline.
  const clean = typeof title === 'string' ? title.slice(0, MAX_TITLE) : '';
  if (items[index].title === clean) return items;
  return items.map((item, i) => (i === index ? { ...item, title: clean } : item));
}

export function setKind(items: OutlinePage[], index: number, kind: PageKind): OutlinePage[] {
  if (!validIndex(items, index) || items[index].kind === kind) return items;
  return items.map((item, i) => (i === index ? { ...item, kind } : item));
}

const KIND_GUIDE: Record<PageKind, string> = {
  cover: 'cover — the deck title and subtitle',
  kpi: 'key figure — one large number with a one-line takeaway',
  chart: 'chart — a labelled chart with the point it makes',
  list: 'bullet points — a short heading and a few concise points',
  page: 'body — a normal content page',
  end: 'closing — the last page and what should happen next',
};

export function outlinePrompt(outline: Outline, slideId: string, lang: string): string {
  const fileList =
    outline.files.length > 0
      ? `Read these reference files first, from slides/${slideId}/assets/: ${outline.files.join(', ')}.`
      : 'The request has no reference files.';
  const lines = [
    'Plan the outline for a new deck. This turn is outline only: do not write, edit or create any slide file.',
    `The user asked for: ${outline.brief}`,
    `The deck should have about ${outline.pages} pages.`,
    fileList,
    `Write the page titles in the language "${lang}".`,
    'If a file cannot be read, say which file it is and why, then plan from what you have.',
    'Finish with one line of its own holding a JSON array between the tags <lemonriver-outline> and </lemonriver-outline>,',
    'each entry shaped like {"title": "…", "kind": "cover"}.',
    `"kind" is one of: ${PAGE_KINDS.join(', ')}. The first page is "cover" and the last is "end".`,
    `Give ${MIN_ITEMS} to ${MAX_ITEMS} entries.`,
    ...prefsLines(outline.prefs, 'outline'),
  ];
  return lines.join('\n');
}

export function pagePrompt(outline: Outline, slideId: string, k: number): string {
  const file = `slides/${slideId}/index.tsx`;
  const page = outline.items[k - 1];
  if (k >= 2 && page) {
    const title = page.title || '(untitled)';
    return [
      `Page ${k} of ${outline.items.length}: [${page.kind}] ${title}. Write only this page; leave the others as they are.`,
      ...prefsLines(outline.prefs, 'page'),
    ].join('\n');
  }
  const list = outline.items
    .map((item, i) => `${i + 1}. [${item.kind}] ${item.title || '(untitled)'}`)
    .join('\n');
  return [
    `Build ${file} from this outline, one page per turn. This turn: write page 1 only, replacing the placeholder page, and set meta.title to the deck title. Pages:`,
    list,
    'Page kinds and how to write them:',
    ...PAGE_KINDS.map((kind) => `- ${KIND_GUIDE[kind]}`),
    'Numbers from the reference files stay exactly as written there.',
    ...prefsLines(outline.prefs, 'page'),
  ].join('\n');
}

export function reviewPrompt(outline: Outline, slideId: string): string {
  const lines = [
    `All ${outline.items.length} pages are written.`,
    `Check each page of slides/${slideId}/index.tsx against the outline and the reference files in slides/${slideId}/assets/:`,
    'fix typos and any number that differs from the files.',
  ];
  if (outline.prefs.askOnMismatch) {
    lines.push(
      'If two files give different numbers for the same thing, ask the user which to use before changing it.',
    );
  }
  lines.push('Do not add or remove pages.', ...prefsLines(outline.prefs, 'review'));
  return lines.join(' ');
}

export const DISPATCH_STALE_MS = 30_000;
export const RESUME_WINDOW_MS = 120_000;

/** Both the build button and a "direct" outline start from a ready record. */
export function beginBuild(outline: Outline, now: number): Outline {
  return {
    ...outline,
    state: 'building',
    built: 0,
    paused: false,
    stage: 'pages',
    dispatched: null,
    lastTurn: null,
    updatedAt: now,
  };
}

export type BuildNext = { kind: 'page'; n: number } | { kind: 'review' } | null;

export function nextStep(outline: Outline): BuildNext {
  if (outline.state !== 'building') return null;
  if (outline.stage === 'review') return { kind: 'review' };
  if (outline.built >= outline.items.length) return null;
  return { kind: 'page', n: outline.built + 1 };
}

export function afterTurn(
  outline: Outline,
  turn: { ok: boolean; waitingForAnswer: boolean },
  now: number,
): Outline {
  const dispatched = outline.dispatched;
  if (outline.state !== 'building' || !dispatched) return outline;
  if (turn.waitingForAnswer) return outline;
  const lastTurn: BuildTurn = {
    kind: dispatched.kind,
    n: dispatched.n,
    ok: turn.ok,
    at: now,
  };
  if (!turn.ok) {
    return { ...outline, dispatched: null, lastTurn, updatedAt: now };
  }
  if (dispatched.kind === 'review') {
    return { ...outline, state: 'built', dispatched: null, lastTurn, updatedAt: now };
  }
  const last = dispatched.n >= outline.items.length;
  return {
    ...outline,
    built: dispatched.n,
    stage: last ? 'review' : outline.stage,
    paused: last ? false : outline.prefs.confirmEachPage || outline.paused,
    dispatched: null,
    lastTurn,
    updatedAt: now,
  };
}

/** The page the build is waiting on after a confirm-each-page stop, or null. */
export function pageAwaitingCheck(outline: Outline): number | null {
  if (outline.state !== 'building' || !outline.paused) return null;
  if (!outline.prefs.confirmEachPage) return null;
  const turn = outline.lastTurn;
  if (turn?.kind !== 'page' || !turn.ok) return null;
  if (turn.n >= outline.items.length) return null;
  return turn.n;
}

export type DriverAction = 'send' | 'wait' | 'paused' | 'interrupted' | 'idle';

export function driverAction(
  outline: Outline,
  now: { running: boolean; now: number },
): DriverAction {
  if (outline.state !== 'building') return 'idle';
  if (now.running) return 'wait';
  if (outline.paused) return 'paused';
  if (outline.dispatched) {
    return now.now - outline.dispatched.at < DISPATCH_STALE_MS ? 'wait' : 'interrupted';
  }
  if (outline.lastTurn && !outline.lastTurn.ok) return 'interrupted';
  if (!outline.lastTurn) return 'send';
  return now.now - outline.lastTurn.at < RESUME_WINDOW_MS ? 'send' : 'interrupted';
}

export type TeamLeadState = 'idle' | 'working' | 'done' | 'needs-you' | 'thinking';
export type TeamHelperState = 'idle' | 'working' | 'done' | 'needs-you' | 'none';
export type TeamState = {
  lead: TeamLeadState;
  research: TeamHelperState;
  outline: TeamHelperState;
  design: TeamHelperState;
  review: TeamHelperState;
};

// The failure the user needs to see is the last one after the message they sent.
export function lastErrorText(items: AgentItem[], userItemId: string | null): string | null {
  const start = userItemId ? items.findIndex((item) => item.id === userItemId) : -1;
  const after = start === -1 ? items : items.slice(start + 1);
  for (let i = after.length - 1; i >= 0; i--) {
    const item = after[i];
    if (item.kind === 'error') return item.text.slice(0, 200);
  }
  return null;
}

export function teamState(
  outline: Outline,
  seen: { running: boolean; waitingForAnswer: boolean; action: DriverAction },
): TeamState {
  const inReview = outline.stage === 'review';
  const done = outline.state === 'built';
  return {
    lead: done
      ? 'done'
      : seen.action === 'interrupted'
        ? 'needs-you'
        : outline.paused
          ? 'idle'
          : seen.running
            ? 'working'
            : 'thinking',
    research: outline.files.length > 0 ? 'done' : 'none',
    outline: 'done',
    design: done || inReview ? 'done' : seen.running ? 'working' : 'idle',
    review: done
      ? 'done'
      : inReview && seen.waitingForAnswer
        ? 'needs-you'
        : inReview && seen.running
          ? 'working'
          : 'idle',
  };
}
