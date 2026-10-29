import { useSyncExternalStore } from 'react';
import { type AgentPrefs, DEFAULT_PREFS, readPrefs, sanitizePrefs, savePrefs } from './prefs';

let current: AgentPrefs =
  typeof window === 'undefined' ? DEFAULT_PREFS : readPrefs(window.localStorage);

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): AgentPrefs {
  return current;
}

function serverSnapshot(): AgentPrefs {
  return DEFAULT_PREFS;
}

export function useAgentPrefs(): AgentPrefs {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function setAgentPrefs(next: AgentPrefs): void {
  current = sanitizePrefs(next);
  savePrefs(window.localStorage, current);
  for (const listener of listeners) listener();
}

export function updateAgentPrefs(patch: Partial<AgentPrefs>): void {
  setAgentPrefs({ ...current, ...patch });
}
