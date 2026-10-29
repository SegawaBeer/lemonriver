import { describe, expect, it } from 'vitest';
import type { Outline } from '../../app/lemonriver/outline/model.ts';
import { replaceItems, startOutline } from './routes.ts';

const ready: Outline = {
  state: 'ready',
  brief: 'b',
  pages: 8,
  files: [],
  items: [{ id: 'p1', title: 'One', kind: 'cover' }],
  updatedAt: 1,
};

describe('startOutline', () => {
  it('opens a fresh drafting outline', () => {
    expect(
      startOutline({ brief: '  tell a story  ', pages: 12, files: ['a.pdf', 2, ' '] }, 9),
    ).toEqual({
      state: 'drafting',
      brief: 'tell a story',
      pages: 12,
      files: ['a.pdf'],
      items: [],
      updatedAt: 9,
    });
  });

  it('falls back to eight pages for a size it does not offer', () => {
    expect(startOutline({ pages: 7 }, 1).pages).toBe(8);
    expect(startOutline({ pages: '12' }, 1).pages).toBe(8);
  });
});

describe('replaceItems', () => {
  it('rewrites the pages of a ready outline', () => {
    const next = replaceItems(ready, [{ title: ' New ', kind: 'nope' }, { title: 'Two' }], 5);
    expect(next?.items.map((page) => [page.title, page.kind])).toEqual([
      ['New', 'page'],
      ['Two', 'page'],
    ]);
    expect(next?.updatedAt).toBe(5);
    expect(next?.brief).toBe('b');
  });

  it('refuses while the agent owns the list', () => {
    expect(replaceItems({ ...ready, state: 'drafting' }, [], 5)).toBeNull();
    expect(replaceItems({ ...ready, state: 'building' }, [], 5)).toBeNull();
  });
});
