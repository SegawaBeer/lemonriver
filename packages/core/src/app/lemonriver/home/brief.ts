import { useEffect } from 'react';
import { requestAgent, useAgentState } from '@/lib/agent/use-agent';

const KEY = 'lemonriver:new-deck-brief';

/** Keeps the home page's one-line brief across the navigation into the new deck. */
export function saveBrief(text: string, storage: Storage = sessionStorage): void {
  try {
    storage.setItem(KEY, text);
  } catch {}
}

export function takeBrief(storage: Storage = sessionStorage): string | null {
  try {
    const text = storage.getItem(KEY);
    storage.removeItem(KEY);
    return text?.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

/**
 * In the deck the home page just created, hands the brief to the agent panel as
 * the first message. The panel holds it until an agent is connected.
 */
export function useNewDeckBrief(slideId: string): void {
  const { newDeck } = useAgentState();
  useEffect(() => {
    if (!import.meta.env.DEV || newDeck !== slideId) return;
    const text = takeBrief();
    if (text) requestAgent({ text });
  }, [newDeck, slideId]);
}
