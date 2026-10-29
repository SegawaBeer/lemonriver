import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentModelOption } from '../../agent/types.ts';
import { NO_CLIENT_SETTINGS } from './client-settings.ts';
import {
  cacheClaudeModels,
  cachedClaudeModels,
  convertSupportedModels,
  resetClaudeModelsCache,
  withClientModel,
} from './model-list.ts';

afterEach(() => {
  resetClaudeModelsCache();
  vi.useRealTimers();
});

const LIST = [
  {
    value: 'opus',
    displayName: 'Opus 4.8',
    supportsEffort: true,
    supportedEffortLevels: ['high', 'xhigh'],
  },
  { value: 'haiku', displayName: 'Haiku', supportsEffort: false },
];

describe('convertSupportedModels', () => {
  it('keeps the values, display names and effort levels the SDK reports', () => {
    expect(convertSupportedModels(LIST)).toEqual([
      { id: 'opus', label: 'Opus 4.8', efforts: ['high', 'xhigh'] },
      { id: 'haiku', label: 'Haiku', efforts: [] },
    ]);
  });

  it('falls back to the alias list when a model only says it supports effort', () => {
    expect(convertSupportedModels([{ value: 'sonnet', displayName: 'Sonnet' }])).toEqual([
      { id: 'sonnet', label: 'Sonnet', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
    ]);
  });

  it('ignores entries that carry no model value', () => {
    expect(convertSupportedModels([{ displayName: 'Nope' }, null, 3])).toEqual([]);
  });
});

describe('the cached Claude list', () => {
  it('stores what the query answers and expires it after ten minutes', async () => {
    const ask = vi.fn(async () => LIST);
    cacheClaudeModels({ supportedModels: ask });
    await vi.waitFor(() => expect(cachedClaudeModels()).not.toBeNull());
    expect(cachedClaudeModels()?.map((m) => m.id)).toEqual(['opus', 'haiku']);

    const later = Date.now() + 11 * 60 * 1000;
    expect(cachedClaudeModels(later)).toBeNull();
  });

  it('stays empty when the query fails or cannot answer', async () => {
    cacheClaudeModels({
      supportedModels: async () => {
        throw new Error('no');
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(cachedClaudeModels()).toBeNull();

    cacheClaudeModels({});
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(cachedClaudeModels()).toBeNull();
  });
});

describe('withClientModel', () => {
  it('puts the model named in the client config first', () => {
    expect(
      withClientModel(
        [{ id: 'gpt-5.6-sol-x', label: 'Sol X', efforts: [] }],
        { model: 'gpt-5.6-sol', label: 'gpt-5.6-sol', effort: 'medium' },
        ['low', 'medium', 'high'],
      ),
    ).toEqual([
      { id: 'gpt-5.6-sol', label: 'gpt-5.6-sol', efforts: ['low', 'medium', 'high'] },
      { id: 'gpt-5.6-sol-x', label: 'Sol X', efforts: [] },
    ]);
  });

  it('drops the bare default row the cache substitutes for nothing', () => {
    expect(
      withClientModel([{ id: '', label: 'Default', efforts: [] }], NO_CLIENT_SETTINGS, []),
    ).toEqual([]);
  });

  it('keeps the cache entry when it already lists that model', () => {
    const models: AgentModelOption[] = [{ id: 'gpt-5.6-sol', label: 'Sol', efforts: ['high'] }];
    expect(
      withClientModel(models.slice(), { model: 'gpt-5.6-sol', label: 'Sol', effort: null }, []),
    ).toEqual([{ id: 'gpt-5.6-sol', label: 'Sol', efforts: ['high'] }]);
  });
});
