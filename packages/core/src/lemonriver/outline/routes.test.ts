import { describe, expect, it } from 'vitest';
import type { Outline } from '../../app/lemonriver/outline/model.ts';
import {
  beginBuild,
  claimNextStep,
  replaceItems,
  setPaused,
  startOutline,
  undoBuild,
} from './routes.ts';

const ready: Outline = {
  state: 'ready',
  brief: 'b',
  pages: 8,
  files: [],
  items: [{ id: 'p1', title: 'One', kind: 'cover' }],
  updatedAt: 1,
  built: 0,
  paused: false,
  stage: 'pages',
  dispatched: null,
  lastTurn: null,
};

const building = (patch: Partial<Outline> = {}): Outline => ({
  ...ready,
  state: 'building',
  items: [
    { id: 'p1', title: 'One', kind: 'cover' },
    { id: 'p2', title: 'Two', kind: 'list' },
    { id: 'p3', title: 'Three', kind: 'end' },
  ],
  ...patch,
});

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
      built: 0,
      paused: false,
      stage: 'pages',
      dispatched: null,
      lastTurn: null,
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

describe('beginBuild', () => {
  it('opens a build with nothing sent yet', () => {
    expect(beginBuild({ ...ready, built: 3, paused: true, stage: 'review' }, 9)).toMatchObject({
      state: 'building',
      built: 0,
      paused: false,
      stage: 'pages',
      dispatched: null,
      lastTurn: null,
      updatedAt: 9,
    });
  });
});

describe('claimNextStep', () => {
  it('claims the page the build is on', () => {
    const claimed = claimNextStep(building({ built: 1 }), { resume: false, now: 50 });
    expect(claimed?.step).toEqual({ kind: 'page', n: 2 });
    expect(claimed?.outline.dispatched).toEqual({ kind: 'page', n: 2, at: 50 });
    expect(claimed?.outline.updatedAt).toBe(50);
  });

  it('claims the review once every page is written', () => {
    const claimed = claimNextStep(building({ built: 3, stage: 'review' }), {
      resume: false,
      now: 50,
    });
    expect(claimed?.step).toEqual({ kind: 'review' });
    expect(claimed?.outline.dispatched).toEqual({ kind: 'review', n: 0, at: 50 });
  });

  it('holds off while another tab just claimed a step', () => {
    const step = { kind: 'page' as const, n: 2, at: 40_000 };
    expect(
      claimNextStep(building({ dispatched: step }), { resume: false, now: 50_000 }),
    ).toBeNull();
    expect(
      claimNextStep(building({ dispatched: step }), { resume: false, now: 71_000 })?.step,
    ).toEqual({ kind: 'page', n: 1 });
  });

  it('stays put while paused unless the user resumes', () => {
    expect(claimNextStep(building({ paused: true }), { resume: false, now: 50 })).toBeNull();
    const resumed = claimNextStep(
      building({ paused: true, dispatched: { kind: 'page', n: 1, at: 49 } }),
      {
        resume: true,
        now: 50,
      },
    );
    expect(resumed?.outline.paused).toBe(false);
    expect(resumed?.step).toEqual({ kind: 'page', n: 1 });
  });

  it('sends nothing outside a build or after the last page without the review', () => {
    expect(claimNextStep(ready, { resume: false, now: 50 })).toBeNull();
    expect(claimNextStep(building({ built: 3 }), { resume: false, now: 50 })).toBeNull();
  });
});

describe('setPaused', () => {
  it('only touches paused', () => {
    expect(setPaused(building({ built: 2 }), true, 8)).toMatchObject({
      paused: true,
      built: 2,
      updatedAt: 8,
    });
  });
});

describe('undoBuild', () => {
  it('puts a built outline back on the outline step', () => {
    expect(undoBuild({ ...building(), state: 'built', built: 3, lastTurn: null }, 8)).toMatchObject(
      { state: 'ready', built: 0, paused: false, stage: 'pages', dispatched: null, lastTurn: null },
    );
  });

  it('does nothing before the deck is built', () => {
    expect(undoBuild(building(), 8)).toBeNull();
  });
});
