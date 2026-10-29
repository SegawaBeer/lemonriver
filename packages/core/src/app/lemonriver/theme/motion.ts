import { useSyncExternalStore } from 'react';
import { REDUCE_MOTION_KEY } from './pages';

const SYSTEM_QUERY = '(prefers-reduced-motion: reduce)';

function readSetting(): boolean {
  try {
    return localStorage.getItem(REDUCE_MOTION_KEY) === '1';
  } catch {
    return false;
  }
}

let setting = typeof window === 'undefined' ? false : readSetting();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The user's own "Reduce motion" switch. The system preference is separate. */
export function useReduceMotionSetting(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => setting,
    () => false,
  );
}

export function setReduceMotionSetting(value: boolean): void {
  setting = value;
  try {
    if (value) localStorage.setItem(REDUCE_MOTION_KEY, '1');
    else localStorage.removeItem(REDUCE_MOTION_KEY);
  } catch {}
  applyReduceMotion(value);
  for (const listener of listeners) listener();
}

export function applyReduceMotion(value: boolean): void {
  document.documentElement.toggleAttribute('data-lr-reduce-motion', value);
}

/** True when either the setting or the system asks for less motion. */
export function motionReduced(): boolean {
  if (typeof window === 'undefined') return true;
  if (setting) return true;
  return window.matchMedia?.(SYSTEM_QUERY).matches ?? false;
}
