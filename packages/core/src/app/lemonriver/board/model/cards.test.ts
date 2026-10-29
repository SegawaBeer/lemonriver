import { describe, expect, it } from 'vitest';
import {
  adoptEntries,
  type CardState,
  carryCards,
  entriesAfter,
  isSettledKey,
  linkCards,
  linkedPairs,
  originAfter,
  type PageOp,
  pageKeys,
  patchCard,
  sanitizeCards,
  sanitizeLinks,
  unlinkCards,
} from './cards.ts';

/** Runs one board operation the way the board does, entries and all. */
function run(state: CardState, entries: string[], op: PageOp) {
  const count = entries.length;
  const next = entriesAfter(op, entries, count);
  const nextCount =
    op.kind === 'delete'
      ? count - 1
      : op.kind === 'deleteMany'
        ? count - op.indices.length
        : op.kind === 'move' || op.kind === 'moveMany' || op.kind === 'reorder'
          ? count
          : count + 1;
  const carried = carryCards(
    state,
    pageKeys(entries, count),
    pageKeys(next, nextCount),
    originAfter(op, count),
  );
  return { state: carried, entries: next };
}

/** The memo each position shows, which is what a user actually sees. */
const memos = (state: CardState, entries: string[] | null | undefined, count: number) =>
  pageKeys(entries, count).map((key) => state.cards[key]?.memo ?? null);

const deck = ['Cover', 'Agenda', 'Q3', 'Close'];

describe('pageKeys', () => {
  it('keys pages by their entry in the deck', () => {
    expect(pageKeys(deck, 4)).toEqual(deck);
  });

  it('tells repeated entries apart, so a duplicated page gets its own card', () => {
    expect(pageKeys(['A', 'B', 'A', 'A'], 4)).toEqual(['A', 'B', 'A#2', 'A#3']);
  });

  it('falls back to positions when the entries cannot be read one per page', () => {
    expect(pageKeys(null, 3)).toEqual(['@0', '@1', '@2']);
  });

  it('gives a deck caught mid-reload keys that match no card', () => {
    const keys = pageKeys(['A', 'B'], 3);
    expect(keys.every(isSettledKey)).toBe(false);
    expect(pageKeys(undefined, 2).some(isSettledKey)).toBe(false);
  });
});

describe('carryCards', () => {
  const withMemo: CardState = { cards: { Q3: { memo: 'Q3 numbers missing' } }, links: [] };

  it('keeps a memo on its page when the page moves', () => {
    const after = run(withMemo, deck, { kind: 'move', from: 2, to: 0 });
    expect(memos(after.state, after.entries, 4)).toEqual(['Q3 numbers missing', null, null, null]);
  });

  it('keeps a memo on its page when the deck is reordered outside the board', () => {
    // No operation runs: the thumbnail rail rewrote the file and the entries reload.
    expect(memos(withMemo, ['Q3', 'Cover', 'Agenda', 'Close'], 4)[0]).toBe('Q3 numbers missing');
  });

  it('never shifts a memo onto the neighbour when a page is added before it', () => {
    const after = run(withMemo, deck, { kind: 'insert', index: 1 });
    expect(memos(after.state, after.entries, 5)).toEqual([
      null,
      null,
      null,
      'Q3 numbers missing',
      null,
    ]);
  });

  it('starts a duplicated page with a card of its own', () => {
    const after = run(withMemo, deck, { kind: 'duplicate', index: 2 });
    expect(memos(after.state, after.entries, 5)).toEqual([
      null,
      null,
      'Q3 numbers missing',
      null,
      null,
    ]);
  });

  it('lets the copy keep its own memo while the original moves around it', () => {
    let state: CardState = {
      cards: { A: { memo: 'first' }, 'A#2': { memo: 'second' } },
      links: [],
    };
    let entries = ['A', 'B', 'A'];
    ({ state, entries } = run(state, entries, { kind: 'move', from: 0, to: 2 }));
    expect(memos(state, entries, 3)).toEqual([null, 'second', 'first']);
  });

  it('takes a deleted page’s card and links with it', () => {
    const state: CardState = {
      cards: { Q3: { memo: 'gone' }, Close: { memo: 'kept' } },
      links: [{ a: 'Q3', b: 'Cover' }],
    };
    const after = run(state, deck, { kind: 'delete', index: 2 });
    expect(after.state.cards).toEqual({ Close: { memo: 'kept' } });
    expect(after.state.links).toEqual([]);
  });

  it('does not hand a deleted copy’s memo to the original', () => {
    const state: CardState = { cards: { 'A#2': { memo: 'copy only' } }, links: [] };
    const after = run(state, ['A', 'A'], { kind: 'delete', index: 1 });
    expect(memos(after.state, after.entries, 1)).toEqual([null]);
  });

  it('re-keys every page when the deck is keyed by position', () => {
    const state: CardState = { cards: { '@2': { memo: 'third page' } }, links: [] };
    const op: PageOp = { kind: 'move', from: 2, to: 0 };
    const carried = carryCards(state, pageKeys(null, 4), pageKeys(null, 4), originAfter(op, 4));
    expect(memos(carried, null, 4)).toEqual(['third page', null, null, null]);
  });

  it('leaves data for a page the deck does not have right now where it is', () => {
    const state: CardState = { cards: { Gone: { memo: 'parked' } }, links: [] };
    const after = run(state, deck, { kind: 'move', from: 0, to: 3 });
    expect(after.state.cards.Gone).toEqual({ memo: 'parked' });
  });

  it('starts a new copy clean even when an earlier copy left data under the same key', () => {
    // The first copy was deleted from the thumbnail rail, so its card was never cleared.
    const state: CardState = {
      cards: { 'A#2': { memo: 'old copy' } },
      links: [{ a: 'A#2', b: 'B' }],
    };
    const after = run(state, ['A', 'B'], { kind: 'duplicate', index: 0 });
    expect(memos(after.state, after.entries, 3)).toEqual([null, null, null]);
    expect(after.state.links).toEqual([]);
  });

  it('keeps a page’s own card when it is pushed onto a position that holds leftover data', () => {
    // A deck keyed by position that once had five pages: "@4" is left over.
    const state: CardState = {
      cards: { '@3': { memo: 'last page' }, '@4': { memo: 'leftover' } },
      links: [],
    };
    const op: PageOp = { kind: 'insert', index: 1 };
    const carried = carryCards(state, pageKeys(null, 4), pageKeys(null, 5), originAfter(op, 4));
    expect(memos(carried, null, 5)).toEqual([null, null, null, null, 'last page']);
  });
});

describe('adoptEntries', () => {
  it('moves a blank page’s memo onto the name the deck gave it', () => {
    let state: CardState = { cards: {}, links: [] };
    let entries: string[] = ['Cover', 'Close'];
    ({ state, entries } = run(state, entries, { kind: 'insert', index: 1 }));
    const blankKey = pageKeys(entries, 3)[1];
    state = { ...state, cards: { [blankKey]: { memo: 'draft me' } } };

    const named = ['Cover', 'NewPage1', 'Close'];
    const adopted = adoptEntries(state, entries, named);
    expect(memos(adopted, named, 3)).toEqual([null, 'draft me', null]);
  });

  it('clears leftovers from an older page that used the same name', () => {
    const state: CardState = {
      cards: { NewPage1: { memo: 'stale' } },
      links: [{ a: 'NewPage1', b: 'Cover' }],
    };
    const { entries } = run(state, ['Cover', 'Close'], { kind: 'insert', index: 1 });
    const adopted = adoptEntries(state, entries, ['Cover', 'NewPage1', 'Close']);
    expect(adopted.cards).toEqual({});
    expect(adopted.links).toEqual([]);
  });

  it('changes nothing when no blank page is waiting for a name', () => {
    const state: CardState = { cards: { Cover: { memo: 'x' } }, links: [] };
    expect(adoptEntries(state, deck, deck)).toBe(state);
  });
});

describe('links', () => {
  it('records a link once, whichever way it is drawn', () => {
    const links = linkCards(linkCards([], 'A', 'B'), 'B', 'A');
    expect(links).toEqual([{ a: 'A', b: 'B' }]);
  });

  it('never links a card to itself', () => {
    expect(linkCards([], 'A', 'A')).toEqual([]);
  });

  it('removes a link drawn the other way round', () => {
    expect(unlinkCards([{ a: 'A', b: 'B' }], 'B', 'A')).toEqual([]);
  });

  it('follows both pages when the deck is reordered', () => {
    const keys = ['Close', 'Cover', 'Q3', 'Agenda'];
    expect(linkedPairs(keys, [{ a: 'Cover', b: 'Close' }])).toEqual([[1, 0]]);
  });

  it('hides a link whose page is not in the deck', () => {
    expect(linkedPairs(deck, [{ a: 'Cover', b: 'Gone' }])).toEqual([]);
  });
});

describe('patchCard', () => {
  it('sets and clears fields one at a time', () => {
    let cards = patchCard({}, 'A', { title: 'Market', status: 'doing' });
    expect(cards).toEqual({ A: { title: 'Market', status: 'doing' } });
    cards = patchCard(cards, 'A', { status: null });
    expect(cards).toEqual({ A: { title: 'Market' } });
  });

  it('drops a card once nothing is left on it', () => {
    expect(patchCard({ A: { memo: 'x' } }, 'A', { memo: '' })).toEqual({});
  });
});

describe('sanitize', () => {
  it('keeps only the fields and statuses the board knows', () => {
    expect(
      sanitizeCards({
        A: { title: '  Intro ', status: 'doing', extra: 1 },
        B: { status: 'bogus' },
        C: 'nope',
      }),
    ).toEqual({ A: { title: 'Intro', status: 'doing' } });
  });

  it('drops malformed and duplicate links', () => {
    expect(sanitizeLinks([{ a: 'A', b: 'B' }, { a: 'B', b: 'A' }, { a: 'A' }, null])).toEqual([
      { a: 'A', b: 'B' },
    ]);
  });
});

describe('batch and structural operations', () => {
  const state: CardState = {
    cards: { Cover: { memo: 'one' }, Q3: { memo: 'two' }, Close: { memo: 'three' } },
    links: [{ a: 'Q3', b: 'Close' }],
  };

  it('carries every card through a whole-deck reorder', () => {
    const order = [3, 1, 0, 2];
    const { state: next, entries } = run(state, deck, { kind: 'reorder', order });
    expect(entries).toEqual(['Close', 'Agenda', 'Cover', 'Q3']);
    expect(memos(next, entries, 4)).toEqual(['three', null, 'one', 'two']);
    expect(next.links).toEqual([{ a: 'Q3', b: 'Close' }]);
  });

  it('keeps the relative order of several pages moved at once', () => {
    const { state: next, entries } = run(state, deck, { kind: 'moveMany', moving: [0, 2], to: 3 });
    expect(entries).toEqual(['Agenda', 'Cover', 'Q3', 'Close']);
    expect(memos(next, entries, 4)).toEqual([null, 'one', 'two', 'three']);
  });

  it('drops the cards of every page removed at once', () => {
    const { state: next, entries } = run(state, deck, { kind: 'deleteMany', indices: [0, 2] });
    expect(entries).toEqual(['Agenda', 'Close']);
    expect(memos(next, entries, 2)).toEqual([null, 'three']);
  });
});

describe('restore', () => {
  it('puts the page back under its own name, not a blank the deck must explain', () => {
    const { entries } = run({ cards: {}, links: [] }, ['Cover', 'Q3', 'Close'], {
      kind: 'restore',
      index: 1,
      entry: 'Agenda',
    });
    expect(entries).toEqual(deck);
    expect(pageKeys(entries, 4).every(isSettledKey)).toBe(true);
  });

  it('lets a card written back under that name show up again', () => {
    const { entries } = run({ cards: {}, links: [] }, ['Cover', 'Q3', 'Close'], {
      kind: 'restore',
      index: 1,
      entry: 'Agenda',
    });
    const state = { cards: { Agenda: { memo: 'back' } }, links: [] };
    expect(memos(state, entries, 4)).toEqual([null, 'back', null, null]);
  });
});
