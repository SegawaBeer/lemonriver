import { describe, expect, it } from 'vitest';
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
});
