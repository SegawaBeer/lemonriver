import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/agent/use-agent', () => ({ requestAgent: vi.fn(), useAgentState: vi.fn() }));

import { saveBrief, takeBrief } from './brief';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe('new-deck brief', () => {
  it('is handed over once', () => {
    const storage = memoryStorage();
    saveBrief('  A talk on expenses  ', storage);
    expect(takeBrief(storage)).toBe('A talk on expenses');
    expect(takeBrief(storage)).toBeNull();
  });

  it('treats a blank brief as none', () => {
    const storage = memoryStorage();
    saveBrief('   ', storage);
    expect(takeBrief(storage)).toBeNull();
  });
});
