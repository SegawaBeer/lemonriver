import type { AgentEffort, AgentModelOption } from '../../agent/types.ts';
import { isAgentEffort } from '../../agent/types.ts';
import {
  type ClientModelSettings,
  clientFollowOption,
  readClientModelSettings,
} from './client-settings.ts';

const CLAUDE_EFFORTS: AgentEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const CACHE_TTL_MS = 10 * 60 * 1000;
const ASK_TIMEOUT_MS = 3000;

type SupportedModel = {
  value?: unknown;
  displayName?: unknown;
  supportsEffort?: unknown;
  supportedEffortLevels?: unknown;
};

let claudeCache: { models: AgentModelOption[]; at: number } | null = null;

export function convertSupportedModels(list: unknown): AgentModelOption[] {
  if (!Array.isArray(list)) return [];
  const models: AgentModelOption[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const m = entry as SupportedModel;
    if (typeof m.value !== 'string' || !m.value) continue;
    const levels = Array.isArray(m.supportedEffortLevels)
      ? m.supportedEffortLevels.filter(isAgentEffort)
      : [];
    const efforts = levels.length > 0 ? levels : m.supportsEffort === false ? [] : CLAUDE_EFFORTS;
    const label = typeof m.displayName === 'string' && m.displayName ? m.displayName : m.value;
    models.push({ id: m.value, label, efforts });
  }
  return models;
}

// Asked alongside a real turn's query, never on its own: starting a session
// just to list models would pay a process and a login for the menu.
export function cacheClaudeModels(source: unknown): void {
  const ask = (source as { supportedModels?: unknown } | null)?.supportedModels;
  if (typeof ask !== 'function') return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ASK_TIMEOUT_MS);
  });
  const asked = Promise.resolve()
    .then(() => (ask as () => Promise<unknown>).call(source))
    .catch(() => null);
  void Promise.race([asked, timeout]).then((list) => {
    if (timer) clearTimeout(timer);
    const models = convertSupportedModels(list);
    if (models.length > 0) claudeCache = { models, at: Date.now() };
  });
}

export function cachedClaudeModels(now = Date.now()): AgentModelOption[] | null {
  if (!claudeCache || now - claudeCache.at > CACHE_TTL_MS) return null;
  return claudeCache.models;
}

export function resetClaudeModelsCache(): void {
  claudeCache = null;
}

// The model config.toml names may be missing from the cache, and the cache's
// own bare "Default" row is replaced by the follow-the-client row.
export function withClientModel(
  models: AgentModelOption[],
  settings: ClientModelSettings,
  fallbackEfforts: AgentEffort[],
): AgentModelOption[] {
  const rest = models.filter((m) => m.id !== '');
  if (!settings.model) return rest;
  if (rest.some((m) => m.id === settings.model)) return rest;
  return [
    { id: settings.model, label: settings.label ?? settings.model, efforts: fallbackEfforts },
    ...rest,
  ];
}

export async function claudeModelOptions(
  fallback: AgentModelOption[],
  fallbackLabel: string,
  efforts: AgentEffort[],
): Promise<AgentModelOption[]> {
  const client = await readClientModelSettings('claude');
  return [
    clientFollowOption(client, fallbackLabel, efforts),
    ...(cachedClaudeModels() ?? fallback),
  ];
}

export async function codexModelOptions(
  fallback: AgentModelOption,
  list: () => Promise<AgentModelOption[]>,
): Promise<AgentModelOption[]> {
  const client = await readClientModelSettings('codex');
  return [
    clientFollowOption(client, fallback.label, fallback.efforts),
    ...withClientModel(await list(), client, fallback.efforts),
  ];
}
