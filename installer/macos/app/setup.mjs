#!/usr/bin/env node
import { execFile, execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const DOCK_DOMAIN = 'com.apple.dock';
export const SERVICE_LABEL = 'com.lemonriver.app';
export const DEFAULT_PORT_RANGE = { start: 5273, end: 5279 };
export const EXIT_WRONG_LOCATION = 78;

// Running straight from the dmg or from a quarantined download puts the app
// somewhere that disappears: /Volumes/ unmounts, and Gatekeeper runs an
// un-moved app from a random read-only AppTranslocation directory. Anything
// setup.sh points at from there (desktop alias, Dock tile, launchd job) would
// dangle, so the location is checked before anything is created.
export function installLocationProblem(appPath) {
  const target = String(appPath).replace(/\/+$/, '');
  if (target.startsWith('/Volumes/')) return 'volume';
  if (target.includes('/AppTranslocation/')) return 'translocated';
  return null;
}

export function readState(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeState(file, patch) {
  const next = { ...readState(file), ...patch };
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(tmp, file);
  return next;
}

export function probePort(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

export async function pickPort({ start, end, probe = probePort } = DEFAULT_PORT_RANGE) {
  for (let port = start; port <= end; port += 1) {
    if (await probe(port)) return port;
  }
  return null;
}

export function fileUrl(target) {
  const absolute = target.endsWith('/') ? target : `${target}/`;
  return `file://${encodeURI(absolute).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}

function xmlEscape(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function dockEntry(appPath) {
  return [
    '<dict>',
    '<key>tile-data</key>',
    '<dict>',
    '<key>file-data</key>',
    '<dict>',
    `<key>_CFURLString</key><string>${xmlEscape(fileUrl(appPath))}</string>`,
    '<key>_CFURLStringType</key><integer>15</integer>',
    '</dict>',
    '</dict>',
    '<key>tile-type</key><string>file-tile</string>',
    '</dict>',
  ].join('');
}

export function dockHasApp(persistentApps, appPath) {
  const target = String(appPath).replace(/\/+$/, '');
  const entries = Array.isArray(persistentApps) ? persistentApps : [];
  return entries.some((item) => {
    const url = item?.['tile-data']?.['file-data']?._CFURLString;
    if (typeof url !== 'string') return false;
    const raw = url.startsWith('file://') ? url.slice('file://'.length) : url;
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = raw;
    }
    return decoded.replace(/\/+$/, '') === target;
  });
}

export function dockPlistPath(domain = DOCK_DOMAIN, home = os.homedir()) {
  const base = domain.includes('/') ? domain : path.join(home, 'Library', 'Preferences', domain);
  return base.endsWith('.plist') ? base : `${base}.plist`;
}

export function readDockApps(domain = DOCK_DOMAIN, home = os.homedir()) {
  const file = dockPlistPath(domain, home);
  if (!existsSync(file)) return [];
  try {
    const json = execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], {
      encoding: 'utf8',
    });
    const data = JSON.parse(json);
    return Array.isArray(data['persistent-apps']) ? data['persistent-apps'] : [];
  } catch {
    return [];
  }
}

export async function addAppToDock({
  domain = DOCK_DOMAIN,
  appPath,
  home = os.homedir(),
  reload = true,
} = {}) {
  if (dockHasApp(readDockApps(domain, home), appPath)) return { added: false };
  await execFileAsync('/usr/bin/defaults', [
    'write',
    domain,
    'persistent-apps',
    '-array-add',
    dockEntry(appPath),
  ]);
  if (reload) {
    try {
      await execFileAsync('/usr/bin/killall', ['Dock']);
    } catch {}
  }
  return { added: true };
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[key] = 'true';
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return flags;
}

async function main(argv) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);

  switch (command) {
    case 'pick-port': {
      const port = await pickPort({
        start: Number(flags.start ?? DEFAULT_PORT_RANGE.start),
        end: Number(flags.end ?? DEFAULT_PORT_RANGE.end),
      });
      if (!port) {
        process.stderr.write('no free port in range\n');
        process.exitCode = 1;
        return;
      }
      process.stdout.write(`${port}\n`);
      return;
    }
    case 'location-check': {
      const problem = installLocationProblem(flags.app);
      if (!problem) return;
      process.stdout.write(`${problem}\n`);
      process.exitCode = EXIT_WRONG_LOCATION;
      return;
    }
    case 'dock-add': {
      const result = await addAppToDock({
        domain: flags.domain || DOCK_DOMAIN,
        appPath: flags.app,
        home: flags.home ?? os.homedir(),
        reload: flags.reload !== '0',
      });
      process.stdout.write(`${result.added ? 'added' : 'present'}\n`);
      return;
    }
    case 'setup-done': {
      writeState(flags.file, {
        setup: true,
        port: Number(flags.port),
        appPath: flags.app,
        workspacePath: flags.workspace,
        coreVersion: flags.version,
        logDir: flags.logs,
        completedAt: new Date().toISOString(),
      });
      return;
    }
    case 'state-get': {
      const state = readState(flags.file);
      const value = flags.key ? state[flags.key] : state;
      process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value ?? '')}\n`);
      return;
    }
    default: {
      process.stderr.write(
        'usage: setup.mjs <location-check|pick-port|dock-add|setup-done|state-get> [--flag value]\n',
      );
      process.exitCode = 1;
    }
  }
}

function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
