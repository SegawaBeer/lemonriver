/** A change list handed to the agent, waiting for its turn to end. */
export type BoardApplying = {
  startedAt: number;
  sessionId: string | null;
  userItemId: string | null;
};

/** How the last hand-over went. Written for the cards to light up. */
export type BoardLastApply = { ok: boolean; at: number; error?: string; pages: string[] };

export function sanitizeApplying(raw: unknown): BoardApplying | null {
  if (!raw || typeof raw !== 'object') return null;
  const { startedAt, sessionId, userItemId } = raw as Record<string, unknown>;
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null;
  return {
    startedAt,
    sessionId: typeof sessionId === 'string' && sessionId ? sessionId : null,
    userItemId: typeof userItemId === 'string' && userItemId ? userItemId : null,
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
