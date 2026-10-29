import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AgentModelOption } from '../../../agent/types.ts';
import {
  type ClientModelSettings,
  clientFollowOption,
  NO_CLIENT_SETTINGS,
} from '../client-settings.ts';
import { type CompatibleProvider, createCompatibleProvider } from './compatible.ts';

export const WORKBUDDY_CLI_PATHS = [
  '/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy',
];

// The models the bundled CodeBuddy CLI accepts in `--model`.
const WORKBUDDY_MODELS: AgentModelOption[] = [
  { id: 'auto', label: 'Auto', efforts: [] },
  { id: 'glm-5.1', label: 'GLM-5.1', efforts: [] },
  { id: 'glm-5.0', label: 'GLM-5.0', efforts: [] },
  { id: 'glm-5v-turbo', label: 'GLM-5V Turbo', efforts: [] },
  { id: 'glm-5.0-turbo', label: 'GLM-5.0 Turbo', efforts: [] },
  { id: 'glm-4.7', label: 'GLM-4.7', efforts: [] },
  { id: 'kimi-k2.5', label: 'Kimi K2.5', efforts: [] },
  { id: 'minimax-m2.7', label: 'MiniMax M2.7', efforts: [] },
  { id: 'deepseek-v3-2-volc', label: 'DeepSeek V3.2', efforts: [] },
];

function configDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CODEBUDDY_CONFIG_DIR || path.join(os.homedir(), '.codebuddy');
}

export function parseWorkBuddySettings(raw: unknown): ClientModelSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const model = typeof r.model === 'string' && r.model.trim() ? r.model.trim() : null;
  return { model, label: model, effort: null };
}

// The CLI keeps its model in its own settings file; the follow-the-client row
// shows that model so the menu says what an empty choice will run.
async function readClientSettings(): Promise<ClientModelSettings> {
  const env = process.env;
  const fromEnv =
    typeof env.CODEBUDDY_MODEL === 'string' && env.CODEBUDDY_MODEL.trim()
      ? env.CODEBUDDY_MODEL.trim()
      : null;
  try {
    const raw = await fs.readFile(path.join(configDir(env), 'settings.json'), 'utf8');
    const parsed = parseWorkBuddySettings(JSON.parse(raw));
    return fromEnv ? { ...parsed, model: fromEnv, label: fromEnv } : parsed;
  } catch {
    return fromEnv ? { model: fromEnv, label: fromEnv, effort: null } : NO_CLIENT_SETTINGS;
  }
}

export async function workbuddyModelOptions(): Promise<AgentModelOption[]> {
  const client = await readClientSettings();
  return [clientFollowOption(client, '客户端设置', []), ...WORKBUDDY_MODELS];
}

export function createWorkBuddyProvider(): CompatibleProvider {
  return createCompatibleProvider({
    id: 'workbuddy',
    name: 'WorkBuddy',
    command: 'codebuddy',
    fixedPaths: WORKBUDDY_CLI_PATHS,
    models: workbuddyModelOptions,
  });
}
