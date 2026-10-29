import { describe, expect, it } from 'vitest';
import {
  type AgentPrefs,
  DEFAULT_PREFS,
  PREFS_KEY,
  prefsLines,
  readPrefs,
  sanitizePrefs,
  savePrefs,
  toneForUses,
} from './prefs';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('sanitizePrefs', () => {
  it('returns the defaults for anything that is not an object', () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs('dense')).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs(['dense'])).toEqual(DEFAULT_PREFS);
  });

  it('keeps the values it knows', () => {
    const prefs: AgentPrefs = {
      confirmEachPage: true,
      askOnMismatch: false,
      autoImages: false,
      tone: 'concise',
      research: 'web',
      outline: 'direct',
      design: 'dense',
      review: 'numbers',
    };
    expect(sanitizePrefs(prefs)).toEqual(prefs);
  });

  it('replaces the values it does not know with the defaults', () => {
    expect(
      sanitizePrefs({
        confirmEachPage: 'yes',
        askOnMismatch: 0,
        autoImages: null,
        tone: 'shouty',
        research: 'library',
        outline: 'auto',
        design: 'sparse',
        review: 'loose',
      }),
    ).toEqual(DEFAULT_PREFS);
  });

  it('fills a partial record', () => {
    expect(sanitizePrefs({ design: 'visual' })).toEqual({ ...DEFAULT_PREFS, design: 'visual' });
  });
});

describe('readPrefs and savePrefs', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const prefs: AgentPrefs = { ...DEFAULT_PREFS, tone: 'friendly', confirmEachPage: true };
    savePrefs(storage, prefs);
    expect(storage.getItem(PREFS_KEY)).toBe(JSON.stringify(prefs));
    expect(readPrefs(storage)).toEqual(prefs);
  });

  it('falls back to the defaults on junk or a missing key', () => {
    expect(readPrefs(memoryStorage())).toEqual(DEFAULT_PREFS);
    expect(readPrefs(memoryStorage({ [PREFS_KEY]: 'not json' }))).toEqual(DEFAULT_PREFS);
    expect(readPrefs(memoryStorage({ [PREFS_KEY]: '{"tone":"loud"}' }))).toEqual(DEFAULT_PREFS);
  });

  it('swallows a storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(readPrefs(broken)).toEqual(DEFAULT_PREFS);
    expect(() => savePrefs(broken, DEFAULT_PREFS)).not.toThrow();
  });
});

describe('prefsLines', () => {
  const prefs = (patch: Partial<AgentPrefs> = {}): AgentPrefs => ({ ...DEFAULT_PREFS, ...patch });

  it('gives every step the tone', () => {
    for (const step of ['outline', 'page', 'review'] as const) {
      expect(prefsLines(prefs(), step)[0]).toBe('Write in a steady, professional tone.');
    }
    expect(prefsLines(prefs({ tone: 'friendly' }), 'page')[0]).toBe(
      'Write in a light, friendly tone.',
    );
    expect(prefsLines(prefs({ tone: 'concise' }), 'review')[0]).toBe(
      'Keep the wording short and punchy.',
    );
  });

  it('tells the outline step where facts may come from', () => {
    expect(prefsLines(prefs(), 'outline')).toEqual([
      'Write in a steady, professional tone.',
      "Use only the user's reference files; do not look anything up on the web.",
    ]);
    expect(prefsLines(prefs({ research: 'web' }), 'outline')).toContain(
      'You may look up facts the files do not cover; say where each one came from.',
    );
  });

  it('tells the page step how dense to lay out and whether to use images', () => {
    expect(prefsLines(prefs(), 'page')).toEqual([
      'Write in a steady, professional tone.',
      'Balance text and visuals.',
      'Use icons and image placeholders where a picture helps; never invent photos the user did not provide.',
    ]);
    expect(prefsLines(prefs({ design: 'dense' }), 'page')).toContain(
      'A page may carry more text and data when the content needs it.',
    );
    expect(prefsLines(prefs({ autoImages: false }), 'page')).toContain(
      'Do not add any image the user did not provide.',
    );
  });

  it('tells the review step how far to check and what to do with a mismatch', () => {
    expect(prefsLines(prefs(), 'review')).toEqual([
      'Write in a steady, professional tone.',
      'Check wording, typos and every number.',
    ]);
    expect(prefsLines(prefs({ review: 'numbers' }), 'review')).toContain(
      'Check only the numbers against the reference files.',
    );
    const lenient = prefsLines(prefs({ askOnMismatch: false }), 'review');
    expect(lenient).toContain(
      'When two files disagree on a number, use the one from the spreadsheet (.xlsx, .xls or .csv) and say which you used.',
    );
  });
});

describe('toneForUses', () => {
  it('picks a tone from what the deck is for', () => {
    expect(toneForUses(['report'])).toBe('steady');
    expect(toneForUses(['pitch'])).toBe('steady');
    expect(toneForUses(['lecture'])).toBe('friendly');
    expect(toneForUses(['training'])).toBe('friendly');
    expect(toneForUses(['launch'])).toBe('concise');
  });

  it('lets a launch win over anything else picked with it', () => {
    expect(toneForUses(['lecture', 'launch'])).toBe('concise');
    expect(toneForUses(['report', 'training'])).toBe('friendly');
  });

  it('changes nothing for other or an empty pick', () => {
    expect(toneForUses([])).toBeNull();
    expect(toneForUses(['other'])).toBeNull();
  });
});
