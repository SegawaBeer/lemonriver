import { describe, expect, it } from 'vitest';
import { format, plural } from '../../../locale/format';
import { en } from './en';
import { es } from './es';
import { ja } from './ja';
import { zhCN } from './zh-cn';
import { zhTW } from './zh-tw';

const LANGS = { en, es, ja, zhCN, zhTW };

function leaves(value: unknown, prefix = ''): [string, unknown][] {
  if (!value || typeof value !== 'object') return [[prefix, value]];
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('LemonRiver text', () => {
  it('has the same keys in every language as English', () => {
    const english = leaves(en)
      .map(([key]) => key)
      .sort();
    for (const [name, text] of Object.entries(LANGS)) {
      expect(
        leaves(text)
          .map(([key]) => key)
          .sort(),
        name,
      ).toEqual(english);
    }
  });

  it('has no empty strings', () => {
    for (const [name, text] of Object.entries(LANGS)) {
      for (const [key, value] of leaves(text)) {
        expect(typeof value, `${name}.${key}`).toBe('string');
        expect(value, `${name}.${key}`).not.toBe('');
      }
    }
  });

  it('keeps every placeholder a template declares', () => {
    const english = new Map(leaves(en));
    for (const [name, text] of Object.entries(LANGS)) {
      for (const [key, value] of leaves(text)) {
        const want =
          String(english.get(key))
            .match(/\{\w+\}/g)
            ?.sort() ?? [];
        const got =
          String(value)
            .match(/\{\w+\}/g)
            ?.sort() ?? [];
        expect(got, `${name}.${key}`).toEqual(want);
      }
    }
  });

  it('spells the build progress and pending lines out', () => {
    const cases = [
      [en, '3 of 8 pages done', 'Costs', 'Page 4 · Costs'],
      [zhCN, '已排 3 / 8 页', '成本', '第 4 页 · 成本'],
    ] as const;
    for (const [text, progress, title, pending] of cases) {
      expect(format(text.build.progress, { k: 3, n: 8 })).toBe(progress);
      expect(format(text.build.pendingPage, { k: 4, title })).toBe(pending);
      expect(format(text.build.done, { n: 8 })).not.toContain('{');
    }
  });

  it('says one file, not one files', () => {
    expect(format(plural(1, en.build.readFiles), { n: 1 })).toBe('Read 1 file');
    expect(format(plural(2, en.build.readFiles), { n: 2 })).toBe('Read 2 files');
  });
});
