import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { pageKeys } from '../../src/app/lemonriver/board/model/cards.ts';
import { columnsAfterApply } from '../../src/app/lemonriver/board/model/structure.ts';
import { deleteSlide, devScratchDir, duplicateSlide, slideSourcePath } from './helpers.ts';

const SLIDE = 'lr-board-agent';

type Sent = { text?: string };
type Request = import('@playwright/test').APIRequestContext;

const cards = (page: Page) => page.locator('.react-flow__node-page');
const panel = (page: Page) => page.locator('[data-lr-block-panel]');
const rows = (page: Page) => panel(page).locator('[data-lr-block-list] [data-lr-block-row]');
const labels = (page: Page) => page.locator('.react-flow__node-columnLabel');

async function agentReady(page: Page): Promise<void> {
  await page.route('**/__agent/status', async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { providers: { id: string }[] };
    await route.fulfill({
      json: {
        ...body,
        providers: body.providers.map((provider) =>
          provider.id === 'claude'
            ? { ...provider, ready: true }
            : { ...provider, ready: false, cliFound: false },
        ),
      },
    });
  });
}

async function agentGone(page: Page): Promise<void> {
  await page.route('**/__agent/status', async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { providers: { id: string }[] };
    await route.fulfill({
      json: {
        ...body,
        providers: body.providers.map((provider) => ({
          ...provider,
          ready: false,
          cliFound: false,
        })),
      },
    });
  });
}

/** A stand-in agent that records what the board sends it. */
async function mockAgent(page: Page): Promise<{ sent: Sent[] }> {
  const sent: Sent[] = [];
  const ts = new Date().toISOString();
  const known = { slideId: '' };
  const session = () => ({
    id: 's-task',
    provider: 'claude',
    title: '',
    createdAt: ts,
    updatedAt: ts,
    status: 'idle',
    slideId: known.slideId,
    providerSessionId: null,
    items: [],
  });

  await page.route('**/__agent/sessions/s-task/messages', async (route) => {
    sent.push(route.request().postDataJSON() as Sent);
    await route.fulfill({ status: 202, json: { ok: true } });
  });
  await page.route('**/__agent/sessions/s-task', (route) => route.fulfill({ json: session() }));
  await page.route('**/__agent/sessions', (route) => {
    if (route.request().method() === 'POST') {
      known.slideId = (route.request().postDataJSON() as { slideId: string }).slideId;
      return route.fulfill({ json: session() });
    }
    return route.fulfill({ json: { sessions: sent.length > 0 ? [session()] : [] } });
  });

  return { sent };
}

function boardPath(slideId = SLIDE): string {
  return path.join(devScratchDir, '.open-slide', 'board', `${slideId}.json`);
}

async function readRecord(): Promise<Record<string, unknown>> {
  // The server rewrites this file whole; a read can land mid-write.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return JSON.parse(await fs.readFile(boardPath(), 'utf8')) as Record<string, unknown>;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error('the board record is not readable');
}

async function writeRecord(fields: Record<string, unknown>): Promise<void> {
  const current = await readRecord();
  await fs.writeFile(boardPath(), JSON.stringify({ ...current, ...fields }));
}

async function resetRecord(): Promise<void> {
  const current = await readRecord();
  for (const key of [
    'applying',
    'applyBackup',
    'applyColumns',
    'applyColumnsBackup',
    'lastApply',
    'chapterPlan',
    'outline',
  ]) {
    delete current[key];
  }
  await fs.writeFile(boardPath(), JSON.stringify(current));
}

async function sha256(file: string): Promise<string> {
  return crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
}

async function readEntries(request: Request): Promise<string[]> {
  const res = await request.get(`/__board/entries?slideId=${SLIDE}`);
  return ((await res.json()) as { entries?: string[] }).entries ?? [];
}

async function openBoard(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('open-slide:board-blocks-visible', '1');
  });
  await page.goto(`/s/${SLIDE}/board`);
  await expect(cards(page)).toHaveCount(3);
  await expect(panel(page)).toBeVisible();
}

async function selectCard(page: Page, index: number) {
  await cards(page)
    .nth(index)
    .click({ position: { x: 12, y: 12 } });
}

async function openAskMenu(page: Page, cardIndex: number) {
  await cards(page)
    .nth(cardIndex)
    .click({ button: 'right', position: { x: 12, y: 12 } });
  await page.getByRole('menuitem', { name: 'Ask your agent' }).hover();
}

/** Waits for the board's own page-count reshape to land in the record. */
async function settleColumns(pages: number): Promise<void> {
  await expect
    .poll(async () => {
      const columns = ((await readRecord()).columns ?? []) as { size: number }[];
      return columns.reduce((sum, column) => sum + column.size, 0);
    })
    .toBe(pages);
  // The cards take their new names a moment after the chapters settle; the
  // record this test writes next must be the last word.
  await new Promise((resolve) => setTimeout(resolve, 800));
}

let sourceBefore = '';

test.describe('story board agent tasks', () => {
  test.beforeEach(async ({ request }) => {
    await duplicateSlide(request, 'alpha', SLIDE);
    await request.put('/__board/cards', {
      data: {
        slideId: SLIDE,
        links: [],
        cards: {
          One: { title: 'Opening' },
          Two: { title: 'Middle' },
          Three: { title: 'Closing' },
        },
      },
    });
    await request.put('/__board/changes', { data: { slideId: SLIDE, changes: [] } });
    await request.put('/__board/restructures', { data: { slideId: SLIDE, restructures: [] } });
    await resetRecord();
    await request.put('/__board', {
      data: {
        slideId: SLIDE,
        columns: [
          { title: 'Opening', size: 2 },
          { title: 'Closing', size: 1 },
        ],
      },
    });
    sourceBefore = await sha256(slideSourcePath(SLIDE));
  });

  test.afterEach(async ({ request }) => {
    await deleteSlide(request, SLIDE);
  });

  test('rewrites one page from its card and takes it back', async ({ page }) => {
    await agentReady(page);
    const mock = await mockAgent(page);
    await openBoard(page);

    await openAskMenu(page, 1);
    await page.getByRole('menuitem', { name: 'Rewrite this page' }).click();

    await expect.poll(() => mock.sent.length).toBe(1);
    const prompt = mock.sent[0].text ?? '';
    expect(prompt).toContain('Work on page 2 "Middle" of slides/lr-board-agent/index.tsx only.');
    expect(prompt).toContain('Rewrite this page');
    expect(prompt).toContain('page 2');

    await expect(page.locator('[data-lr-applying]')).toContainText('rewriting page 2');
    await selectCard(page, 0);
    await expect(panel(page).locator('input[type="checkbox"]')).toHaveCount(0);

    const beforeText = await fs.readFile(slideSourcePath(SLIDE), 'utf8');
    await fs.writeFile(slideSourcePath(SLIDE), `${beforeText}\n// rewritten\n`);
    await writeRecord({
      applying: undefined,
      applyBackup: beforeText,
      applyColumnsBackup: [
        { title: 'Opening', size: 2 },
        { title: 'Closing', size: 1 },
      ],
      lastApply: { ok: true, at: Date.now(), pages: ['Two'] },
    });

    await expect(page.getByText('Page 2 is done')).toBeVisible({ timeout: 15_000 });
    await expect(cards(page).nth(1).locator('.osd-board-card')).toHaveClass(/osd-board-applied/, {
      timeout: 3000,
    });

    await page.getByRole('button', { name: 'Undo this' }).click();
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('Restored')).toBeVisible();
    expect(await sha256(slideSourcePath(SLIDE))).toBe(sourceBefore);
    expect((await readRecord()).applyBackup).toBeUndefined();
  });

  test('follows a card note, and only when there is one', async ({ page, request }) => {
    await agentReady(page);
    const mock = await mockAgent(page);
    await openBoard(page);

    await openAskMenu(page, 1);
    const follow = page.getByRole('menuitem', { name: 'Follow the note' });
    await expect(follow).toHaveAttribute('aria-disabled', 'true');
    await expect(follow).toHaveAttribute('title', 'Write a note on the card first');
    await page.keyboard.press('Escape');

    const note = 'Say "first"\nthen stop';
    await request.put('/__board/cards', {
      data: {
        slideId: SLIDE,
        links: [],
        cards: { One: { title: 'Opening' }, Two: { title: 'Middle', memo: note } },
      },
    });
    await openBoard(page);
    await openAskMenu(page, 1);
    await page.getByRole('menuitem', { name: 'Follow the note' }).click();

    await expect.poll(() => mock.sent.length).toBe(1);
    expect(mock.sent[0].text ?? '').toContain(
      `Change this page as the note says: ${JSON.stringify(note)}`,
    );
  });

  test('expands a page into two, in the chapter it belongs to', async ({ page, request }) => {
    await agentReady(page);
    await mockAgent(page);
    await openBoard(page);

    await openAskMenu(page, 1);
    await page.getByRole('menuitem', { name: 'Expand into two pages' }).click();
    await expect(page.locator('[data-lr-applying]')).toContainText('expanding page 2');

    const before = await readEntries(request);
    await request.post('/__board/pages/insert', { data: { slideId: SLIDE, index: 2 } });
    const after = await readEntries(request);
    await expect(cards(page)).toHaveCount(4);
    await settleColumns(4);

    const beforeKeys = pageKeys(before, before.length);
    const afterKeys = pageKeys(after, after.length);
    const created = afterKeys.filter((key) => !beforeKeys.includes(key));
    await writeRecord({
      applying: undefined,
      applyBackup: sourceBefore,
      applyColumnsBackup: [
        { title: 'Opening', size: 2 },
        { title: 'Closing', size: 1 },
      ],
      columns: columnsAfterApply(
        [
          { title: 'Opening', keys: beforeKeys.slice(0, 2) },
          { title: 'Closing', keys: beforeKeys.slice(2) },
        ],
        afterKeys,
      ),
      lastApply: { ok: true, at: Date.now(), pages: [beforeKeys[1], ...created] },
    });

    await expect(page.getByText('Page 2 became two pages')).toBeVisible({ timeout: 15_000 });
    await expect(labels(page).nth(0)).toContainText('03');
    await expect(labels(page).nth(1)).toContainText('01');
  });

  test('fills a chapter: titles first, then the pages the user settled on', async ({
    page,
    request,
  }) => {
    await agentReady(page);
    const mock = await mockAgent(page);
    await openBoard(page);

    await page.locator('[data-lr-fill-chapter]').nth(1).click();
    const dialog = page.locator('[data-lr-chapter-dialog]');
    await expect(dialog).toBeVisible();
    await dialog.locator('[data-lr-chapter-brief]').fill('Wrap the deck up');
    await dialog.locator('[data-lr-chapter-count]').fill('2');
    await dialog.locator('[data-lr-plan-chapter]').click();

    await expect.poll(() => mock.sent.length).toBe(1);
    expect(mock.sent[0].text ?? '').toContain('do not write, edit or create any file');
    await expect(page.locator('[data-lr-planning]')).toContainText('Planning the titles');

    await writeRecord({
      applying: undefined,
      chapterPlan: {
        chapter: 1,
        title: 'Closing',
        brief: 'Wrap the deck up',
        items: [
          { id: 'plan-1', title: 'One more thing', kind: 'page' },
          { id: 'plan-2', title: 'And another', kind: 'page' },
        ],
        state: 'ready',
      },
    });

    const items = dialog.locator('[data-lr-plan-item]');
    await expect(items).toHaveCount(2, { timeout: 15_000 });
    await items.nth(0).locator('input').fill('Edited one');
    await items.nth(1).getByRole('button', { name: 'Remove' }).click();
    await dialog.locator('[data-lr-add-plan-item]').click();
    await items.nth(1).locator('input').fill('Added one');
    await dialog.locator('[data-lr-write-chapter]').click();

    await expect.poll(() => mock.sent.length).toBe(2);
    const write = mock.sent[1].text ?? '';
    expect(write).toContain('1. "Edited one" (page)');
    expect(write).toContain('2. "Added one" (page)');
    expect(write).toContain('right after page 3 "Closing"');

    const before = await readEntries(request);
    await request.post('/__board/pages/insert', { data: { slideId: SLIDE, index: 3 } });
    await request.post('/__board/pages/insert', { data: { slideId: SLIDE, index: 4 } });
    const after = await readEntries(request);
    await expect(cards(page)).toHaveCount(5);
    await settleColumns(5);

    const beforeKeys = pageKeys(before, before.length);
    const afterKeys = pageKeys(after, after.length);
    const created = afterKeys.filter((key) => !beforeKeys.includes(key));
    expect(created).toHaveLength(2);
    await writeRecord({
      applying: undefined,
      applyBackup: sourceBefore,
      applyColumnsBackup: [
        { title: 'Opening', size: 2 },
        { title: 'Closing', size: 1 },
      ],
      columns: columnsAfterApply(
        [
          { title: 'Opening', keys: beforeKeys.slice(0, 2) },
          { title: 'Closing', keys: beforeKeys.slice(2) },
        ],
        afterKeys,
        1,
      ),
      cards: {
        One: { title: 'Opening' },
        Two: { title: 'Middle' },
        Three: { title: 'Closing' },
        [created[0]]: { title: 'Edited one' },
        [created[1]]: { title: 'Added one' },
      },
      chapterPlan: undefined,
      lastApply: { ok: true, at: Date.now(), pages: created },
    });

    await expect(page.getByText('Chapter 2 has 2 new pages')).toBeVisible({ timeout: 15_000 });
    await expect(labels(page).nth(0)).toContainText('02');
    await expect(labels(page).nth(1)).toContainText('03');
    await expect(page.getByText('Edited one')).toBeVisible();
  });

  test('says why a one-page action cannot run', async ({ page, request }) => {
    await agentGone(page);
    await openBoard(page);
    // The agent's status arrives a moment after the board opens.
    await page.waitForTimeout(1000);

    await openAskMenu(page, 0);
    const rewrite = page.getByRole('menuitem', { name: 'Rewrite this page' });
    await expect(rewrite).toHaveAttribute('aria-disabled', 'true');
    await expect(rewrite).toHaveAttribute('title', 'Connect an agent first');
    await page.keyboard.press('Escape');

    await writeRecord({
      outline: {
        state: 'building',
        brief: 'b',
        pages: 8,
        files: [],
        items: [
          { id: 'p1', title: 'Cover', kind: 'cover' },
          { id: 'p2', title: 'Close', kind: 'end' },
        ],
        updatedAt: Date.now(),
        built: 0,
        paused: false,
        stage: 'pages',
        dispatched: null,
        lastTurn: null,
      },
    });
    await agentReady(page);
    await openBoard(page);
    // The board reads the outline just after it opens.
    await page.waitForTimeout(1500);

    await openAskMenu(page, 0);
    await expect(page.getByRole('menuitem', { name: 'Rewrite this page' })).toHaveAttribute(
      'title',
      'The deck is being laid out from its outline',
      { timeout: 15_000 },
    );
    await page.keyboard.press('Escape');

    await writeRecord({ outline: undefined });
    await request.put('/__board/changes', { data: { slideId: SLIDE, changes: [] } });
    await page.reload();
    await expect(cards(page)).toHaveCount(3);
    await selectCard(page, 0);
    await rows(page).nth(1).getByRole('button', { name: 'More for this block' }).click();
    await page.getByRole('menuitem', { name: 'Move to page' }).hover();
    await page.getByRole('menuitem', { name: /^Page 2\b/ }).click();
    await expect(page.getByRole('button', { name: /^Changes \(/ })).toBeVisible();

    await openAskMenu(page, 0);
    await expect(page.getByRole('menuitem', { name: 'Rewrite this page' })).toHaveAttribute(
      'title',
      'Apply or drop the waiting changes on this page first',
    );
  });

  test('says why a chapter plan failed, and offers to try again', async ({ page }) => {
    await agentReady(page);
    await mockAgent(page);
    await writeRecord({
      chapterPlan: {
        chapter: 1,
        title: 'Closing',
        brief: 'Wrap the deck up',
        items: [],
        state: 'failed',
        error: 'the agent stopped before it was done',
      },
    });
    await openBoard(page);

    await page.locator('[data-lr-fill-chapter]').nth(1).click();
    const dialog = page.locator('[data-lr-chapter-dialog]');
    await expect(dialog.locator('[data-lr-plan-error]')).toHaveText(
      'the agent stopped before it was done',
    );
    await expect(dialog.locator('[data-lr-retry-plan]')).toBeEnabled();
  });
});
