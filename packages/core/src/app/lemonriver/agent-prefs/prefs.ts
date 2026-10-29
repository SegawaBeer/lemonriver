export type Tone = 'steady' | 'friendly' | 'concise';
export type ResearchSource = 'uploads' | 'web';
export type OutlineMode = 'review' | 'direct';
export type DesignDensity = 'visual' | 'balanced' | 'dense';
export type ReviewMode = 'strict' | 'numbers';

export type AgentPrefs = {
  confirmEachPage: boolean;
  askOnMismatch: boolean;
  autoImages: boolean;
  tone: Tone;
  research: ResearchSource;
  outline: OutlineMode;
  design: DesignDensity;
  review: ReviewMode;
};

export const DEFAULT_PREFS: AgentPrefs = {
  confirmEachPage: false,
  askOnMismatch: true,
  autoImages: true,
  tone: 'steady',
  research: 'uploads',
  outline: 'review',
  design: 'balanced',
  review: 'strict',
};

export const PREFS_KEY = 'lemonriver:agent-prefs';

const TONES: readonly Tone[] = ['steady', 'friendly', 'concise'];
const RESEARCH: readonly ResearchSource[] = ['uploads', 'web'];
const OUTLINES: readonly OutlineMode[] = ['review', 'direct'];
const DESIGNS: readonly DesignDensity[] = ['visual', 'balanced', 'dense'];
const REVIEWS: readonly ReviewMode[] = ['strict', 'numbers'];

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function sanitizePrefs(raw: unknown): AgentPrefs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_PREFS };
  const r = raw as Record<string, unknown>;
  return {
    confirmEachPage: flag(r.confirmEachPage, DEFAULT_PREFS.confirmEachPage),
    askOnMismatch: flag(r.askOnMismatch, DEFAULT_PREFS.askOnMismatch),
    autoImages: flag(r.autoImages, DEFAULT_PREFS.autoImages),
    tone: pick(r.tone, TONES, DEFAULT_PREFS.tone),
    research: pick(r.research, RESEARCH, DEFAULT_PREFS.research),
    outline: pick(r.outline, OUTLINES, DEFAULT_PREFS.outline),
    design: pick(r.design, DESIGNS, DEFAULT_PREFS.design),
    review: pick(r.review, REVIEWS, DEFAULT_PREFS.review),
  };
}

export function readPrefs(storage: Storage): AgentPrefs {
  let raw: string | null = null;
  try {
    raw = storage.getItem(PREFS_KEY);
  } catch {
    return { ...DEFAULT_PREFS };
  }
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    return sanitizePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(storage: Storage, prefs: AgentPrefs): void {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(sanitizePrefs(prefs)));
  } catch {}
}

const TONE_LINE: Record<Tone, string> = {
  steady: 'Write in a steady, professional tone.',
  friendly: 'Write in a light, friendly tone.',
  concise: 'Keep the wording short and punchy.',
};

const RESEARCH_LINE: Record<ResearchSource, string> = {
  uploads: "Use only the user's reference files; do not look anything up on the web.",
  web: 'You may look up facts the files do not cover; say where each one came from.',
};

const DESIGN_LINE: Record<DesignDensity, string> = {
  visual: 'Keep text short and give each page one large visual, chart or icon.',
  balanced: 'Balance text and visuals.',
  dense: 'A page may carry more text and data when the content needs it.',
};

const IMAGES_LINE = {
  yes: 'Use icons and image placeholders where a picture helps; never invent photos the user did not provide.',
  no: 'Do not add any image the user did not provide.',
};

const REVIEW_LINE: Record<ReviewMode, string> = {
  strict: 'Check wording, typos and every number.',
  numbers: 'Check only the numbers against the reference files.',
};

const MISMATCH_LINE =
  'When two files disagree on a number, use the one from the spreadsheet (.xlsx, .xls or .csv) and say which you used.';

export type PrefStep = 'outline' | 'page' | 'review';

export function prefsLines(prefs: AgentPrefs, step: PrefStep): string[] {
  const lines = [TONE_LINE[prefs.tone]];
  if (step === 'outline') lines.push(RESEARCH_LINE[prefs.research]);
  if (step === 'page') {
    lines.push(DESIGN_LINE[prefs.design]);
    lines.push(prefs.autoImages ? IMAGES_LINE.yes : IMAGES_LINE.no);
  }
  if (step === 'review') {
    lines.push(REVIEW_LINE[prefs.review]);
    if (!prefs.askOnMismatch) lines.push(MISMATCH_LINE);
  }
  return lines;
}

export const USE_IDS = ['report', 'pitch', 'lecture', 'launch', 'training', 'other'] as const;
export type UseId = (typeof USE_IDS)[number];

export function toneForUses(uses: readonly string[]): Tone | null {
  if (uses.includes('launch')) return 'concise';
  if (uses.includes('lecture') || uses.includes('training')) return 'friendly';
  if (uses.includes('report') || uses.includes('pitch')) return 'steady';
  return null;
}
