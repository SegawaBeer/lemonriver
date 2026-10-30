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
import { format } from '@/lib/use-locale';
import { useLrText } from '../text';
import {
  type BoardApplying,
  type BoardLastApply,
  sanitizeApplying,
  sanitizeLastApply,
} from './model/apply';

const POLL_MS = 1500;
const STALL_MS = 10 * 60_000;
/** Long enough for the turn to start; a session that is idle after this never got it. */
const IDLE_STALL_MS = 60_000;

type BoardApplyState = { applying: BoardApplying | null; lastApply: BoardLastApply | null };

async function readBoardState(slideId: string): Promise<BoardApplyState | null> {
  try {
    const res = await fetch(`/__board?slideId=${encodeURIComponent(slideId)}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { applying?: unknown; lastApply?: unknown };
    return {
      applying: sanitizeApplying(body.applying),
      lastApply: sanitizeLastApply(body.lastApply),
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
 * Hands the change list to the agent in one message and follows the board
 * record until the turn ends: running, settled, or given up on.
 */
export function useBoardApply(slideId: string, onSettled: (last: BoardLastApply | null) => void) {
  const lr = useLrText();
  const { sessions } = useAgentSessions();
  const { connected, provider } = useAgentStatus();
  const [state, setState] = useState<BoardApplyState>({ applying: null, lastApply: null });
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const previous = useRef<BoardApplying | null>(null);
  const settled = useRef(onSettled);
  settled.current = onSettled;

  const refresh = useCallback(async () => {
    const next = await readBoardState(slideId);
    if (!next) return;
    const wasRunning = previous.current !== null;
    previous.current = next.applying;
    setState(next);
    setNow(Date.now());
    if (wasRunning && !next.applying) settled.current(next.lastApply);
  }, [slideId]);

  useEffect(() => {
    previous.current = null;
    setState({ applying: null, lastApply: null });
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!state.applying) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [state.applying, refresh]);

  const start = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    try {
      const res = await post('/__board/apply', slideId);
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
      // another conversation on this deck from settling the apply.
      await fetch('/__board/apply', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slideId, sessionId }),
      });
      setDockOpen(true);
      await refresh();
    } catch (err) {
      toast.error(format(lr.board.applyFailed, { reason: String((err as Error).message ?? err) }));
      await refresh();
    } finally {
      setStarting(false);
    }
  }, [lr.board.applyFailed, provider, refresh, sessions, slideId, starting]);

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
  const { applying, lastApply } = state;
  const elapsed = applying ? now - applying.startedAt : 0;
  const stalled =
    applying !== null && (elapsed > STALL_MS || (!running && elapsed > IDLE_STALL_MS));

  return {
    applying,
    lastApply,
    stalled,
    starting,
    connected,
    start,
    cancel,
    undoLast,
    refresh,
  };
}
