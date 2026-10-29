import { describe, expect, it } from 'vitest';
import {
  buildPrompt,
  insertPage,
  MAX_BRIEF,
  MAX_ITEMS,
  MAX_TITLE,
  movePage,
  type Outline,
  type OutlinePage,
  outlinePrompt,
  parseOutlineBlock,
  removePage,
  renamePage,
  sanitizeItems,
  sanitizeOutline,
  setKind,
  stripOutlineBlock,
} from './model';

const items: OutlinePage[] = [
  { id: 'a', title: 'Cover', kind: 'cover' },
  { id: 'b', title: 'Why now', kind: 'list' },
  { id: 'c', title: 'Numbers', kind: 'kpi' },
  { id: 'd', title: 'End', kind: 'end' },
];

const outline: Outline = {
  state: 'ready',
  brief: 'Explain the expense process',
  pages: 8,
  files: ['costs.pdf'],
  items,
  updatedAt: 1,
};

describe('sanitizeOutline', () => {
  it('keeps a well-formed outline', () => {
    expect(sanitizeOutline(outline)).toEqual(outline);
  });

  it('drops what it cannot trust', () => {
    expect(sanitizeOutline(null)).toBeNull();
    expect(sanitizeOutline('ready')).toBeNull();
    expect(sanitizeOutline({ ...outline, state: 'unknown' })).toBeNull();
  });

  it('repairs the parts it can', () => {
    const cleaned = sanitizeOutline({
      state: 'ready',
      brief: 'x'.repeat(MAX_BRIEF + 50),
      pages: 7,
      files: ['a.pdf', 3, ''],
      updatedAt: 'soon',
      items: [
        { id: 'Bad Id!', title: '  Spaced  ', kind: 'mystery' },
        { id: 'ok', title: 'y'.repeat(MAX_TITLE + 30), kind: 'chart' },
        { title: 'no id' },
        'nope',
      ],
    });
    expect(cleaned).not.toBeNull();
    if (!cleaned) return;
    expect(cleaned.brief.length).toBe(MAX_BRIEF);
    expect(cleaned.pages).toBe(8);
    expect(cleaned.files).toEqual(['a.pdf']);
    expect(cleaned.updatedAt).toBe(0);
    expect(cleaned.items).toHaveLength(3);
    expect(cleaned.items[0].title).toBe('Spaced');
    expect(cleaned.items[0].kind).toBe('page');
    expect(cleaned.items[0].id).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(cleaned.items[0].id).not.toBe('Bad Id!');
    expect(cleaned.items[1].title.length).toBe(MAX_TITLE);
    expect(cleaned.items[2].title).toBe('no id');
  });

  it('never keeps more than thirty pages', () => {
    const many = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => ({
      id: `p-${i}`,
      title: `Page ${i}`,
      kind: 'page',
    }));
    expect(sanitizeOutline({ ...outline, items: many })?.items).toHaveLength(MAX_ITEMS);
    expect(sanitizeItems(many)).toHaveLength(MAX_ITEMS);
  });
});

describe('parseOutlineBlock', () => {
  const block = (list: unknown) =>
    `Here is the plan.\n<lemonriver-outline>${JSON.stringify(list)}</lemonriver-outline>`;

  it('reads the array', () => {
    const parsed = parseOutlineBlock(
      block([
        { title: ' Opening ', kind: 'cover' },
        { title: 'Close', kind: 'end' },
      ]),
    );
    expect(parsed?.map((page) => [page.title, page.kind])).toEqual([
      ['Opening', 'cover'],
      ['Close', 'end'],
    ]);
  });

  it('takes the last block when a reply carries more than one', () => {
    const text = `${block([
      { title: 'Old one', kind: 'cover' },
      { title: 'Old two', kind: 'end' },
    ])}\n${block([
      { title: 'New one', kind: 'cover' },
      { title: 'New two', kind: 'end' },
    ])}`;
    expect(parseOutlineBlock(text)?.map((page) => page.title)).toEqual(['New one', 'New two']);
  });

  it('needs at least two pages', () => {
    expect(parseOutlineBlock(block([{ title: 'Only', kind: 'cover' }]))).toBeNull();
  });

  it('returns nothing for missing or broken blocks', () => {
    expect(parseOutlineBlock('no block here')).toBeNull();
    expect(parseOutlineBlock('<lemonriver-outline>{oops</lemonriver-outline>')).toBeNull();
    expect(parseOutlineBlock('<lemonriver-outline>{"a":1}</lemonriver-outline>')).toBeNull();
  });
});

describe('stripOutlineBlock', () => {
  it('removes the block and keeps the prose', () => {
    const text =
      'Plan ready.\n<lemonriver-outline>[{"title":"a"},{"title":"b"}]</lemonriver-outline>';
    expect(stripOutlineBlock(text)).toBe('Plan ready.');
  });

  it('also removes a block still streaming in', () => {
    expect(stripOutlineBlock('Plan ready.\n<lemonriver-outline>[{"title"')).toBe('Plan ready.');
  });
});

describe('page edits', () => {
  it('moves a page and leaves the original alone', () => {
    const moved = movePage(items, 0, 2);
    expect(moved.map((p) => p.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(items.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(movePage(items, -1, 2)).toBe(items);
    expect(movePage(items, 0, 9)).toBe(items);
  });

  it('inserts a blank page at the index', () => {
    const next = insertPage(items, 1);
    expect(next).toHaveLength(5);
    expect(next[1]).toMatchObject({ title: '', kind: 'page' });
    expect(next[1].id).not.toBe(items[0].id);
    expect(insertPage(items, 99)[4].title).toBe('');
  });

  it('refuses to delete below two pages', () => {
    const two = items.slice(0, 2);
    expect(removePage(two, 0)).toBe(two);
    expect(removePage(items, 1).map((p) => p.id)).toEqual(['a', 'c', 'd']);
  });

  it('renames and retypes one page', () => {
    expect(renamePage(items, 1, 'New title')[1].title).toBe('New title');
    expect(renamePage(items, 1, 'typing ')[1].title).toBe('typing ');
    expect(renamePage(items, 1, 'x'.repeat(MAX_TITLE + 1))[1].title.length).toBe(MAX_TITLE);
    expect(setKind(items, 2, 'chart')[2].kind).toBe('chart');
    expect(setKind(items, 9, 'chart')).toBe(items);
  });
});

describe('prompts', () => {
  it('asks for the outline only, with the files and the language', () => {
    const text = outlinePrompt(outline, 'deck-1', 'zh-CN');
    expect(text).toContain('Explain the expense process');
    expect(text).toContain('slides/deck-1/assets/');
    expect(text).toContain('costs.pdf');
    expect(text).toContain('"zh-CN"');
    expect(text).toContain('<lemonriver-outline>');
    expect(text).toContain('do not write');
  });

  it('says so when there are no files', () => {
    expect(outlinePrompt({ ...outline, files: [] }, 'deck-1', 'en')).toContain(
      'no reference files',
    );
  });

  it('hands the outline JSON back for the build', () => {
    const text = buildPrompt(outline, 'deck-1');
    expect(text).toContain('slides/deck-1/index.tsx');
    expect(text).toContain('1. [cover] Cover');
    expect(text).toContain('"title":"Numbers","kind":"kpi"');
  });
});
