import { describe, expect, it } from 'vitest';
import { applyPrompt, type PromptPage } from './apply-prompt.ts';
import type { Placement, Spot } from './changes.ts';
import type { Restructure } from './restructure.ts';

const PAGES: PromptPage[] = [
  { key: 'a', n: 1, title: 'Cover' },
  { key: 'b', n: 2, title: 'Ask' },
  { key: 'c', n: 3, title: '' },
];

const spot = (page: string, before: string | null = null, beforeInfo?: Spot['beforeInfo']): Spot =>
  beforeInfo ? { page, before, beforeInfo } : { page, before };

const move = (to: Spot | 'parked', extra: Partial<Placement> = {}): Placement => ({
  origin: { page: 'a', before: null, block: 'x' },
  block: { kind: 'chart', text: 'Revenue by quarter', loc: null },
  to,
  ...extra,
});

function prompt(changes: Placement[], restructures: Restructure[] = []): string {
  return applyPrompt({ slideId: 'deck', pages: PAGES, changes, restructures });
}

const lines = (changes: Placement[], restructures: Restructure[] = []): string[] =>
  prompt(changes, restructures).split('\n');

describe('applyPrompt', () => {
  it('opens with the file and the one rule, and closes with the speaker notes', () => {
    const text = prompt([]);
    expect(text.startsWith('Rearrange the deck slides/deck/index.tsx as listed below.')).toBe(true);
    expect(text).toContain('keep every other page, the wording, the styles and the speaker notes');
    expect(text.endsWith('reply with one short sentence saying what changed.')).toBe(true);
  });

  it('names the block, both pages and the block it goes before', () => {
    const [line] = lines([
      move(spot('c', 'y', { kind: 'point', text: 'Margins held', loc: null })),
    ]).slice(1);
    expect(line).toBe(
      'Move the chart "Revenue by quarter" from page 1 "Cover" to page 3, before the point "Margins held".',
    );
  });

  it('says where a block at the end goes', () => {
    const [line] = lines([move(spot('b'))]).slice(1);
    expect(line).toBe(
      'Move the chart "Revenue by quarter" from page 1 "Cover" to page 2 "Ask", at the end.',
    );
  });

  it('removes a block the user set aside', () => {
    const [line] = lines([move('parked')]).slice(1);
    expect(line).toBe('Remove the chart "Revenue by quarter" from page 1 "Cover".');
  });

  it('hands back the code of a block coming out of the holding area', () => {
    const text = prompt([
      move(spot('b', 'y', { kind: 'point', text: 'Ask first', loc: null }), {
        fromParking: true,
        code: '<p>Saved</p>',
      }),
    ]);
    expect(text).toContain(
      'Add this block to page 2 "Ask", before the point "Ask first". Its code, taken from the deck before it was set aside:',
    );
    expect(text).toContain('```tsx\n<p>Saved</p>\n```');
  });

  it('splits a page by the blocks that leave it', () => {
    const [line] = lines(
      [],
      [
        {
          kind: 'split',
          page: 'c',
          blocks: ['t', 'p'],
          blockInfo: [
            { id: 't', kind: 'title', text: 'Plan' },
            { id: 'p', kind: 'point', text: 'Costs' },
          ],
        },
      ],
    ).slice(1);
    expect(line).toBe(
      'Split page 3: move the title "Plan" and the point "Costs" onto a new page right after it.',
    );
  });

  it('merges a page into the one before it', () => {
    const [line] = lines([], [{ kind: 'merge', pages: ['b', 'c'] }]).slice(1);
    expect(line).toBe(
      'Merge page 3 into page 2 "Ask": put the content of page 3 at the end of page 2 and remove page 3.',
    );
  });

  it('names a block that has no words of its own by its kind', () => {
    const [line] = lines([
      move(spot('b'), { block: { kind: 'image', text: '', loc: '9:4' } }),
    ]).slice(1);
    expect(line).toBe('Move the image from page 1 "Cover" to page 2 "Ask", at the end.');
  });

  it('skips a change whose page is no longer in the deck', () => {
    const text = prompt([
      {
        origin: { page: 'gone', before: null, block: 'x' },
        block: { kind: 'text', text: 'Old', loc: null },
        to: spot('b'),
      },
      {
        origin: { page: 'a', before: null, block: 'z' },
        block: { kind: 'text', text: 'Still here', loc: null },
        to: 'parked',
      },
    ]);
    expect(text).not.toContain('Old');
    expect(text).toContain('Still here');
  });
});
