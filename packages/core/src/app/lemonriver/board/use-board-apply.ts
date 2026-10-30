import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  createSession,
  sendMessage,
  setActiveSession,
  setDockOpen,
  useAgentSessions,
  useAgentStatus,
} from '@/lib/agent/use-agent';
import { format, useLocale } from '@/lib/use-locale';
import { useLrText } from '../text';
import type { BoardTask } from './model/agent-tasks';
import {
  type BoardApplying,
  type BoardLastApply,
  type ChapterPlan,
  sanitizeApplying,
  sanitizeChapterPlan,
  sanitizeLastApply,
} from './model/apply';
import { type BoardColumn, sanitizeStructure } from './model/structure';

const POLL_MS = 1500;
const STALL_MS = 10 * 60_000;
/** Long enough for the turn to start; a session that is idle after this never got it. */
const IDLE_STALL_MS = 60_000;

type BoardApplyState = {
  applying: BoardApplying | null;
  lastApply: BoardLastApply | null;
  chapterPlan: ChapterPlan | null;
  /** The chapters as the server has them now, read with every poll. */
  columns: BoardColumn[] | null;
};

async function readBoardState(slideId: string): Promise<BoardApplyState | null> {
  try {
    const res = await fetch(`/__board?slideId=${encodeURIComponent(slideId)}`);
    if (!res.ok) return null;
    const body = (await res.json()) as {
      applying?: unknown;
      lastApply?: unknown;
      chapterPlan?: unknown;
      columns?: unknown;
    };
    return {
      applying: sanitizeApplying(body.applying),
      lastApply: sanitizeLastApply(body.lastApply),
      chapterPlan: sanitizeChapterPlan(body.chapterPlan),
      columns: sanitizeStructure({ columns: body.columns })?.columns ?? null,
    };
  } catch {
    return null;
  }
}

async function post(path: string, slideId: string, body: Record<string, unknown> = {}) {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slideId, ...body }),
    });
  } catch {
    return null;
  }
}

/**
 * Hands one task to the agent in a single message and follows the board record
 * until the turn ends: running, settled, or given up on.
 */
export function useBoardApply(
  slideId: string,
  onSettled: (last: BoardLastApply | null, was: BoardApplying | null) => void,
) {
  const lr = useLrText();
  const locale = useLocale();
  const { sessions } = useAgentSessions();
  const { connected, provider } = useAgentStatus();
  const [state, setState] = useState<BoardApplyState>({
    applying: null,
    lastApply: null,
    chapterPlan: null,
    columns: null,
  });
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const previous = useRef<BoardApplying | null>(null);
  const settled = useRef(onSettled);
  settled.current = onSettled;

  const refresh = useCallback(async () => {
    const next = await readBoardState(slideId);
    if (!next) return;
    const was = previous.current;
    const wasRunning = was !== null;
    previous.current = next.applying;
    setState(next);
    setNow(Date.now());
    if (wasRunning && !next.applying) settled.current(next.lastApply, was);
  }, [slideId]);

  useEffect(() => {
    previous.current = null;
    setState({ applying: null, lastApply: null, chapterPlan: null, columns: null });
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!state.applying) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [state.applying, refresh]);

  const start = useCallback(
    async (task: BoardTask) => {
      if (starting) return;
      setStarting(true);
      try {
        const res = await post('/__board/apply', slideId, { task, lang: locale.id });
        if (!res?.ok) {
          const body = res ? ((await res.json().catch(() => null)) as { error?: string }) : null;
          throw new Error(body?.error ?? `HTTP ${res?.status ?? 0}`);
        }
        const { prompt } = (await res.json()) as { prompt: string };

        const existing = sessions.find((session) => session.slideId === slideId);
        let sessionId = existing?.id ?? null;
        if (!sessionId) {
          if (!provider) throw new Error('no agent');
          sessionId = (await createSession(provider.id, slideId)).id;
        }
        setActiveSession(sessionId);
        await sendMessage(sessionId, prompt, { slideId });
        // The message id is the server's to make; the session is enough to keep
        // another conversation on this deck from settling the task.
        await fetch('/__board/apply', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slideId, sessionId }),
        });
        setDockOpen(true);
        await refresh();
      } catch (err) {
        toast.error(
          format(lr.board.applyFailed, { reason: String((err as Error).message ?? err) }),
        );
        await refresh();
      } finally {
        setStarting(false);
      }
    },
    [lr.board.applyFailed, locale.id, provider, refresh, sessions, slideId, starting],
  );

  const savePlan = useCallback(
    async (plan: ChapterPlan | null) => {
      try {
        await fetch('/__board/plan', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slideId, chapterPlan: plan }),
        });
      } catch {}
      await refresh();
    },
    [refresh, slideId],
  );

  const cancel = useCallback(async () => {
    await post('/__board/apply/cancel', slideId);
    await refresh();
  }, [refresh, slideId]);

  const undoLast = useCallback(async () => {
    const res = await post('/__board/apply/undo', slideId);
    if (!res?.ok) return false;
    await refresh();
    return true;
  }, [refresh, slideId]);

  const running = sessions.some(
    (session) => session.slideId === slideId && session.status === 'running',
  );
  const { applying, lastApply, chapterPlan, columns } = state;
  const elapsed = applying ? now - applying.startedAt : 0;
  const stalled =
    applying !== null && (elapsed > STALL_MS || (!running && elapsed > IDLE_STALL_MS));

  return {
    applying,
    lastApply,
    chapterPlan,
    columns,
    stalled,
    starting,
    connected,
    start,
    savePlan,
    cancel,
    undoLast,
    refresh,
  };
}
