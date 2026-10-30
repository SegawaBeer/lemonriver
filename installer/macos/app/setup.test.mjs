import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addAppToDock,
  DEFAULT_PORT_RANGE,
  dockEntry,
  dockHasApp,
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
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
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
