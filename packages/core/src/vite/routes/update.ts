import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { BIN_NAME, LEGACY_BIN_NAME } from '../../branding.ts';
import { validateMutationRequest } from '../../http/request-guard.ts';
import { readFrameworkDependency } from '../../workspace-specifier.ts';
import { type ApiContext, json } from './context.ts';

// GET /__update-check  → { current, latest, outdated }
//   Compares the installed framework version against the npm `latest` dist-tag
//   of whichever package the workspace depends on. Network/parse failures
//   degrade to { latest: null, outdated: false }.
// POST /__update-package → { packageManager, command, latest, message }
//   Installs the latest framework version with the detected package manager,
//   then runs `<bin> sync:skills`.

const CACHE_TTL_MS = 10 * 60 * 1000;
const COMMAND_TIMEOUT_MS = 300_000;

type CheckResult = { current: string; latest: string | null; outdated: boolean };
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
type CommandSpec = { cmd: string; args: string[] };
type UpdateResult = {
  packageManager: PackageManager;
  command: string;
  latest: string | null;
  message: string;
};

let cache: { pkg: string; at: number; latest: string | null } | null = null;
let updateInFlight: Promise<UpdateResult> | null = null;

function parseSemver(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isOutdated(current: string, latest: string): boolean {
  const a = parseSemver(current);
  const b = parseSemver(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (b[i] > a[i]) return true;
    if (b[i] < a[i]) return false;
  }
  return false;
}

async function fetchLatest(pkg: string, now: number): Promise<string | null> {
  if (cache && cache.pkg === pkg && now - cache.at < CACHE_TTL_MS) return cache.latest;
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`, {
      signal: AbortSignal.timeout(3000),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`registry ${res.status}`);
    const body = (await res.json()) as { version?: unknown };
    const latest = typeof body.version === 'string' ? body.version : null;
    cache = { pkg, at: now, latest };
    return latest;
  } catch {
    return cache?.pkg === pkg ? cache.latest : null;
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

const LOCKFILES: ReadonlyArray<readonly [string, PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
];

export async function detectPackageManager(cwd: string): Promise<PackageManager> {
  const ua = process.env.npm_config_user_agent ?? '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('bun')) return 'bun';
  if (ua.startsWith('npm')) return 'npm';

  // Workspace members have no lockfile of their own; it lives at the root.
  let dir = cwd;
  while (true) {
    for (const [lockfile, pm] of LOCKFILES) {
      if (await fileExists(path.join(dir, lockfile))) return pm;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return 'npm';
    dir = parent;
  }
}

export function updateCommandFor(packageManager: PackageManager, addTarget: string): CommandSpec {
  switch (packageManager) {
    case 'pnpm':
      return { cmd: 'pnpm', args: ['add', addTarget] };
    case 'yarn':
      return { cmd: 'yarn', args: ['add', addTarget] };
    case 'bun':
      return { cmd: 'bun', args: ['add', addTarget] };
    case 'npm':
      return { cmd: 'npm', args: ['install', addTarget] };
  }
}

async function localSyncCommand(cwd: string): Promise<CommandSpec> {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  for (const name of [BIN_NAME, LEGACY_BIN_NAME]) {
    const bin = path.join(cwd, 'node_modules', '.bin', `${name}${ext}`);
    if (await fileExists(bin)) return { cmd: bin, args: ['sync:skills'] };
  }
  return {
    cmd: path.join(cwd, 'node_modules', '.bin', `${BIN_NAME}${ext}`),
    args: ['sync:skills'],
  };
}

function formatCommand(spec: CommandSpec): string {
  return [spec.cmd, ...spec.args].join(' ');
}

async function runCommand(spec: CommandSpec, cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(spec.cmd, spec.args, {
      cwd,
      env: process.env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${formatCommand(spec)} timed out`));
    }, COMMAND_TIMEOUT_MS);

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 2000) stderr = stderr.slice(-2000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim();
      reject(new Error(detail || `${formatCommand(spec)} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function updatePackage(ctx: ApiContext): Promise<UpdateResult> {
  const packageManager = await detectPackageManager(ctx.userCwd);
  const dependency = readFrameworkDependency(ctx.userCwd);
  const updateCommand = updateCommandFor(packageManager, dependency.addTarget);
  const syncCommand = await localSyncCommand(ctx.userCwd);

  await runCommand(updateCommand, ctx.userCwd);
  await runCommand(syncCommand, ctx.userCwd);

  cache = null;
  const latest = await fetchLatest(dependency.pkg, Date.now());
  return {
    packageManager,
    command: `${formatCommand(updateCommand)} && ${BIN_NAME} sync:skills`,
    latest,
    message: `Updated ${dependency.pkg} and synced skills.`,
  };
}

export function registerUpdateRoutes(server: ViteDevServer, ctx: ApiContext): void {
  server.middlewares.use('/__update-check', async (req, res, next) => {
    if ((req.method ?? 'GET') !== 'GET') return next();
    const latest = await fetchLatest(readFrameworkDependency(ctx.userCwd).pkg, Date.now());
    const result: CheckResult = {
      current: ctx.coreVersion,
      latest,
      outdated: latest ? isOutdated(ctx.coreVersion, latest) : false,
    };
    res.setHeader('cache-control', 'no-store');
    json(res, 200, result);
  });

  server.middlewares.use('/__update-package', async (req, res, next) => {
    if ((req.method ?? 'GET') !== 'POST') return next();

    const guard = validateMutationRequest(req);
    if (!guard.ok) return json(res, guard.status, { error: guard.error });

    try {
      updateInFlight ??= updatePackage(ctx).finally(() => {
        updateInFlight = null;
      });
      const result = await updateInFlight;
      json(res, 200, result);
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : 'update failed' });
    }
  });
}
