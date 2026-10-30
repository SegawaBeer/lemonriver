import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addAppToDock,
  DEFAULT_PORT_RANGE,
  dockEntry,
  dockHasApp,
  installLocationProblem,
  pickPort,
  readDockApps,
  readState,
  writeState,
} from './setup.mjs';

const tempDirs = [];

function tempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lemonriver-setup-'));
  tempDirs.push(dir);
  return dir;
}

function seedDock(dir) {
  const domain = path.join(dir, 'com.apple.dock');
  execFileSync('/usr/bin/defaults', ['write', domain, 'persistent-apps', '-array']);
  return domain;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

describe('installLocationProblem', () => {
  it('flags a copy still on the mounted disk image', () => {
    expect(installLocationProblem('/Volumes/LemonRiver/LemonRiver.app')).toBe('volume');
  });

  it('flags the temporary directory Gatekeeper runs it from', () => {
    expect(
      installLocationProblem(
        '/private/var/folders/ab/xyz/T/AppTranslocation/ABC-123/d/LemonRiver.app',
      ),
    ).toBe('translocated');
  });

  it('accepts an app that lives in Applications', () => {
    expect(installLocationProblem('/Applications/LemonRiver.app')).toBeNull();
    expect(installLocationProblem('/Users/me/Applications/LemonRiver.app')).toBeNull();
  });

  it('handles paths with spaces and trailing slashes', () => {
    expect(installLocationProblem('/Volumes/My Disk/LemonRiver.app')).toBe('volume');
    expect(installLocationProblem('/Applications/LemonRiver.app/')).toBeNull();
    expect(installLocationProblem('/Users/me/My Apps/LemonRiver.app')).toBeNull();
  });
});

describe('pickPort', () => {
  it('skips ports the probe reports as busy', async () => {
    const busy = new Set([5273, 5274]);
    const port = await pickPort({
      start: 5273,
      end: 5279,
      probe: async (candidate) => !busy.has(candidate),
    });
    expect(port).toBe(5275);
  });

  it('returns null when every port in the range is busy', async () => {
    const port = await pickPort({ start: 5273, end: 5276, probe: async () => false });
    expect(port).toBeNull();
  });

  it('picks a port that can actually be bound', async () => {
    const port = await pickPort({ start: 5280, end: 5299 });
    expect(port).toBeGreaterThanOrEqual(5280);
    expect(port).toBeLessThanOrEqual(5299);
  });

  it('defaults to the 5273-5279 range', () => {
    expect(DEFAULT_PORT_RANGE).toEqual({ start: 5273, end: 5279 });
  });
});

describe('dockHasApp', () => {
  const entry = (url) => ({ 'tile-data': { 'file-data': { _CFURLString: url } } });

  it('finds the app by its file URL', () => {
    const apps = [entry('file:///Applications/LemonRiver.app/')];
    expect(dockHasApp(apps, '/Applications/LemonRiver.app')).toBe(true);
  });

  it('finds the app when the path has spaces', () => {
    const apps = [entry('file:///Users/someone/My%20Apps/LemonRiver.app/')];
    expect(dockHasApp(apps, '/Users/someone/My Apps/LemonRiver.app')).toBe(true);
  });

  it('ignores other apps', () => {
    const apps = [entry('file:///Applications/Safari.app/')];
    expect(dockHasApp(apps, '/Applications/LemonRiver.app')).toBe(false);
  });

  it('ignores malformed entries', () => {
    expect(dockHasApp([{ 'tile-type': 'folder-tile' }, null], '/Applications/LemonRiver.app')).toBe(
      false,
    );
  });

  it('returns false for an empty Dock', () => {
    expect(dockHasApp([], '/Applications/LemonRiver.app')).toBe(false);
  });
});

describe('addAppToDock', () => {
  it('adds the app once and reports it present the second time', async () => {
    const dir = tempDir();
    const domain = seedDock(dir);
    const appPath = '/Applications/LemonRiver.app';

    const first = await addAppToDock({ domain, appPath, home: dir, reload: false });
    expect(first).toEqual({ added: true });
    expect(readDockApps(domain, dir)).toHaveLength(1);

    const second = await addAppToDock({ domain, appPath, home: dir, reload: false });
    expect(second).toEqual({ added: false });
    expect(readDockApps(domain, dir)).toHaveLength(1);
  });

  it('writes a tile that macOS can read back', async () => {
    const dir = tempDir();
    const domain = seedDock(dir);
    await addAppToDock({
      domain,
      appPath: '/Applications/LemonRiver.app',
      home: dir,
      reload: false,
    });

    const [tile] = readDockApps(domain, dir);
    expect(tile['tile-type']).toBe('file-tile');
    expect(tile['tile-data']['file-data']._CFURLString).toBe(
      'file:///Applications/LemonRiver.app/',
    );
    expect(tile['tile-data']['file-data']._CFURLStringType).toBe(15);
  });

  it('produces the same tile from dockEntry', () => {
    expect(dockEntry('/Applications/LemonRiver.app')).toContain('file-tile');
  });

  it('treats a missing Dock plist as empty', () => {
    const dir = tempDir();
    expect(readDockApps(path.join(dir, 'missing'), dir)).toEqual([]);
  });
});

describe('state file', () => {
  it('round-trips and merges patches', () => {
    const file = path.join(tempDir(), 'nested', 'state.json');
    expect(readState(file)).toEqual({});

    writeState(file, { port: 5273 });
    writeState(file, { setup: true });

    expect(readState(file)).toEqual({ port: 5273, setup: true });
  });

  it('treats a corrupt state file as empty', () => {
    const file = path.join(tempDir(), 'state.json');
    writeFileSync(file, '{not json');
    expect(readState(file)).toEqual({});
  });
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, 'setup.mjs');
const REPO = path.resolve(HERE, '../../..');
const OUT = path.join(REPO, 'installer/macos/out');
const built =
  existsSync(path.join(OUT, 'node/bin/node')) &&
  existsSync(path.join(OUT, 'workspace-template/package.json'));

// The scripts under test are the ones in this directory, not whatever a
// previous build copied into out/; only the parts a build produces are reused.
function sourceApp({ copyNode = false } = {}) {
  const app = path.join(tempDir(), 'LemonRiver.app');
  const res = path.join(app, 'Contents/Resources');
  mkdirSync(res, { recursive: true });
  for (const file of ['start.sh', 'setup.sh', 'setup.mjs']) {
    copyFileSync(path.join(HERE, file), path.join(res, file));
    chmodSync(path.join(res, file), 0o755);
  }
  if (copyNode) {
    execFileSync('/usr/bin/ditto', [path.join(OUT, 'node'), path.join(res, 'node')]);
  } else {
    symlinkSync(path.join(OUT, 'node'), path.join(res, 'node'));
  }
  symlinkSync(path.join(OUT, 'workspace-template'), path.join(res, 'workspace-template'));
  return app;
}

const startScript = (app) => path.join(app, 'Contents/Resources/start.sh');

function runCli(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function installHome() {
  const home = tempDir();
  mkdirSync(path.join(home, 'Desktop'), { recursive: true });
  execFileSync('/usr/bin/defaults', [
    'write',
    path.join(home, 'com.apple.dock'),
    'persistent-apps',
    '-array',
  ]);
  return home;
}

function startEnv(home, appPath) {
  return {
    ...process.env,
    HOME: home,
    LEMONRIVER_HOME: home,
    LEMONRIVER_APP_PATH: appPath,
    LEMONRIVER_DOCK_PLIST: path.join(home, 'com.apple.dock'),
    LEMONRIVER_RELOAD_DOCK: '0',
    LEMONRIVER_DRY_DESKTOP: '1',
    LEMONRIVER_DRY_DOCK: '1',
    LEMONRIVER_DRY_LAUNCHD: '1',
    LEMONRIVER_DRY_DIALOG: '1',
  };
}

const stateFile = (home) =>
  path.join(home, 'Library', 'Application Support', 'LemonRiver', 'state.json');

function quarantineApp(dir) {
  const value = `0083;${Math.floor(Date.now() / 1000).toString(16)};Safari;`;
  const files = execFileSync('/usr/bin/find', [dir], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  for (let i = 0; i < files.length; i += 200) {
    execFileSync('/usr/bin/xattr', [
      '-w',
      'com.apple.quarantine',
      value,
      ...files.slice(i, i + 200),
    ]);
  }
}

function quarantineCount(dir) {
  let listing = '';
  try {
    listing = execFileSync('/usr/bin/xattr', ['-lr', dir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    listing = String(err.stdout ?? '');
  }
  return listing.split('\n').filter((line) => line.includes('com.apple.quarantine')).length;
}

async function waitForPage(start, env) {
  const url = execFileSync('/bin/bash', [start, 'url'], { env, encoding: 'utf8' }).trim();
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  let status = 0;
  for (let i = 0; i < 120; i += 1) {
    try {
      status = (await fetch(url)).status;
      if (status === 200) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return status;
}

describe('state-get output', () => {
  it('prints an empty line for a file that does not exist', () => {
    const file = path.join(tempDir(), 'state.json');
    expect(runCli(['state-get', '--file', file, '--key', 'port']).trim()).toBe('');
  });

  it('prints an empty line for a key that is not stored', () => {
    const file = path.join(tempDir(), 'state.json');
    writeState(file, { port: 5273 });
    expect(runCli(['state-get', '--file', file, '--key', 'workspacePath']).trim()).toBe('');
    expect(runCli(['state-get', '--file', file, '--key', 'port']).trim()).toBe('5273');
  });
});

describe('start.sh on a machine with nothing installed', () => {
  it.skipIf(!built)(
    'runs first-time setup, serves the page, and stops',
    async () => {
      const app = sourceApp();
      const start = startScript(app);
      const home = installHome();
      const env = startEnv(home, app);

      execFileSync('/bin/bash', [start, 'ensure'], { env, stdio: 'pipe', timeout: 240000 });

      const state = JSON.parse(readFileSync(stateFile(home), 'utf8'));
      expect(state.setup).toBe(true);
      expect(existsSync(path.join(home, 'LemonRiver', 'package.json'))).toBe(true);

      expect(await waitForPage(start, env)).toBe(200);

      execFileSync('/bin/bash', [start, 'stop'], { env, stdio: 'pipe' });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const after = execFileSync('/bin/bash', [start, 'status'], { env, encoding: 'utf8' });
      expect(after.trim()).toBe('stopped');
    },
    300000,
  );

  it.skipIf(!built)('refuses when the app is still on the disk image', () => {
    const app = sourceApp();
    const home = installHome();
    const env = startEnv(home, '/Volumes/LemonRiver/LemonRiver.app');

    let code = 0;
    try {
      execFileSync('/bin/bash', [startScript(app), 'ensure'], {
        env,
        stdio: 'pipe',
        timeout: 60000,
      });
    } catch (err) {
      code = err.status;
    }

    expect(code).toBe(78);
    expect(existsSync(path.join(home, 'LemonRiver'))).toBe(false);
    expect(existsSync(stateFile(home))).toBe(false);
  });

  it('refuses the disk image without running the bundled node at all', () => {
    const app = path.join(tempDir(), 'LemonRiver.app');
    const res = path.join(app, 'Contents/Resources');
    mkdirSync(path.join(res, 'node/bin'), { recursive: true });
    copyFileSync(path.join(HERE, 'start.sh'), path.join(res, 'start.sh'));
    chmodSync(path.join(res, 'start.sh'), 0o755);

    // A node that hangs and leaves a trace: the guard has to come before it.
    const ran = path.join(tempDir(), 'node-ran');
    writeFileSync(path.join(res, 'node/bin/node'), `#!/bin/sh\necho "$@" > '${ran}'\nsleep 30\n`);
    chmodSync(path.join(res, 'node/bin/node'), 0o755);

    const home = installHome();
    const env = startEnv(home, '/Volumes/LemonRiver/LemonRiver.app');
    const start = path.join(res, 'start.sh');

    let code = 0;
    let stderr = '';
    const started = Date.now();
    try {
      execFileSync('/bin/bash', [start, 'ensure'], { env, stdio: 'pipe', timeout: 5000 });
    } catch (err) {
      code = err.status;
      stderr = String(err.stderr ?? '');
    }

    expect(Date.now() - started).toBeLessThan(5000);
    expect(code).toBe(78);
    expect(stderr).toContain('应用程序');
    expect(existsSync(ran)).toBe(false);
    expect(existsSync(path.join(home, 'LemonRiver'))).toBe(false);
    expect(existsSync(stateFile(home))).toBe(false);
    expect(execFileSync('/bin/bash', [start, 'status'], { env, encoding: 'utf8' }).trim()).toBe(
      'stopped',
    );
  });

  it.skipIf(!built)(
    'starts an app that still carries the download flags, and clears them',
    async () => {
      const app = sourceApp({ copyNode: true });
      const start = startScript(app);
      quarantineApp(app);
      expect(quarantineCount(app)).toBeGreaterThan(0);

      const home = installHome();
      const env = startEnv(home, app);

      execFileSync('/bin/bash', [start, 'ensure'], { env, stdio: 'pipe', timeout: 240000 });

      expect(await waitForPage(start, env)).toBe(200);
      expect(quarantineCount(app)).toBe(0);

      execFileSync('/bin/bash', [start, 'stop'], { env, stdio: 'pipe' });
    },
    300000,
  );
});
