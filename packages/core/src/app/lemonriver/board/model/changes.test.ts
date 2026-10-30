import { describe, expect, it } from 'vitest';
import type { Block } from '../blocks/classify.ts';
import {
  type BlockInfo,
  carryChanges,
  changedPages,
  effectiveBlocks,
  parkedBlocks,
  placeBlock,
  removeChange,
  sanitizeChanges,
  staleChanges,
} from './changes.ts';

const block = (id: string, text = id): Block => ({
  id,
  kind: 'text',
  text,
  loc: null,
  box: { x: 0, y: 0, w: 10, h: 10 },
});

const info = (text: string): BlockInfo => ({ kind: 'text', text, loc: null });
const at = (page: string, before: string | null, id: string) => ({ page, before, block: id });

const A = [block('a1', 'Alpha page one'), block('a2', 'Opening content')];
const B = [block('b1', 'Second page')];

describe('placeBlock', () => {
  it('keeps one entry per block', () => {
    let changes = placeBlock([], at('p1', 'a2', 'a1'), info('Alpha page one'), {
      page: 'p2',
      before: null,
    });
    changes = placeBlock(changes, at('p1', 'a2', 'a1'), info('Alpha page one'), {
      page: 'p3',
      before: null,
    });
    expect(changes).toHaveLength(1);
    expect(changes[0].to).toEqual({ page: 'p3', before: null });
  });

  it('drops the entry when the block goes back where it was', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a1'), info('Alpha page one'), {
      page: 'p1',
      before: 'a2',
    });
    expect(changes).toEqual([]);
  });

  it('keeps the code when parking', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a1'), info('Alpha page one'), 'parked', '<h1/>');
    expect(changes[0].to).toBe('parked');
    expect(changes[0].code).toBe('<h1/>');
  });
});

describe('effectiveBlocks', () => {
  it('reorders inside a page', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a2'), info('Opening content'), {
      page: 'p1',
      before: 'a1',
    });
    expect(effectiveBlocks('p1', A, changes).map((b) => b.id)).toEqual(['a2', 'a1']);
  });

  it('moves a block to the end of another page', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a1'), info('Alpha page one'), {
      page: 'p2',
      before: null,
    });
    const one = effectiveBlocks('p1', A, changes);
    const two = effectiveBlocks('p2', B, changes);
    expect(one.map((b) => b.id)).toEqual(['a2']);
    expect(two.map((b) => b.id)).toEqual(['b1', 'a1']);
    expect(two[1]).toMatchObject({ pending: true, from: 'p1' });
  });

  it('puts the block last when its anchor is gone', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a1'), info('Alpha page one'), {
      page: 'p2',
      before: 'gone',
    });
    expect(effectiveBlocks('p2', B, changes).map((b) => b.id)).toEqual(['b1', 'a1']);
  });

  it('inserts two blocks moved to the same page in order', () => {
    let changes = placeBlock([], at('p1', 'a2', 'a1'), info('a'), { page: 'p2', before: 'b1' });
    changes = placeBlock(changes, at('p3', null, 'c1'), info('c'), { page: 'p2', before: 'b1' });
    expect(effectiveBlocks('p2', B, changes).map((b) => b.id)).toEqual(['a1', 'c1', 'b1']);
  });

  it('takes a parked block off its page', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a1'), info('a'), 'parked');
    expect(effectiveBlocks('p1', A, changes).map((b) => b.id)).toEqual(['a2']);
  });
});

describe('parkedBlocks and removeChange', () => {
  it('lists parked blocks in change order', () => {
    let changes = placeBlock([], at('p1', 'a2', 'a1'), info('a'), 'parked', 'x');
    changes = placeBlock(changes, at('p2', null, 'b1'), info('b'), 'parked', 'y');
    expect(parkedBlocks(changes).map((p) => p.origin.block)).toEqual(['a1', 'b1']);
  });

  it('removes one entry by its origin', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a1'), info('a'), 'parked');
    expect(removeChange(changes, at('p1', 'a2', 'a1'))).toEqual([]);
  });
});

describe('carryChanges', () => {
  it('leaves a reorder alone, because a page key travels with its page', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a1'), info('a'), { page: 'p2', before: null });
    const carried = carryChanges(changes, ['p1', 'p2'], ['p2', 'p1'], [1, 0]);
    expect(carried[0].origin.page).toBe('p1');
    expect(carried[0].to).toEqual({ page: 'p2', before: null });
  });

  it('follows a duplicated page, whose copy gets a key of its own', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a1'), info('a'), 'parked', 'x');
    const carried = carryChanges(changes, ['p1'], ['p1', 'p1#2'], [0, -1]);
    expect(carried).toHaveLength(1);
    expect(carried[0].origin.page).toBe('p1');
  });

  it('drops a change whose source page was deleted', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a1'), info('a'), { page: 'p2', before: null });
    expect(carryChanges(changes, ['p1', 'p2'], ['p2'], [1])).toEqual([]);
  });

  it('drops a change whose target page was deleted', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a1'), info('a'), { page: 'p2', before: null });
    expect(carryChanges(changes, ['p1', 'p2'], ['p1'], [0])).toEqual([]);
  });

  it('keeps a parked change when its page survives elsewhere', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a1'), info('a'), 'parked', 'x');
    const carried = carryChanges(changes, ['p0', 'p1'], ['p1', 'p9'], [1, 0]);
    expect(carried).toHaveLength(1);
    expect(carried[0].origin.page).toBe('p1');
  });
});

describe('staleChanges', () => {
  it('flags a block whose text changed on the page', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a1'), info('Alpha page one'), {
      page: 'p2',
      before: null,
    });
    const readOf = (page: string) =>
      page === 'p1' ? [block('a1', 'Edited heading'), block('a2')] : null;
    expect([...staleChanges(changes, readOf)]).toEqual([0]);
  });

  it('flags a block that is no longer on the page', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a1'), info('Alpha page one'), 'parked', 'x');
    expect([...staleChanges(changes, () => [block('a2')])]).toEqual([0]);
  });

  it('leaves a change alone when the page cannot be read', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a1'), info('Alpha page one'), 'parked', 'x');
    expect([...staleChanges(changes, () => null)]).toEqual([]);
  });
});

describe('changedPages', () => {
  it('counts both ends of a move', () => {
    const changes = placeBlock([], at('p1', 'a2', 'a1'), info('a'), { page: 'p2', before: null });
    expect([...changedPages(changes)].sort()).toEqual(['p1', 'p2']);
  });
});

describe('sanitizeChanges', () => {
  it('drops malformed entries and keeps good ones', () => {
    const raw = [
      {
        origin: { page: 'p1', before: null, block: 'a1' },
        block: { kind: 'text', text: 'A', loc: null },
        to: 'parked',
      },
      { origin: { page: 'p1' }, block: { kind: 'nope', text: 'x' }, to: 'parked' },
      'nonsense',
      null,
    ];
    const clean = sanitizeChanges(raw);
    expect(clean).toHaveLength(1);
    expect(clean[0].origin.block).toBe('a1');
  });

  it('clips long text and long code', () => {
    const clean = sanitizeChanges([
      {
        origin: { page: 'p1', before: null, block: 'a1' },
        block: { kind: 'text', text: 'x'.repeat(500), loc: null },
        to: 'parked',
        code: 'y'.repeat(9000),
      },
    ]);
    expect(clean[0].block.text).toHaveLength(80);
    expect(clean[0].code).toHaveLength(4000);
  });

  it('keeps at most 200 entries', () => {
    const raw = Array.from({ length: 250 }, (_, i) => ({
      origin: { page: 'p1', before: null, block: `b${i}` },
      block: { kind: 'text', text: `t${i}`, loc: null },
      to: 'parked',
    }));
    expect(sanitizeChanges(raw)).toHaveLength(200);
  });
});
