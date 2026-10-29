export const PAGE_KINDS = ['cover', 'kpi', 'chart', 'list', 'page', 'end'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export const OUTLINE_STATES = ['drafting', 'ready', 'failed', 'building', 'built'] as const;
export type OutlineState = (typeof OUTLINE_STATES)[number];

export type OutlinePage = { id: string; title: string; kind: PageKind };

export type Outline = {
  state: OutlineState;
  brief: string;
  pages: number;
  files: string[];
  items: OutlinePage[];
  updatedAt: number;
};

export const OUTLINE_PAGE_SIZES = [5, 8, 12] as const;
export const MAX_ITEMS = 30;
export const MIN_ITEMS = 2;
export const MAX_TITLE = 120;
export const MAX_BRIEF = 2000;

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
  return {
    state: r.state,
    brief,
    pages,
    files,
    items: sanitizeItems(r.items),
    updatedAt,
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
  const clean = cleanTitle(title);
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
  ];
  return lines.join('\n');
}

export function buildPrompt(outline: Outline, slideId: string): string {
  const file = `slides/${slideId}/index.tsx`;
  const list = outline.items
    .map((item, i) => `${i + 1}. [${item.kind}] ${item.title || '(untitled)'}`)
    .join('\n');
  const json = JSON.stringify(
    outline.items.map((item) => ({ title: item.title, kind: item.kind })),
  );
  return [
    `Build the deck in ${file} from the outline below, one page at a time.`,
    'Keep the page count, order and titles exactly as the outline says.',
    'Page kinds and how to write them:',
    ...PAGE_KINDS.map((kind) => `- ${KIND_GUIDE[kind]}`),
    'Numbers from the reference files stay exactly as they are written there.',
    'The outline:',
    list,
    `<lemonriver-outline>${json}</lemonriver-outline>`,
  ].join('\n');
}
