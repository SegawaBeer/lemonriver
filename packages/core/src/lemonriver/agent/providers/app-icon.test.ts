import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isIconProviderId, providerIconFile, readProviderIcon } from './app-icon.ts';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lr-app-icon-'));
}

function installApp(appsDir: string, bundle: string): string {
  const resources = path.join(appsDir, `${bundle}.app`, 'Contents', 'Resources');
  fs.mkdirSync(resources, { recursive: true });
  const icns = path.join(resources, 'icon.icns');
  fs.writeFileSync(icns, 'icns-bytes');
  return icns;
}

const PNG = Buffer.from('fake-png-bytes');

describe('isIconProviderId', () => {
  it('accepts only the providers we register', () => {
    expect(isIconProviderId('workbuddy')).toBe(true);
    expect(isIconProviderId('dumate')).toBe(true);
    expect(isIconProviderId('claude')).toBe(false);
    expect(isIconProviderId('../workbuddy')).toBe(false);
    expect(isIconProviderId('../../etc/passwd')).toBe(false);
    expect(isIconProviderId('')).toBe(false);
  });
});

describe('readProviderIcon', () => {
  it('refuses an id that is not ours without touching the disk', async () => {
    const cwd = tempDir();
    let asked = false;
    const convert = async () => {
      asked = true;
    };

    expect(await readProviderIcon(cwd, '../../etc/passwd', { convert })).toBeNull();
    expect(await readProviderIcon(cwd, 'claude', { convert })).toBeNull();
    expect(asked).toBe(false);
    expect(fs.existsSync(path.join(cwd, 'node_modules'))).toBe(false);
  });

  it('returns null when the product app is not installed', async () => {
    const cwd = tempDir();
    const appsDir = tempDir();
    let asked = false;
    const convert = async () => {
      asked = true;
    };

    expect(await readProviderIcon(cwd, 'workbuddy', { appsDir, convert })).toBeNull();
    expect(asked).toBe(false);
  });

  it('converts the installed app icon and caches it', async () => {
    const cwd = tempDir();
    const appsDir = tempDir();
    const icns = installApp(appsDir, 'WorkBuddy');
    const seen: string[] = [];
    const convert = async (from: string, to: string) => {
      seen.push(from);
      fs.writeFileSync(to, PNG);
    };

    const first = await readProviderIcon(cwd, 'workbuddy', { appsDir, convert });
    expect(first?.equals(PNG)).toBe(true);
    expect(seen).toEqual([icns]);
    expect(fs.existsSync(providerIconFile(cwd, 'workbuddy'))).toBe(true);

    const second = await readProviderIcon(cwd, 'workbuddy', { appsDir, convert });
    expect(second?.equals(PNG)).toBe(true);
    expect(seen).toEqual([icns]);
  });

  it('returns null when the conversion fails', async () => {
    const cwd = tempDir();
    const appsDir = tempDir();
    installApp(appsDir, 'DuMate');

    const png = await readProviderIcon(cwd, 'dumate', {
      appsDir,
      convert: async () => {
        throw new Error('sips exploded');
      },
    });
    expect(png).toBeNull();
  });
});
