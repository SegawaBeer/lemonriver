import { describe, expect, it } from 'vitest';
import {
  chapterPlanPrompt,
  chapterWritePrompt,
  pageTaskPrompt,
  parseChapterBlock,
  sanitizeTask,
  stripChapterBlock,
} from './agent-tasks.ts';

const page = { n: 3, title: 'Revenue by quarter' };

describe('pageTaskPrompt', () => {
  const prompt = (action: 'rewrite' | 'chart' | 'memo' | 'expand', memo?: string) =>
    pageTaskPrompt({ slideId: 'deck', page: { ...page, memo }, action, lang: 'en' });

  it('names only the page it works on', () => {
    expect(prompt('rewrite')).toContain(
      'Work on page 3 "Revenue by quarter" of slides/deck/index.tsx only. Leave every other page, the theme and the speaker notes of other pages as they are.',
    );
    expect(prompt('rewrite')).toContain(
      'Rewrite this page: keep what it says, make it clearer and better laid out.',
    );
  });

  it('asks for a chart that keeps the point', () => {
    expect(prompt('chart')).toContain(
      'Turn the main numbers on this page into a chart. Keep the title and the point it makes.',
    );
  });

  it('follows the card note', () => {
    expect(prompt('memo', 'lead with the number')).toContain(
      'Change this page as the note says: "lead with the number"',
    );
  });

  it('keeps a note’s quotes and newlines as one quoted string', () => {
    const memo = 'Say "first"\nthen stop';
    expect(prompt('memo', memo)).toContain(
      `Change this page as the note says: ${JSON.stringify(memo)}`,
    );
  });

  it('has nothing to say for a note action without a note', () => {
    expect(prompt('memo')).toBeNull();
    expect(prompt('memo', '   ')).toBeNull();
  });

  it('asks for a second page right after this one', () => {
    expect(prompt('expand')).toContain(
      'Expand this page into two pages: keep this one, and add one more right after it that goes deeper. Add a speaker note for the new page.',
    );
  });

  it('ends with the language and one sentence back', () => {
    expect(
      prompt('rewrite')?.endsWith(
        'Write in the language "en". When you are done, reply with one short sentence saying what changed.',
      ),
    ).toBe(true);
  });

  it('leaves out the quotes when the page has no title', () => {
    expect(
      pageTaskPrompt({ slideId: 'd', page: { n: 2, title: '' }, action: 'rewrite', lang: 'en' }),
    ).toContain('Work on page 2 of slides/d/index.tsx only.');
  });
});

describe('chapterPlanPrompt', () => {
  it('plans without writing, and says what the chapter has', () => {
    const prompt = chapterPlanPrompt({
      slideId: 'deck',
      chapter: 1,
      title: 'Why now',
      brief: 'the market moved',
      count: 3,
      pages: [
        { n: 4, title: 'The shift' },
        { n: 5, title: '' },
      ],
      lang: 'zh-CN',
    });
    expect(prompt).toContain(
      'Plan new pages for chapter 2 "Why now" of slides/deck/index.tsx. This turn is planning only: do not write, edit or create any file.',
    );
    expect(prompt).toContain('The chapter should cover: the market moved');
    expect(prompt).toContain('It has these pages now: page 4 "The shift", page 5.');
    expect(prompt).toContain('Plan 3 new pages that come after them.');
    expect(prompt).toContain('<lemonriver-chapter> and </lemonriver-chapter>');
    expect(prompt).toContain('Write in the language "zh-CN".');
  });

  it('says so when the chapter is empty', () => {
    const prompt = chapterPlanPrompt({
      slideId: 'deck',
      chapter: 0,
      title: '',
      brief: 'open',
      count: 1,
      pages: [],
      lang: 'en',
    });
    expect(prompt).toContain('It has no pages yet.');
  });
});

describe('chapterWritePrompt', () => {
  const items = [
    { id: 'a', title: 'First', kind: 'page' as const },
    { id: 'b', title: 'Second', kind: 'chart' as const },
  ];

  it('places the pages after one page', () => {
    const prompt = chapterWritePrompt({
      slideId: 'deck',
      chapter: 1,
      title: 'Why now',
      items,
      anchor: { n: 4, title: 'The shift' },
      lang: 'en',
    });
    expect(prompt).toContain(
      'Add these pages to chapter 2 "Why now" of slides/deck/index.tsx, right after page 4 "The shift".',
    );
    expect(prompt).toContain('1. "First" (page)');
    expect(prompt).toContain('2. "Second" (chart)');
    expect(prompt).toContain(
      "Follow the deck's existing theme and layout. Add a speaker note for each new page. Do not change any other page.",
    );
  });

  it('places them at the very start when there is nothing in front', () => {
    const prompt = chapterWritePrompt({
      slideId: 'deck',
      chapter: 0,
      title: '',
      items,
      anchor: null,
      lang: 'en',
    });
    expect(prompt).toContain('of slides/deck/index.tsx, at the start of the deck.');
  });
});

describe('chapter block', () => {
  const block = (items: unknown) =>
    `Planned.\n<lemonriver-chapter>${JSON.stringify(items)}</lemonriver-chapter>`;

  it('reads the titles the agent planned', () => {
    expect(parseChapterBlock(block([{ title: 'A', kind: 'page' }]))?.map((i) => i.title)).toEqual([
      'A',
    ]);
  });

  it('takes the last block, so a retried answer wins', () => {
    const text = `${block([{ title: 'Old', kind: 'page' }])}\n${block([
      { title: 'New', kind: 'page' },
    ])}`;
    expect(parseChapterBlock(text)?.map((i) => i.title)).toEqual(['New']);
  });

  it('keeps no more than eight', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ title: `P${i}`, kind: 'page' }));
    expect(parseChapterBlock(block(items))).toHaveLength(8);
  });

  it('reads nothing when there is no block, or the block is still streaming', () => {
    expect(parseChapterBlock('no block here')).toBeNull();
    expect(parseChapterBlock('Planning… <lemonriver-chapter>[{"title":')).toBeNull();
  });

  it('takes the block out of what the transcript shows', () => {
    expect(stripChapterBlock(block([{ title: 'A', kind: 'page' }]))).toBe('Planned.');
    expect(stripChapterBlock('Planning <lemonriver-chapter>[{"ti')).toBe('Planning');
  });
});

describe('sanitizeTask', () => {
  it('reads each kind of task', () => {
    expect(sanitizeTask({ kind: 'changes' })).toEqual({ kind: 'changes' });
    expect(sanitizeTask({ kind: 'page', page: 'Two', action: 'expand' })).toEqual({
      kind: 'page',
      page: 'Two',
      action: 'expand',
    });
    expect(sanitizeTask({ kind: 'chapter-write', chapter: 1, title: 'Why now' })).toMatchObject({
      kind: 'chapter-write',
      chapter: 1,
    });
  });

  it('refuses what it cannot run', () => {
    expect(sanitizeTask(null)).toBeNull();
    expect(sanitizeTask({ kind: 'page', page: 'Two', action: 'delete' })).toBeNull();
    expect(sanitizeTask({ kind: 'chapter-plan', chapter: 0, count: 9 })).toBeNull();
    expect(sanitizeTask({ kind: 'chapter-write', chapter: -1 })).toBeNull();
  });
});
