import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AgentEffort, AgentModelOption, AgentProviderId } from '../../agent/types.ts';
import { isAgentEffort } from '../../agent/types.ts';

export type ClientModelSettings = {
  // The model the client is set to, as the client wrote it ("opus 4.8").
  model: string | null;
  // The same model as the menu should show it ("Opus 4.8").
  label: string | null;
  effort: AgentEffort | null;
};

export const NO_CLIENT_SETTINGS: ClientModelSettings = { model: null, label: null, effort: null };

export type SettingsReadOptions = { home?: string; env?: NodeJS.ProcessEnv };

function claudeSettingsFile(opts: SettingsReadOptions): string {
  const env = opts.env ?? process.env;
  const dir = env.CLAUDE_CONFIG_DIR || path.join(opts.home ?? os.homedir(), '.claude');
  return path.join(dir, 'settings.json');
}

function codexConfigFile(opts: SettingsReadOptions): string {
  const env = opts.env ?? process.env;
  const dir = env.CODEX_HOME || path.join(opts.home ?? os.homedir(), '.codex');
  return path.join(dir, 'config.toml');
}

export function parseClaudeSettings(raw: unknown): { model: string | null; effort: string | null } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    model: typeof r.model === 'string' && r.model.trim() ? r.model.trim() : null,
    effort: typeof r.effortLevel === 'string' ? r.effortLevel.trim() : null,
  };
}

// Only top-level keys count: config.toml repeats `model` under
// [model_providers.*] for providers other than the one in use.
export function parseCodexConfig(raw: string): { model: string | null; effort: string | null } {
  const out: { model: string | null; effort: string | null } = { model: null, effort: null };
  let section = '';
  for (const line of raw.split(/\r?\n/)) {
    const text = stripComment(line).trim();
    if (!text) continue;
    if (text.startsWith('[')) {
      section = text;
      continue;
    }
    if (section) continue;
    const eq = text.indexOf('=');
    if (eq === -1) continue;
    const key = text.slice(0, eq).trim();
    const value = unquote(text.slice(eq + 1).trim());
    if (!value) continue;
    if (key === 'model') out.model = value;
    else if (key === 'model_reasoning_effort') out.effort = value;
  }
  return out;
}

function stripComment(line: string): string {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

function unquote(value: string): string {
  const quote = value.charAt(0);
  if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
    return value.slice(1, -1);
  }
  return value;
}

// "opus 4.8" reads as "Opus 4.8"; dated ids and anything else stay untouched.
export function claudeModelLabel(model: string): string {
  if (!/^[a-z]+(?: [\w.]+)*$/.test(model)) return model;
  return model
    .split(' ')
    .map((word) => (/^[a-z]+$/.test(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

async function readFileText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

function readJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function readClientModelSettings(
  provider: AgentProviderId,
  opts: SettingsReadOptions = {},
): Promise<ClientModelSettings> {
  if (provider === 'claude') {
    const parsed = parseClaudeSettings(readJson(await readFileText(claudeSettingsFile(opts))));
    const env = opts.env ?? process.env;
    const fromEnv =
      typeof env.ANTHROPIC_MODEL === 'string' && env.ANTHROPIC_MODEL.trim()
        ? env.ANTHROPIC_MODEL.trim()
        : null;
    const model = fromEnv ?? parsed.model;
    const effort = parsed.effort && isAgentEffort(parsed.effort) ? parsed.effort : null;
    return { model, label: model ? claudeModelLabel(model) : null, effort };
  }
  const raw = await readFileText(codexConfigFile(opts));
  const parsed = parseCodexConfig(raw ?? '');
  const effort = parsed.effort && isAgentEffort(parsed.effort) ? parsed.effort : null;
  return { model: parsed.model, label: parsed.model, effort };
}

export function clientFollowOption(
  settings: ClientModelSettings,
  fallbackLabel: string,
  efforts: AgentEffort[],
): AgentModelOption {
  return {
    id: '',
    label: settings.label ?? fallbackLabel,
    efforts,
    clientEffort: settings.effort,
  };
}
