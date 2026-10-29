import { findOnPath } from '../../../agent/detect.ts';
import type { AgentProvider } from '../../../agent/provider.ts';
import {
  AGENT_PROVIDER_IDS,
  type AgentProviderId,
  LEMONRIVER_PROVIDER_IDS,
} from '../../../agent/types.ts';
import type { CompatibleProvider } from './compatible.ts';
import { DUMATE_REASON, dumateInstalled } from './dumate.ts';
import { createWorkBuddyProvider } from './workbuddy.ts';

export type ProviderRow = {
  id: AgentProviderId;
  name: string;
  // Claude Code and Codex are always on; the rest are switched on here.
  builtin: boolean;
  detected: boolean;
  connectable: boolean;
  // Why a detected provider still can't be used, as a message key.
  reason: string | null;
};

export function isExtraProviderId(id: string): id is (typeof LEMONRIVER_PROVIDER_IDS)[number] {
  return (LEMONRIVER_PROVIDER_IDS as readonly string[]).includes(id);
}

export function createExtraProviders(): Partial<Record<AgentProviderId, AgentProvider>> {
  return { workbuddy: createWorkBuddyProvider() };
}

export function extraProvider(provider: AgentProvider): CompatibleProvider | null {
  return isExtraProviderId(provider.id) ? (provider as CompatibleProvider) : null;
}

// Claude Code and Codex always list; the others only once switched on.
export function isListedProvider(provider: AgentProvider, enabled: ReadonlySet<string>): boolean {
  return !isExtraProviderId(provider.id) || enabled.has(provider.id);
}

export function providerCatalog(): ProviderRow[] {
  const rows: ProviderRow[] = AGENT_PROVIDER_IDS.map((id) => ({
    id: id as AgentProviderId,
    name: id === 'claude' ? 'Claude Code' : 'Codex',
    builtin: true,
    detected: findOnPath(id) !== null,
    connectable: true,
    reason: null,
  }));
  const workbuddy = createWorkBuddyProvider();
  rows.push({
    id: workbuddy.id,
    name: workbuddy.name,
    builtin: false,
    detected: workbuddy.resolveCommand() !== null,
    connectable: true,
    reason: null,
  });
  rows.push({
    id: 'dumate' as AgentProviderId,
    name: 'DuMate',
    builtin: false,
    detected: dumateInstalled(),
    connectable: false,
    reason: DUMATE_REASON,
  });
  return rows;
}

export function connectableIds(rows: ProviderRow[], enabled: Iterable<string>): string[] {
  const allowed = new Set(
    rows.filter((r) => r.connectable && r.detected).map((r) => r.id as string),
  );
  return [...enabled].filter((id) => allowed.has(id));
}
