import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clientFollowOption,
  NO_CLIENT_SETTINGS,
  parseCodexConfig,
  readClientModelSettings,
} from './client-settings.ts';

const homes: string[] = [];

async function tempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lr-client-settings-'));
  homes.push(dir);
  return dir;
}

async function write(file: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}

afterEach(async () => {
  while (homes.length > 0) {
    const dir = homes.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('readClientModelSettings', () => {
  it('reads the model and effort Claude Code is set to', async () => {
    const home = await tempHome();
    await write(
      path.join(home, '.claude', 'settings.json'),
      JSON.stringify({ model: 'opus 4.8', effortLevel: 'xhigh' }),
    );
    const settings = await readClientModelSettings('claude', { home, env: {} });
    expect(settings).toEqual({ model: 'opus 4.8', label: 'Opus 4.8', effort: 'xhigh' });
  });

  it('falls back to nothing when there is no settings file', async () => {
    const home = await tempHome();
    expect(await readClientModelSettings('claude', { home, env: {} })).toEqual(NO_CLIENT_SETTINGS);
    expect(await readClientModelSettings('codex', { home, env: {} })).toEqual(NO_CLIENT_SETTINGS);
  });

  it('survives broken settings', async () => {
    const home = await tempHome();
    await write(path.join(home, '.claude', 'settings.json'), '{ not json');
    expect(await readClientModelSettings('claude', { home, env: {} })).toEqual(NO_CLIENT_SETTINGS);

    await write(
      path.join(home, '.claude', 'settings.json'),
      JSON.stringify({ model: 'sonnet', effortLevel: 'turbo' }),
    );
    expect(await readClientModelSettings('claude', { home, env: {} })).toEqual({
      model: 'sonnet',
      label: 'Sonnet',
      effort: null,
    });
  });

  it('prefers ANTHROPIC_MODEL over the settings file', async () => {
    const home = await tempHome();
    await write(
      path.join(home, '.claude', 'settings.json'),
      JSON.stringify({ model: 'opus 4.8', effortLevel: 'high' }),
    );
    const settings = await readClientModelSettings('claude', {
      home,
      env: { ANTHROPIC_MODEL: 'sonnet' },
    });
    expect(settings.model).toBe('sonnet');
    expect(settings.label).toBe('Sonnet');
    expect(settings.effort).toBe('high');
  });

  it('reads the model and effort out of the Codex config', async () => {
    const home = await tempHome();
    await write(
      path.join(home, '.codex', 'config.toml'),
      [
        'model_provider = "oneapi"',
        'model = "gpt-5.6-sol"',
        '',
        'model_reasoning_effort = "medium"',
        '',
        '[model_providers.oneapi]',
        'model = "ignored-provider-default"',
        'model_reasoning_effort = "low"',
      ].join('\n'),
    );
    expect(await readClientModelSettings('codex', { home, env: {} })).toEqual({
      model: 'gpt-5.6-sol',
      label: 'gpt-5.6-sol',
      effort: 'medium',
    });
  });
});

describe('parseCodexConfig', () => {
  it('keeps top-level values and ignores provider sections and comments', () => {
    expect(
      parseCodexConfig(
        [
          '# model = "commented-out"',
          'model = "gpt-5.6-sol" # trailing',
          'model_reasoning_effort = "high"',
          '[model_providers.x]',
          'model = "provider"',
        ].join('\n'),
      ),
    ).toEqual({ model: 'gpt-5.6-sol', effort: 'high' });
  });
});

describe('clientFollowOption', () => {
  it('falls back to the provider alias when the client says nothing', () => {
    expect(clientFollowOption(NO_CLIENT_SETTINGS, 'Opus', []).label).toBe('Opus');
    expect(clientFollowOption(NO_CLIENT_SETTINGS, 'Default', []).label).toBe('Default');
  });

  it('carries the client model and effort', () => {
    expect(
      clientFollowOption({ model: 'opus 4.8', label: 'Opus 4.8', effort: 'xhigh' }, 'Opus', []),
    ).toEqual({ id: '', label: 'Opus 4.8', efforts: [], clientEffort: 'xhigh' });
  });
});
