import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { LEMONRIVER_PROVIDER_IDS } from '../../../agent/types.ts';

const execFileAsync = promisify(execFile);

const APPS_DIR = '/Applications';

// Each product's own macOS bundle. Its icon is read from the copy installed on
// this machine and cached under node_modules; it never ships with us.
const APP_BUNDLES: Record<(typeof LEMONRIVER_PROVIDER_IDS)[number], string> = {
  workbuddy: 'WorkBuddy',
  dumate: 'DuMate',
};

export type IconProviderId = (typeof LEMONRIVER_PROVIDER_IDS)[number];

export function isIconProviderId(value: string): value is IconProviderId {
  return (LEMONRIVER_PROVIDER_IDS as readonly string[]).includes(value);
}

export function providerIconFile(userCwd: string, id: IconProviderId): string {
  return path.join(userCwd, 'node_modules', '.open-slide', 'agent-icons', `${id}.png`);
}

export function providerIcnsFile(id: IconProviderId, appsDir = APPS_DIR): string {
  return path.join(appsDir, `${APP_BUNDLES[id]}.app`, 'Contents', 'Resources', 'icon.icns');
}

export async function sipsToPng(icns: string, png: string): Promise<void> {
  await execFileAsync('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '64', icns, '--out', png]);
}

export interface IconOptions {
  appsDir?: string;
  convert?: (icns: string, png: string) => Promise<void>;
}

export async function readProviderIcon(
  userCwd: string,
  id: string,
  opts: IconOptions = {},
): Promise<Buffer | null> {
  if (!isIconProviderId(id)) return null;

  const cached = providerIconFile(userCwd, id);
  if (existsSync(cached)) return fs.readFile(cached);

  const icns = providerIcnsFile(id, opts.appsDir);
  if (!existsSync(icns)) return null;

  await fs.mkdir(path.dirname(cached), { recursive: true });
  try {
    await (opts.convert ?? sipsToPng)(icns, cached);
  } catch {
    return null;
  }
  return existsSync(cached) ? fs.readFile(cached) : null;
}
