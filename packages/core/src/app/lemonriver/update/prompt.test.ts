import { describe, expect, it } from 'vitest';
import {
  promptsOnPage,
  readSnooze,
  SNOOZE_KEY,
  SNOOZE_MS,
  type Snooze,
  saveSnooze,
  shouldPrompt,
  type UpdateCheck,
} from './prompt';

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

const outdated: UpdateCheck = { current: '0.3.0', latest: '9.9.9', outdated: true };

describe('shouldPrompt', () => {
  it('stays quiet without an update', () => {
    expect(shouldPrompt(null, null, 0)).toBe(false);
    expect(shouldPrompt({ ...outdated, outdated: false }, null, 0)).toBe(false);
    expect(shouldPrompt({ ...outdated, latest: null }, null, 0)).toBe(false);
  });

  it('prompts for an outdated version with no snooze', () => {
    expect(shouldPrompt(outdated, null, 0)).toBe(true);
  });

  it('respects a snooze on the same version until it expires', () => {
    const snooze: Snooze = { version: '9.9.9', until: 1000 };
    expect(shouldPrompt(outdated, snooze, 999)).toBe(false);
    expect(shouldPrompt(outdated, snooze, 1000)).toBe(true);
  });

  it('prompts again as soon as a newer version ships', () => {
    const snooze: Snooze = { version: '9.9.9', until: 1000 };
    expect(shouldPrompt({ ...outdated, latest: '9.9.10' }, snooze, 0)).toBe(true);
  });
});

describe('snooze storage', () => {
  it('round-trips the version and its deadline', () => {
    const storage = memoryStorage();
    saveSnooze(storage, '9.9.9', 5000);
    expect(readSnooze(storage)).toEqual({ version: '9.9.9', until: 5000 + SNOOZE_MS });
  });

  it('ignores anything it did not write', () => {
    const storage = memoryStorage();
    storage.setItem(SNOOZE_KEY, 'not json');
    expect(readSnooze(storage)).toBeNull();
    storage.setItem(SNOOZE_KEY, '{"version":"9.9.9"}');
    expect(readSnooze(storage)).toBeNull();
    storage.setItem(SNOOZE_KEY, '{"version":9,"until":1}');
    expect(readSnooze(storage)).toBeNull();
    storage.setItem(SNOOZE_KEY, '{"version":"9.9.9","until":"soon"}');
    expect(readSnooze(storage)).toBeNull();
  });
});

describe('promptsOnPage', () => {
  it('asks on the pages people read and stays off the captures', () => {
    expect(promptsOnPage('/')).toBe(true);
    expect(promptsOnPage('/s/alpha')).toBe(true);
    expect(promptsOnPage('/trash')).toBe(true);
    expect(promptsOnPage('/s/alpha/preview')).toBe(false);
    expect(promptsOnPage('/s/alpha/presenter')).toBe(false);
  });
});
