import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../agent-prefs/prefs';
import {
  afterTurn,
  collectDecisions,
  driverAction,
  insertPage,
  MAX_BRIEF,
  MAX_DECISIONS,
  MAX_ITEMS,
  MAX_TITLE,
  movePage,
  nextStep,
  type Outline,
  type OutlinePage,
  outlinePrompt,
  pageAwaitingCheck,
  pagePrompt,
  parseOutlineBlock,
  removePage,
  renamePage,
  reviewPrompt,
  sanitizeDecisions,
  sanitizeItems,
  sanitizeOutline,
  setKind,
  stripOutlineBlock,
  teamState,
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
  built: 0,
  paused: false,
  stage: 'pages',
  dispatched: null,
  lastTurn: null,
  prefs: DEFAULT_PREFS,
  decisions: [],
};

describe('sanitizeOutline', () => {
  it('keeps a well-formed outline', () => {
    expect(sanitizeOutline(outline)).toEqual(outline);
  });

  it('fills the build fields on a record written before they existed', () => {
    const old = {
      state: 'building',
      brief: 'b',
      pages: 8,
      files: [],
      items,
      updatedAt: 3,
    };
    const cleaned = sanitizeOutline(old);
    expect(cleaned).toMatchObject({
      built: 0,
      paused: false,
      stage: 'pages',
      dispatched: null,
      lastTurn: null,
      prefs: DEFAULT_PREFS,
      decisions: [],
    });
  });

  it('keeps the preferences a record carries and repairs the ones it cannot trust', () => {
    expect(
      sanitizeOutline({ ...outline, prefs: { ...DEFAULT_PREFS, design: 'dense' } })?.prefs.design,
    ).toBe('dense');
    expect(sanitizeOutline({ ...outline, prefs: { design: 'sparse' } })?.prefs).toEqual(
      DEFAULT_PREFS,
    );
    expect(sanitizeOutline({ ...outline, decisions: 'none' })?.decisions).toEqual([]);
  });

  it('clamps the build fields it cannot trust', () => {
    const cleaned = sanitizeOutline({
      ...outline,
      state: 'building',
      built: 99,
      paused: 'yes',
      stage: 'later',
      dispatched: { kind: 'page', n: 99, at: 5 },
      lastTurn: { kind: 'nope', n: 1, ok: true, at: 5 },
    });
    expect(cleaned?.built).toBe(items.length);
    expect(cleaned?.paused).toBe(false);
    expect(cleaned?.stage).toBe('pages');
    expect(cleaned?.dispatched).toEqual({ kind: 'page', n: items.length, at: 5 });
    expect(cleaned?.lastTurn).toBeNull();
    expect(
      sanitizeOutline({ ...outline, dispatched: { kind: 'page', n: 1, at: 'soon' } })?.dispatched,
    ).toBeNull();
    expect(
      sanitizeOutline({ ...outline, lastTurn: { kind: 'review', n: 0, ok: true, at: 9 } })
        ?.lastTurn,
    ).toEqual({ kind: 'review', n: 0, ok: true, at: 9 });
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

  it('opens the build with page one, the whole list and the kinds', () => {
    const text = pagePrompt(outline, 'deck-1', 1);
    expect(text).toContain('slides/deck-1/index.tsx');
    expect(text).toContain('write page 1 only');
    expect(text).toContain('meta.title');
    expect(text).toContain('1. [cover] Cover');
    expect(text).toContain('4. [end] End');
    expect(text).toContain('key figure — one large number');
    expect(text).toContain('Numbers from the reference files stay exactly as written there.');
  });

  it('keeps later pages to one line, then the preferences', () => {
    const text = pagePrompt(outline, 'deck-1', 3);
    expect(text.split('\n')[0]).toBe(
      'Page 3 of 4: [kpi] Numbers. Write only this page; leave the others as they are.',
    );
    expect(text).not.toContain('1. [cover]');
    expect(text).toContain('Balance text and visuals.');
  });

  it('asks for a review pass without changing the pages', () => {
    const text = reviewPrompt(outline, 'deck-1');
    expect(text).toContain('All 4 pages are written.');
    expect(text).toContain('slides/deck-1/index.tsx');
    expect(text).toContain('slides/deck-1/assets/');
    expect(text).toContain('ask the user which to use');
    expect(text).toContain('Do not add or remove pages.');
  });

  it('ends every step with the preferences', () => {
    const prefs = { ...DEFAULT_PREFS, tone: 'friendly' as const, research: 'web' as const };
    const outlineText = outlinePrompt({ ...outline, prefs }, 'deck-1', 'en');
    expect(outlineText).toContain('Write in a light, friendly tone.');
    expect(
      outlineText
        .trim()
        .endsWith('You may look up facts the files do not cover; say where each one came from.'),
    ).toBe(true);
    expect(pagePrompt({ ...outline, prefs }, 'deck-1', 2)).toContain(
      'Write in a light, friendly tone.',
    );
    expect(reviewPrompt({ ...outline, prefs }, 'deck-1')).toContain(
      'Write in a light, friendly tone.',
    );
  });

  it('stops asking about a mismatch when the user said to use the spreadsheet', () => {
    const lenient = { ...outline, prefs: { ...DEFAULT_PREFS, askOnMismatch: false } };
    const text = reviewPrompt(lenient, 'deck-1');
    expect(text).not.toContain('ask the user which to use');
    expect(text).toContain('use the one from the spreadsheet');
  });
});

const building = (patch: Partial<Outline> = {}): Outline => ({
  ...outline,
  state: 'building',
  ...patch,
});

describe('nextStep', () => {
  it('walks the pages, then the review', () => {
    expect(nextStep(building())).toEqual({ kind: 'page', n: 1 });
    expect(nextStep(building({ built: 3 }))).toEqual({ kind: 'page', n: 4 });
    expect(nextStep(building({ stage: 'review' }))).toEqual({ kind: 'review' });
    expect(nextStep(building({ built: 4 }))).toBeNull();
  });

  it('does nothing outside building', () => {
    expect(nextStep(outline)).toBeNull();
    expect(nextStep({ ...outline, state: 'built' })).toBeNull();
  });
});

describe('afterTurn', () => {
  it('keeps the step while the turn waits for an answer', () => {
    const waiting = building({ dispatched: { kind: 'page', n: 1, at: 10 } });
    expect(afterTurn(waiting, { ok: true, waitingForAnswer: true }, 20)).toBe(waiting);
  });

  it('records a failed turn without moving the build on', () => {
    const next = afterTurn(
      building({ built: 1, dispatched: { kind: 'page', n: 2, at: 10 } }),
      { ok: false, waitingForAnswer: false },
      30,
    );
    expect(next.built).toBe(1);
    expect(next.dispatched).toBeNull();
    expect(next.lastTurn).toEqual({ kind: 'page', n: 2, ok: false, at: 30 });
  });

  it('counts a finished page and switches to the review after the last one', () => {
    const mid = afterTurn(
      building({ dispatched: { kind: 'page', n: 2, at: 10 } }),
      { ok: true, waitingForAnswer: false },
      30,
    );
    expect(mid.built).toBe(2);
    expect(mid.stage).toBe('pages');
    expect(mid.dispatched).toBeNull();
    expect(mid.lastTurn).toEqual({ kind: 'page', n: 2, ok: true, at: 30 });

    const last = afterTurn(
      building({ built: 3, dispatched: { kind: 'page', n: 4, at: 10 } }),
      { ok: true, waitingForAnswer: false },
      30,
    );
    expect(last.built).toBe(4);
    expect(last.stage).toBe('review');
  });

  it('closes the build when the review passes', () => {
    const next = afterTurn(
      building({ built: 4, stage: 'review', dispatched: { kind: 'review', n: 0, at: 10 } }),
      { ok: true, waitingForAnswer: false },
      30,
    );
    expect(next.state).toBe('built');
    expect(next.lastTurn).toEqual({ kind: 'review', n: 0, ok: true, at: 30 });
  });

  it('leaves an outline with nothing dispatched alone', () => {
    const idle = building();
    expect(afterTurn(idle, { ok: true, waitingForAnswer: false }, 30)).toBe(idle);
    const ready = outline;
    expect(afterTurn(ready, { ok: true, waitingForAnswer: false }, 30)).toBe(ready);
  });

  it('stops after each page when the user asked to check them', () => {
    const ask = building({
      prefs: { ...DEFAULT_PREFS, confirmEachPage: true },
      dispatched: { kind: 'page', n: 2, at: 10 },
    });
    const next = afterTurn(ask, { ok: true, waitingForAnswer: false }, 30);
    expect(next.built).toBe(2);
    expect(next.paused).toBe(true);
  });

  it('never stops after the last page, so the review can start', () => {
    const ask = building({
      built: 3,
      paused: true,
      prefs: { ...DEFAULT_PREFS, confirmEachPage: true },
      dispatched: { kind: 'page', n: 4, at: 10 },
    });
    const next = afterTurn(ask, { ok: true, waitingForAnswer: false }, 30);
    expect(next.built).toBe(4);
    expect(next.stage).toBe('review');
    expect(next.paused).toBe(false);
  });

  it('keeps the user pause between pages when they do not ask for checks', () => {
    const paused = building({ paused: true, dispatched: { kind: 'page', n: 2, at: 10 } });
    expect(afterTurn(paused, { ok: true, waitingForAnswer: false }, 30).paused).toBe(true);
  });
});

describe('pageAwaitingCheck', () => {
  const waiting = (patch: Partial<Outline> = {}): Outline =>
    building({
      built: 2,
      paused: true,
      prefs: { ...DEFAULT_PREFS, confirmEachPage: true },
      lastTurn: { kind: 'page', n: 2, ok: true, at: 5 },
      ...patch,
    });

  it('names the page a confirm-each-page stop is waiting on', () => {
    expect(pageAwaitingCheck(waiting())).toBe(2);
  });

  it('says nothing when the pause is not a page check', () => {
    expect(pageAwaitingCheck(waiting({ paused: false }))).toBeNull();
    expect(
      pageAwaitingCheck(waiting({ prefs: { ...DEFAULT_PREFS, confirmEachPage: false } })),
    ).toBeNull();
    expect(
      pageAwaitingCheck(waiting({ lastTurn: { kind: 'page', n: 2, ok: false, at: 5 } })),
    ).toBeNull();
    expect(
      pageAwaitingCheck(waiting({ lastTurn: { kind: 'page', n: 4, ok: true, at: 5 } })),
    ).toBeNull();
    expect(pageAwaitingCheck(building({ paused: true }))).toBeNull();
  });
});

describe('driverAction', () => {
  const now = 1_000_000;

  it('sends only while building and idle', () => {
    expect(driverAction(outline, { running: false, now })).toBe('idle');
    expect(driverAction(building(), { running: true, now })).toBe('wait');
    expect(driverAction(building({ paused: true }), { running: false, now })).toBe('paused');
    expect(driverAction(building({ paused: true }), { running: true, now })).toBe('wait');
  });

  it('waits on a fresh dispatch and gives up after half a minute', () => {
    const step = { kind: 'page' as const, n: 1, at: now - 10_000 };
    expect(driverAction(building({ dispatched: step }), { running: false, now })).toBe('wait');
    const old = { kind: 'page' as const, n: 1, at: now - 31_000 };
    expect(driverAction(building({ dispatched: old }), { running: false, now })).toBe(
      'interrupted',
    );
  });

  it('picks up where a turn ran cleanly', () => {
    expect(driverAction(building(), { running: false, now })).toBe('send');
    const fresh = { kind: 'page' as const, n: 1, ok: true, at: now - 60_000 };
    expect(driverAction(building({ lastTurn: fresh }), { running: false, now })).toBe('send');
    const stale = { kind: 'page' as const, n: 1, ok: true, at: now - 121_000 };
    expect(driverAction(building({ lastTurn: stale }), { running: false, now })).toBe(
      'interrupted',
    );
    const failed = { kind: 'page' as const, n: 1, ok: false, at: now - 1_000 };
    expect(driverAction(building({ lastTurn: failed }), { running: false, now })).toBe(
      'interrupted',
    );
  });
});

describe('teamState', () => {
  it('shows the page writer at work and the readers finished', () => {
    expect(
      teamState(building(), { running: true, waitingForAnswer: false, action: 'wait' }),
    ).toEqual({
      lead: 'working',
      research: 'done',
      outline: 'done',
      design: 'working',
      review: 'idle',
    });
  });

  it('greys out the reader when there are no files', () => {
    expect(
      teamState(building({ files: [] }), {
        running: false,
        waitingForAnswer: false,
        action: 'send',
      }).research,
    ).toBe('none');
  });

  it('asks the user when the review stops on a question', () => {
    const state = teamState(building({ built: 4, stage: 'review' }), {
      running: false,
      waitingForAnswer: true,
      action: 'wait',
    });
    expect(state.review).toBe('needs-you');
    expect(state.design).toBe('done');
    expect(state.lead).toBe('thinking');
  });

  it('marks everyone done once the deck is built', () => {
    const state = teamState(
      { ...building(), state: 'built', built: 4, stage: 'review' },
      {
        running: false,
        waitingForAnswer: false,
        action: 'idle',
      },
    );
    expect(state).toMatchObject({ lead: 'done', design: 'done', review: 'done' });
  });

  it('calls Lemon to the user when the build stopped', () => {
    const state = teamState(building(), {
      running: false,
      waitingForAnswer: false,
      action: 'interrupted',
    });
    expect(state.lead).toBe('needs-you');
    expect(
      teamState(building({ paused: true }), {
        running: false,
        waitingForAnswer: false,
        action: 'paused',
      }).lead,
    ).toBe('idle');
  });
});

describe('sanitizeDecisions', () => {
  it('keeps well-formed entries and trims the long ones', () => {
    const long = 'x'.repeat(200);
    const cleaned = sanitizeDecisions([
      { id: 'q1:0', question: long, answer: long },
      { id: '', question: 'no id', answer: 'x' },
      { question: 'no id either', answer: 'x' },
      'nope',
    ]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].id).toBe('q1:0');
    expect(cleaned[0].question).toHaveLength(120);
    expect(cleaned[0].answer).toHaveLength(120);
    expect(sanitizeDecisions('none')).toEqual([]);
  });

  it('keeps at most twenty decisions', () => {
    const many = Array.from({ length: MAX_DECISIONS + 5 }, (_, i) => ({
      id: `q${i}:0`,
      question: `Q${i}`,
      answer: 'A',
    }));
    expect(sanitizeDecisions(many)).toHaveLength(MAX_DECISIONS);
  });
});

describe('collectDecisions', () => {
  const answered = (
    id: string,
    questions: { question: string; header?: string }[],
    answers: Record<string, string>,
  ) => ({ id, kind: 'question', status: 'answered', questions, answers });

  it('turns each answered question into a decision', () => {
    expect(
      collectDecisions(
        [],
        [
          answered('q1', [{ question: 'Use which number?', header: 'Numbers' }], {
            'Use which number?': '41%',
          }),
        ],
      ),
    ).toEqual([{ id: 'q1:0', question: 'Numbers', answer: '41%' }]);
  });

  it('falls back to the question when it has no header', () => {
    expect(
      collectDecisions(
        [],
        [answered('q1', [{ question: 'Which page?' }], { 'Which page?': '2' })],
      )[0].question,
    ).toBe('Which page?');
  });

  it('does not add the same question twice when a resumed turn reports it again', () => {
    const first = collectDecisions(
      [],
      [answered('q1', [{ question: 'Which number?' }], { 'Which number?': '41%' })],
    );
    const again = collectDecisions(first, [
      answered('q1', [{ question: 'Which number?' }], { 'Which number?': '41%' }),
    ]);
    expect(again).toEqual(first);
  });

  it('ignores questions that are not answered and items that are not questions', () => {
    expect(
      collectDecisions(
        [],
        [
          {
            id: 'q1',
            kind: 'question',
            status: 'pending',
            questions: [{ question: 'Q' }],
            answers: null,
          },
          { id: 'a1', kind: 'assistant' },
        ],
      ),
    ).toEqual([]);
  });

  it('stops at twenty decisions', () => {
    const many = Array.from({ length: MAX_DECISIONS + 4 }, (_, i) =>
      answered(`q${i}`, [{ question: `Q${i}` }], { [`Q${i}`]: 'A' }),
    );
    expect(collectDecisions([], many)).toHaveLength(MAX_DECISIONS);
  });
});
