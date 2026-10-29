import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ProviderEvent } from '../../../agent/provider.ts';
import { createClaudeMapper } from '../../../agent/providers/claude.ts';
import { createProviders } from '../../../agent/providers/index.ts';
import { agentStatus } from '../../../agent/status.ts';
import { createCompatibleProvider, withQuestions } from './compatible.ts';
import { findCommand } from './detect.ts';
import { connectableIds, isListedProvider, providerCatalog } from './index.ts';
import { readEnabledProviders, sanitizeEnabled, writeEnabledProviders } from './store.ts';
import { createWorkBuddyProvider, parseWorkBuddySettings } from './workbuddy.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, '__fixtures__', 'codebuddy-stream.jsonl');
const CWD = '/ws/project';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lr-providers-'));
}

describe('findCommand', () => {
  it('prefers the app bundle the desktop release ships', () => {
    const dir = tempDir();
    const bundled = path.join(dir, 'codebuddy');
    fs.writeFileSync(bundled, '#!/bin/sh\n');
    expect(findCommand([bundled], 'codebuddy', { PATH: dir })).toBe(bundled);
  });

  it('falls back to PATH, and reports nothing when neither has it', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'codebuddy'), '#!/bin/sh\n');
    expect(findCommand([], 'codebuddy', { PATH: dir })).toBe(path.join(dir, 'codebuddy'));
    expect(findCommand([], 'codebuddy', { PATH: tempDir() })).toBeNull();
  });
});

describe('enabled providers store', () => {
  it('round-trips the switched-on list', async () => {
    const dir = tempDir();
    expect([...(await readEnabledProviders(dir))]).toEqual([]);
    expect(await writeEnabledProviders(dir, ['workbuddy'])).toEqual(['workbuddy']);
    expect([...(await readEnabledProviders(dir))]).toEqual(['workbuddy']);
  });

  it('keeps only known ids, once each', () => {
    expect(sanitizeEnabled(['workbuddy', 'workbuddy', 'claude', 42, 'nope'])).toEqual([
      'workbuddy',
    ]);
  });
});

describe('provider catalog', () => {
  it('lists the two built-ins plus our two, with DuMate marked uncallable', () => {
    const rows = providerCatalog();
    expect(rows.map((r) => r.id)).toEqual(['claude', 'codex', 'workbuddy', 'dumate']);
    expect(rows[0].builtin).toBe(true);
    const dumate = rows.find((r) => r.id === 'dumate');
    expect(dumate?.connectable).toBe(false);
    expect(dumate?.reason).toBe('desktop-only');
  });

  it('refuses to switch on what is not detected or not callable', () => {
    const rows = [
      {
        id: 'workbuddy',
        name: 'WorkBuddy',
        builtin: false,
        detected: false,
        connectable: true,
        reason: null,
      },
      {
        id: 'dumate',
        name: 'DuMate',
        builtin: false,
        detected: true,
        connectable: false,
        reason: 'desktop-only',
      },
    ] as Parameters<typeof connectableIds>[0];
    expect(connectableIds(rows, ['workbuddy'])).toEqual([]);
    expect(connectableIds(rows, ['dumate'])).toEqual([]);
    expect(connectableIds([{ ...rows[0], detected: true }], ['workbuddy'])).toEqual(['workbuddy']);
  });

  it('keeps add-on providers out of the status list until they are switched on', async () => {
    const dir = tempDir();
    const provider = createProviders().workbuddy;
    expect(isListedProvider(provider, new Set())).toBe(false);
    expect(isListedProvider(provider, new Set(['workbuddy']))).toBe(true);

    const off = await agentStatus(dir, createProviders(), 'pnpm');
    expect(off.providers.map((p) => p.id)).toEqual(['claude', 'codex']);

    const on = await agentStatus(dir, createProviders(), 'pnpm', new Set(['workbuddy']));
    const ids = on.providers.map((p) => p.id);
    // Listed once it is on, whether or not this machine has the CLI.
    expect(ids.slice(0, 2)).toEqual(['claude', 'codex']);
    expect(ids.includes('workbuddy')).toBe(createWorkBuddyProvider().resolveCommand() !== null);
  });
});

describe('workbuddy settings', () => {
  it('reads the CLI model, and falls back to the follow-the-client row', () => {
    expect(parseWorkBuddySettings({ model: 'glm-5.1' })).toEqual({
      model: 'glm-5.1',
      label: 'glm-5.1',
      effort: null,
    });
    expect(parseWorkBuddySettings({})).toEqual({ model: null, label: null, effort: null });
    expect(parseWorkBuddySettings(null)).toEqual({ model: null, label: null, effort: null });
  });
});

function collect() {
  const events: ProviderEvent[] = [];
  const mapper = createClaudeMapper(
    withQuestions((e) => events.push(e)),
    CWD,
  );
  return { events, mapper };
}

describe('codebuddy stream', () => {
  const frames = fs
    .readFileSync(FIXTURE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

  it('turns a recorded turn into session, text, error and result events', () => {
    const { events, mapper } = collect();
    for (const frame of frames) mapper.handle(frame as never);

    expect(events[0]).toEqual({ type: 'session-id', id: expect.any(String) });
    expect(events.some((e) => e.type === 'text-start')).toBe(true);
    const text = events.find((e) => e.type === 'text-end');
    expect(text).toEqual({
      type: 'text-end',
      id: expect.any(String),
      text: 'Authentication required. Please use /login command to sign in to your account',
    });
    const error = events.find((e) => e.type === 'error');
    expect(error && 'text' in error ? error.text : '').toContain('Authentication required');
    expect(events.at(-1)?.type).toBe('result');
  });

  it('reports tool calls the way the panel lists them', () => {
    const { events, mapper } = collect();
    mapper.handle({
      type: 'assistant',
      uuid: 'a-1',
      parent_tool_use_id: null,
      message: {
        content: [
          { type: 'text', text: 'Editing the cover.' },
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'Edit',
            input: { file_path: `${CWD}/slides/deck/index.tsx` },
          },
        ],
      },
    } as never);

    expect(events).toContainEqual({
      type: 'tool-start',
      id: 'tool-1',
      name: 'Edit',
      title: 'Edit',
      detail: 'slides/deck/index.tsx',
    });

    mapper.handle({
      type: 'user',
      uuid: 'u-1',
      parent_tool_use_id: null,
      message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1' }] },
    } as never);
    expect(events).toContainEqual({ type: 'tool-end', id: 'tool-1', ok: true });
  });

  it('lifts a tagged question block out of the reply', () => {
    const { events, mapper } = collect();
    const block = JSON.stringify([
      {
        header: 'Pages',
        question: 'How many pages?',
        multiSelect: false,
        options: [{ label: '6-10' }, { label: '12+' }],
      },
    ]);
    mapper.handle({
      type: 'assistant',
      uuid: 'a-2',
      parent_tool_use_id: null,
      message: {
        content: [
          {
            type: 'text',
            text: `Drafting now.\n<open-slide-questions>${block}</open-slide-questions>`,
          },
        ],
      },
    } as never);

    const text = events.find((e) => e.type === 'text-end');
    expect(text && 'text' in text ? text.text : '').toBe('Drafting now.');
    const asked = events.find((e) => e.type === 'questions');
    expect(asked && 'questions' in asked ? asked.questions[0].question : '').toBe(
      'How many pages?',
    );
  });
});

describe('compatible provider', () => {
  it('reports the SDK it drives and detects its command at call time', () => {
    const provider = createCompatibleProvider({
      id: 'workbuddy',
      name: 'WorkBuddy',
      command: 'codebuddy-does-not-exist',
      fixedPaths: [],
      models: async () => [],
    });
    expect(provider.sdkPackage).toBe('@anthropic-ai/claude-agent-sdk');
    expect(provider.resolveCommand()).toBeNull();
    expect(provider.canRewind).toBe(false);
  });
});
