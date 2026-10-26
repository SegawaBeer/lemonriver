import { describe, expect, it } from 'vitest';
import { en } from './en';
import { es } from './es';
import { ja } from './ja';
import { zhCN } from './zh-cn';
import { zhTW } from './zh-tw';

const LANGS = { en, es, ja, zhCN, zhTW };

describe('LemonRiver board text', () => {
  it('has the same keys in every language as English', () => {
    const english = Object.keys(en.board).sort();
    for (const [name, text] of Object.entries(LANGS)) {
      expect(Object.keys(text.board).sort(), name).toEqual(english);
    }
  });

  it('has no empty strings', () => {
    for (const [name, text] of Object.entries(LANGS)) {
      for (const [key, value] of Object.entries(text.board)) {
        expect(value, `${name}.${key}`).not.toBe('');
      }
    }
  });
});
