import { describe, expect, it } from 'vitest';
import { readBlocks, type SnapNode } from './classify.ts';

let counter = 0;

function node(tag: string, extra: Partial<SnapNode> = {}, children: SnapNode[] = []): SnapNode {
  counter += 1;
  return {
    tag,
    text: '',
    fullText: extra.fullText ?? extra.text ?? '',
    fontSize: 32,
    fontWeight: 400,
    box: { x: 0, y: counter * 10, w: 300, h: 40 },
    loc: null,
    placeholder: false,
    step: false,
    children,
    ...extra,
  };
}

function page(...children: SnapNode[]): SnapNode {
  return node('div', { box: { x: 0, y: 0, w: 1920, h: 1080 } }, children);
}

function blocksOf(...children: SnapNode[]) {
  const result = readBlocks(page(...children));
  if ('whole' in result) throw new Error(`expected blocks, got ${result.whole}`);
  return result.blocks;
}

describe('readBlocks kinds', () => {
  it('reads a heading as a title', () => {
    const [block] = blocksOf(node('h1', { text: 'Alpha page one' }));
    expect(block.kind).toBe('title');
    expect(block.text).toBe('Alpha page one');
  });

  it('reads a large text element as a title and a plain one as text', () => {
    const blocks = blocksOf(
      node('div', { text: 'Big', fontSize: 60 }),
      node('div', { text: 'Small', fontSize: 32 }),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['title', 'text']);
  });

  it('reads images and placeholders as images', () => {
    const blocks = blocksOf(node('img'), node('div', { placeholder: true }));
    expect(blocks.map((b) => b.kind)).toEqual(['image', 'image']);
  });

  it('reads a big svg as a chart but ignores a small one', () => {
    const blocks = blocksOf(
      node('svg', { box: { x: 0, y: 100, w: 400, h: 300 } }),
      node('svg', { box: { x: 500, y: 100, w: 20, h: 20 } }),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['chart']);
  });

  it('reads each list item as a point and never the list itself', () => {
    const blocks = blocksOf(
      node('ul', {}, [node('li', { text: 'One' }), node('li', { text: 'Two' })]),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['point', 'point']);
    expect(blocks.map((b) => b.text)).toEqual(['One', 'Two']);
  });

  it('reads a quote', () => {
    const [block] = blocksOf(node('blockquote', { text: 'Stay hungry' }));
    expect(block.kind).toBe('quote');
  });

  it('reads a large figure as number and a small one as text', () => {
    const blocks = blocksOf(
      node('div', { text: '$40.0M', fontSize: 50 }),
      node('div', { text: '$40.0M', fontSize: 24 }),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['number', 'text']);
  });

  it('reads a heading-sized figure as number and heading-sized words as title', () => {
    const blocks = blocksOf(
      node('div', { text: '$40.0M', fontSize: 96 }),
      node('div', { text: 'Revenue', fontSize: 96 }),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['number', 'title']);
  });

  it('reads an h2 that happens to hold a figure as a title', () => {
    const [block] = blocksOf(node('h2', { text: '$40.0M', fontSize: 96 }));
    expect(block.kind).toBe('title');
  });

  it('reads each element that carries its own text as its own block', () => {
    const blocks = blocksOf(
      node('div', {}, [node('span', { text: 'First' }), node('span', { text: 'second' })]),
    );
    expect(blocks.map((b) => b.text)).toEqual(['First', 'second']);
  });

  it('keeps the words an inline element carries', () => {
    const [block] = blocksOf(
      node(
        'p',
        {
          text: 'How we get from $28.6M to ',
          fullText: 'How we get from $28.6M to $40.0M ARR, and who does what.',
        },
        [node('span', { text: '$40.0M ARR' })],
      ),
    );
    expect(block.kind).toBe('text');
    expect(block.text).toBe('How we get from $28.6M to $40.0M ARR, and who does what.');
  });

  it('reads a heading split by line breaks as one run of words', () => {
    const [block] = blocksOf(
      node('h1', { text: 'The FY27', fullText: 'The FY27 operating plan.' }),
    );
    expect(block.kind).toBe('title');
    expect(block.text).toBe('The FY27 operating plan.');
  });

  it('gives an image or a chart no words of its own', () => {
    const blocks = blocksOf(node('img'), node('svg', { box: { x: 0, y: 100, w: 400, h: 300 } }));
    expect(blocks.map((b) => b.text)).toEqual(['', '']);
  });

  it('leaves small type on the page', () => {
    const blocks = blocksOf(
      node('div', { text: 'Fieldwork', fontSize: 12 }),
      node('div', { text: '01 / 13', fontSize: 12 }),
      node('div', { text: 'Margins held', fontSize: 32 }),
    );
    expect(blocks.map((b) => b.text)).toEqual(['Margins held']);
  });

  it('does not count small type toward the forty', () => {
    const small = Array.from({ length: 40 }, (_, i) =>
      node('div', { text: `label ${i}`, fontSize: 11 }),
    );
    const big = Array.from({ length: 40 }, (_, i) => node('div', { text: `point ${i}` }));
    expect(blocksOf(...small, ...big)).toHaveLength(40);
  });
});

describe('readBlocks structure', () => {
  it('does not read the inside of a block again', () => {
    const blocks = blocksOf(node('h1', { text: 'Title' }, [node('span', { text: 'Inner' })]));
    expect(blocks).toHaveLength(1);
  });

  it('reads top to bottom, then left to right', () => {
    const blocks = blocksOf(
      node('div', { text: 'bottom-left', box: { x: 0, y: 400, w: 100, h: 40 } }),
      node('div', { text: 'right', box: { x: 600, y: 100, w: 100, h: 40 } }),
      node('div', { text: 'left', box: { x: 0, y: 105, w: 100, h: 40 } }),
    );
    expect(blocks.map((b) => b.text)).toEqual(['left', 'right', 'bottom-left']);
  });

  it('uses the loc as the id and numbers repeats', () => {
    const blocks = blocksOf(
      node('div', { text: 'a', loc: '1:1' }),
      node('div', { text: 'b', loc: '1:1' }),
      node('div', { text: 'c', loc: '2:1' }),
    );
    expect(blocks.map((b) => b.id)).toEqual(['1:1', '1:1#2', '2:1']);
  });

  it('numbers blocks that have no loc', () => {
    const blocks = blocksOf(node('div', { text: 'a' }), node('div', { text: 'b' }));
    expect(blocks.map((b) => b.id)).toEqual(['n0', 'n1']);
  });

  it('squashes whitespace and clips to 80 characters', () => {
    const long = 'word '.repeat(40);
    const [block] = blocksOf(node('div', { text: long }));
    expect(block.text.length).toBe(80);
    expect(block.text).not.toContain('  ');
  });
});

describe('readBlocks whole-page reasons', () => {
  it('refuses a page with stepped reveals', () => {
    expect(readBlocks(page(node('div', { text: 'x', step: true })))).toEqual({
      whole: 'steps',
    });
  });

  it('refuses a page with nothing readable', () => {
    expect(readBlocks(page(node('div')))).toEqual({ whole: 'empty' });
  });

  it('refuses a page with more than 40 blocks', () => {
    const many = Array.from({ length: 41 }, (_, i) => node('div', { text: `item ${i}` }));
    expect(readBlocks(page(...many))).toEqual({ whole: 'tooMany' });
  });

  it('refuses a page whose tree could not be copied', () => {
    expect(readBlocks(null)).toEqual({ whole: 'tooLarge' });
  });
});
