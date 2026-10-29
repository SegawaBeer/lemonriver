import fs from 'node:fs/promises';
import path from 'node:path';
import { LEMONRIVER_PROVIDER_IDS } from '../../../agent/types.ts';

const FILE_NAME = 'agent-providers.json';

export function agentProvidersFile(userCwd: string): string {
  return path.join(userCwd, 'node_modules', '.open-slide', FILE_NAME);
}

export function sanitizeEnabled(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const id of list) {
    if (typeof id !== 'string') continue;
    if (!(LEMONRIVER_PROVIDER_IDS as readonly string[]).includes(id)) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export async function readEnabledProviders(userCwd: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(agentProvidersFile(userCwd), 'utf8');
    return new Set(sanitizeEnabled((JSON.parse(raw) as { enabled?: unknown }).enabled));
  } catch {
    return new Set();
  }
}

export async function writeEnabledProviders(userCwd: string, ids: string[]): Promise<string[]> {
  const enabled = sanitizeEnabled(ids);
  const file = agentProvidersFile(userCwd);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify({ enabled }, null, 2)}\n`, 'utf8');
  return enabled;
}
