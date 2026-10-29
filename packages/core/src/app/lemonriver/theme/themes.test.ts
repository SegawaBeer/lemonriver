import { describe, expect, it } from 'vitest';
import { isLrThemeChoice, themeClassOf } from './themes';

describe('themeClassOf', () => {
  it('keeps only the theme classes, in a stable order', () => {
    expect(themeClassOf('lime')).toBe('lime');
    expect(themeClassOf('foo dark bar')).toBe('dark');
    expect(themeClassOf('')).toBe('');
    expect(themeClassOf('lime light')).toBe('light lime');
  });
});

describe('isLrThemeChoice', () => {
  it('accepts the four choices only', () => {
    for (const v of ['system', 'light', 'dark', 'lime']) expect(isLrThemeChoice(v)).toBe(true);
    for (const v of ['fresh', '', null, 3]) expect(isLrThemeChoice(v)).toBe(false);
  });
});
