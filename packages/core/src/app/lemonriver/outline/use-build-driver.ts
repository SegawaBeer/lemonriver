import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  createSession,
  sendMessage,
  setActiveSession,
  useAgentSession,
  useAgentSessions,
  useAgentStatus,
} from '@/lib/agent/use-agent';
import type { AgentProviderId, AgentSession, AgentSessionSummary } from '../../../agent/types';
import { type DriverAction, driverAction, type Outline } from './model';

const POLL_BUILD_MS = 2000;
const POLL_IDLE_MS = 10_000;

type Snapshot = {
  slideId: string | null;
  outline: Outline | null | undefined;
  running: boolean;
  waitingForAnswer: boolean;
  action: DriverAction;
};

type AgentView = {
  sessions: AgentSessionSummary[];
  active: AgentSession | null;
  providerId: AgentProviderId | null;
  connected: boolean;
};

let view: Snapshot = {
  slideId: null,
  outline: undefined,
  running: false,
  waitingForAnswer: false,
  action: 'idle',
};
let agent: AgentView = { sessions: [], active: null, providerId: null, connected: false };
let timer: number | null = null;
let subscribers = 0;
let sending = false;

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Snapshot {
  return view;
}

function currentAction(now: number): DriverAction {
  if (!view.outline) return 'idle';
  const action = driverAction(view.outline, { running: view.running, now });
  return action === 'send' && !agent.connected ? 'interrupted' : action;
}

function recompute() {
  const action = currentAction(Date.now());
  if (action === view.action) return;
  view = { ...view, action };
  notify();
}

async function sendPrompt(slideId: string, text: string): Promise<void> {
  const existing = agent.sessions.find((session) => session.slideId === slideId);
  if (existing) {
    setActiveSession(existing.id);
    await sendMessage(existing.id, text, { slideId });
    return;
  }
  if (!agent.providerId) throw new Error('no agent');
  const created = await createSession(agent.providerId, slideId);
  await sendMessage(created.id, text, { slideId });
}

async function dispatch(slideId: string, resume: boolean): Promise<void> {
  if (sending || !agent.connected) return;
  sending = true;
  try {
    const res = await fetch('/__lr/outline/next', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slideId, resume }),
    });
    if (!res.ok) return;
    const { prompt } = (await res.json()) as { prompt: string };
    await sendPrompt(slideId, prompt);
    await refresh(slideId);
  } catch {
  } finally {
    sending = false;
  }
}

function schedule() {
  if (timer !== null || view.slideId === null) return;
  const delay = view.outline?.state === 'building' ? POLL_BUILD_MS : POLL_IDLE_MS;
  timer = window.setTimeout(() => {
    timer = null;
    const slideId = view.slideId;
    if (slideId) void tick(slideId);
  }, delay);
}

async function tick(slideId: string): Promise<void> {
  await refresh(slideId);
  schedule();
}

async function refresh(slideId: string): Promise<void> {
  try {
    const res = await fetch(`/__lr/outline?slideId=${encodeURIComponent(slideId)}`);
    if (!res.ok) return;
    const body = (await res.json()) as { outline: Outline | null };
    if (view.slideId !== slideId) return;
    view = { ...view, outline: body.outline };
    const action = currentAction(Date.now());
    const changed = action !== view.action;
    view = { ...view, action };
    if (changed) notify();
    if (action === 'send') void dispatch(slideId, false);
  } catch {}
}

function attach(slideId: string) {
  subscribers += 1;
  if (view.slideId !== slideId) {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    view = {
      slideId,
      outline: undefined,
      running: false,
      waitingForAnswer: false,
      action: 'idle',
    };
    notify();
    void refresh(slideId);
  }
  schedule();
}

function detach() {
  subscribers = Math.max(subscribers - 1, 0);
  if (subscribers > 0) return;
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  view = { ...view, slideId: null };
}

function syncAgent(input: AgentView & { running: boolean; waitingForAnswer: boolean }) {
  agent = {
    sessions: input.sessions,
    active: input.active,
    providerId: input.providerId,
    connected: input.connected,
  };
  if (view.running !== input.running || view.waitingForAnswer !== input.waitingForAnswer) {
    view = { ...view, running: input.running, waitingForAnswer: input.waitingForAnswer };
    notify();
  }
  recompute();
  if (view.action === 'send' && view.slideId) void dispatch(view.slideId, false);
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

function lastIsPendingQuestion(session: AgentSession | null): boolean {
  const last = session?.items.at(-1);
  return last?.kind === 'question' && last.status === 'pending';
}

export function useBuildDriver(slideId: string) {
  const { sessions, activeId } = useAgentSessions();
  const active = useAgentSession(activeId);
  const { connected, provider } = useAgentStatus();

  const running = sessions.some(
    (session) => session.slideId === slideId && session.status === 'running',
  );
  const waitingForAnswer = active?.slideId === slideId && lastIsPendingQuestion(active);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    attach(slideId);
    return detach;
  }, [slideId]);

  useEffect(() => {
    syncAgent({
      sessions,
      active,
      providerId: provider?.id ?? null,
      connected,
      running,
      waitingForAnswer,
    });
  }, [sessions, active, provider, connected, running, waitingForAnswer]);

  const pause = useCallback(async () => {
    const res = await post('/__lr/outline/pause', slideId, { paused: true });
    if (res?.ok) await refresh(slideId);
  }, [slideId]);

  const resume = useCallback(async () => {
    await post('/__lr/outline/pause', slideId, { paused: false });
    await dispatch(slideId, true);
  }, [slideId]);

  const undo = useCallback(async () => {
    const res = await post('/__lr/outline/undo', slideId);
    return res?.ok ?? false;
  }, [slideId]);

  return {
    outline: snapshot.slideId === slideId ? snapshot.outline : undefined,
    action: snapshot.slideId === slideId ? snapshot.action : ('idle' as DriverAction),
    running: snapshot.running,
    waitingForAnswer: snapshot.waitingForAnswer,
    connected,
    pause,
    resume,
    undo,
  };
}
