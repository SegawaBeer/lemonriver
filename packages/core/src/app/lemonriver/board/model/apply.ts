import type { OutlinePage } from '../../outline/model.ts';
import { sanitizeItems } from '../../outline/model.ts';
import {
  type BoardTask,
  MAX_CHAPTER_BRIEF,
  MAX_CHAPTER_TITLE,
  MAX_PLAN_ITEMS,
  sanitizeTask,
} from './agent-tasks.ts';

/** A task handed to the agent, waiting for its turn to end. */
export type BoardApplying = {
  startedAt: number;
  sessionId: string | null;
  userItemId: string | null;
  task: BoardTask;
};

/** How the last hand-over went. Written for the cards to light up. */
export type BoardLastApply = { ok: boolean; at: number; error?: string; pages: string[] };

/** The titles an agent planned for a chapter, before the user says to write them. */
export type ChapterPlan = {
  chapter: number;
  title: string;
  brief: string;
  items: OutlinePage[];
  state: 'ready' | 'failed';
  error?: string;
};

export function sanitizeApplying(raw: unknown): BoardApplying | null {
  if (!raw || typeof raw !== 'object') return null;
  const { startedAt, sessionId, userItemId, task } = raw as Record<string, unknown>;
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null;
  return {
    startedAt,
    sessionId: typeof sessionId === 'string' && sessionId ? sessionId : null,
    userItemId: typeof userItemId === 'string' && userItemId ? userItemId : null,
    task: sanitizeTask(task) ?? { kind: 'changes' },
  };
}

export function sanitizeLastApply(raw: unknown): BoardLastApply | null {
  if (!raw || typeof raw !== 'object') return null;
  const { ok, at, error, pages } = raw as Record<string, unknown>;
  if (typeof ok !== 'boolean' || typeof at !== 'number' || !Number.isFinite(at)) return null;
  return {
    ok,
    at,
    ...(typeof error === 'string' && error ? { error: error.slice(0, 200) } : {}),
    pages: Array.isArray(pages)
      ? pages.filter((page): page is string => typeof page === 'string')
      : [],
  };
}

export function sanitizeChapterPlan(raw: unknown): ChapterPlan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { chapter, title, brief, items, state, error } = raw as Record<string, unknown>;
  if (typeof chapter !== 'number' || !Number.isInteger(chapter) || chapter < 0) return null;
  if (state !== 'ready' && state !== 'failed') return null;
  return {
    chapter,
    title: typeof title === 'string' ? title.slice(0, MAX_CHAPTER_TITLE) : '',
    brief: typeof brief === 'string' ? brief.slice(0, MAX_CHAPTER_BRIEF) : '',
    items: sanitizeItems(items).slice(0, MAX_PLAN_ITEMS),
    state,
    ...(typeof error === 'string' && error ? { error: error.slice(0, 200) } : {}),
  };
}
