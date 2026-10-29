import { describe, expect, it } from 'vitest';
import {
  BRAND_PATH_SOURCE,
  isBrandPage,
  lemonRiverViewFor,
  PREVIEW_PATH_SOURCE,
  pageForPath,
  SETTINGS_VIEW_ID,
  TRASH_VIEW_ID,
} from './pages';

const PATHS = [
  '/',
  '/themes',
  '/themes/',
  '/themes/plain',
  '/assets',
  '/settings',
  '/trash',
  '/trash/',
  '/s/alpha',
  '/s/alpha/',
  '/s/alpha/board',
  '/s/alpha/presenter',
  '/s/alpha/preview',
  '/settings/x',
  '/assetsx',
  '/nope',
];

describe('pageForPath', () => {
  it('names each route', () => {
    expect(pageForPath('/')).toBe('home');
    expect(pageForPath('/themes/plain')).toBe('themes');
    expect(pageForPath('/trash/')).toBe('trash');
    expect(pageForPath('/s/alpha')).toBe('editor');
    expect(pageForPath('/s/alpha/board')).toBe('board');
    expect(pageForPath('/s/alpha/presenter')).toBe('presenter');
    expect(pageForPath('/s/alpha/preview')).toBe('preview');
    expect(pageForPath('/settings/x')).toBe('other');
  });

  it('keeps the editor and present views out of the lime theme', () => {
    for (const path of ['/s/alpha', '/s/alpha/board', '/s/alpha/presenter', '/s/alpha/preview']) {
      expect(isBrandPage(pageForPath(path)), path).toBe(false);
    }
  });

  it('matches the pre-paint patterns for every path', () => {
    const brand = new RegExp(BRAND_PATH_SOURCE);
    const preview = new RegExp(PREVIEW_PATH_SOURCE);
    for (const path of PATHS) {
      expect(brand.test(path), path).toBe(isBrandPage(pageForPath(path)));
      expect(preview.test(path), path).toBe(pageForPath(path) === 'preview');
    }
  });
});

describe('lemonRiverViewFor', () => {
  it('selects our sidebar rows on our pages only', () => {
    expect(lemonRiverViewFor('/settings')).toBe(SETTINGS_VIEW_ID);
    expect(lemonRiverViewFor('/trash/')).toBe(TRASH_VIEW_ID);
    expect(lemonRiverViewFor('/')).toBeNull();
    expect(lemonRiverViewFor('/themes')).toBeNull();
  });
});
