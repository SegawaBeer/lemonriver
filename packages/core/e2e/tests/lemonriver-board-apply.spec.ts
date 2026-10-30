import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { pageKeys } from '../../src/app/lemonriver/board/model/cards.ts';
import { columnsAfterApply } from '../../src/app/lemonriver/board/model/structure.ts';
import {
  deleteSlide,
  devScratchDir,
  duplicateSlide,
  readSlideSource,
  slideSourcePath,
} from './helpers.ts';

const SLIDE = 'lr-board-apply';

type Sent = { text?: string };
type Request = import('@playwright/test').APIRequestContext;

const cards = (page: Page) => page.locator('.react-flow__node-page');
const panel = (page: Page) => page.locator('[data-lr-block-panel]');
const rows = (page: Page) => panel(page).locator('[data-lr-block-list] [data-lr-block-row]');
const changesButton = (page: Page) => page.getByRole('button', { name: /^Changes \(/ });

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
    id: 's-apply',
    provider: 'claude',
    title: '',
    createdAt: ts,
    updatedAt: ts,
    status: 'idle',
    slideId: known.slideId,
    providerSessionId: null,
    items: [],
  });

  await page.route('**/__agent/sessions/s-apply/messages', async (route) => {
    sent.push(route.request().postDataJSON() as Sent);
    await route.fulfill({ status: 202, json: { ok: true } });
  });
  await page.route('**/__agent/sessions/s-apply', (route) => route.fulfill({ json: session() }));
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

/** The board record outlives the deck: a test starts with no apply in it. */
async function resetApply(): Promise<void> {
  const current = await readRecord();
  delete current.applying;
  delete current.applyBackup;
  delete current.lastApply;
  delete current.applyColumns;
  delete current.applyColumnsBackup;
  delete current.chapterPlan;
  await fs.writeFile(boardPath(), JSON.stringify(current));
}

async function readEntries(request: Request): Promise<string[]> {
  const res = await request.get(`/__board/entries?slideId=${SLIDE}`);
  return ((await res.json()) as { entries?: string[] }).entries ?? [];
}

async function sha256(file: string): Promise<string> {
  return crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
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

/** Marks one block of the page shown in the panel for a page of its own. */
async function splitWithFirstBlock(page: Page, cardIndex: number) {
  await selectCard(page, cardIndex);
  await rows(page).nth(0).getByRole('checkbox').check();
  await page.locator('[data-lr-split-page]').click();
}

async function moveRowToPage(page: Page, rowIndex: number, pageNumber: number) {
  await rows(page).nth(rowIndex).getByRole('button', { name: 'More for this block' }).click();
  await page.getByRole('menuitem', { name: 'Move to page' }).hover();
  await page.getByRole('menuitem', { name: new RegExp(`^Page ${pageNumber}\\b`) }).click();
}

async function readRestructures(request: Request) {
  const res = await request.get(`/__board/restructures?slideId=${SLIDE}`);
  return ((await res.json()) as { restructures?: unknown[] }).restructures ?? [];
}

let sourceBefore = '';

test.describe('story board apply', () => {
  test.beforeEach(async ({ request }) => {
    await duplicateSlide(request, 'alpha', SLIDE);
    await request.put('/__board/cards', {
      data: {
        slideId: SLIDE,
        links: [],
        cards: { One: { title: 'Opening' }, Two: { title: 'Middle' } },
      },
    });
    await request.put('/__board/changes', { data: { slideId: SLIDE, changes: [] } });
    await request.put('/__board/restructures', { data: { slideId: SLIDE, restructures: [] } });
    await resetApply();
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

  test('splits a page and takes the split back', async ({ page, request }) => {
    await openBoard(page);
    await splitWithFirstBlock(page, 0);

    await expect(changesButton(page)).toHaveText('Changes (1)');
    await expect(cards(page).nth(0)).toContainText('1 change waiting');
    await expect.poll(async () => (await readRestructures(request)).length).toBe(1);

    await changesButton(page).click();
    await expect(page.getByText('Page 1: 1 block goes to a new page after it')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.keyboard.press('ControlOrMeta+z');
    await expect(changesButton(page)).toHaveCount(0);
    await expect.poll(async () => (await readRestructures(request)).length).toBe(0);
  });

  test('merges two selected pages', async ({ page, request }) => {
    await openBoard(page);
    await selectCard(page, 1);
    await cards(page)
      .nth(2)
      .click({ position: { x: 12, y: 12 }, modifiers: ['Shift'] });

    await page.getByRole('button', { name: 'Merge into one page' }).click();
    await expect(changesButton(page)).toHaveText('Changes (1)');
    await expect.poll(async () => (await readRestructures(request)).length).toBe(1);

    await changesButton(page).click();
    await expect(page.getByText('Page 2 and page 3 become one page')).toBeVisible();
  });

  test('hands the whole list to the agent and locks the board while it runs', async ({ page }) => {
    await agentReady(page);
    const mock = await mockAgent(page);
    await openBoard(page);

    await splitWithFirstBlock(page, 0);
    await moveRowToPage(page, 1, 2);
    await expect(changesButton(page)).toHaveText('Changes (2)');

    await changesButton(page).click();
    await page.locator('[data-lr-change-apply]').click();

    await expect.poll(() => mock.sent.length).toBe(1);
    const prompt = mock.sent[0].text ?? '';
    expect(prompt).toContain('Split page 1 "Opening": move the title "Alpha page one"');
    expect(prompt).toContain(
      'Move the paragraph "Opening content" from page 1 "Opening" to page 2 "Middle"',
    );

    // Nothing has touched the deck yet.
    expect(await sha256(slideSourcePath(SLIDE))).toBe(sourceBefore);
    await expect(page.locator('[data-lr-applying]')).toBeVisible();
    await selectCard(page, 0);
    await expect(panel(page).locator('input[type="checkbox"]')).toHaveCount(0);

    const record = await readRecord();
    expect(typeof record.applyBackup).toBe('string');
    expect(record.applying).toBeTruthy();
  });

  test('lighting the changed cards when the turn ends, and undoing it', async ({ page }) => {
    await agentReady(page);
    await mockAgent(page);
    await openBoard(page);
    await splitWithFirstBlock(page, 0);
    await moveRowToPage(page, 1, 2);

    await changesButton(page).click();
    await page.locator('[data-lr-change-apply]').click();
    await expect(page.locator('[data-lr-applying]')).toBeVisible();

    // The turn ends: the agent rewrote the deck and the board settles the list.
    await fs.writeFile(slideSourcePath(SLIDE), `${await readSlideSource(SLIDE)}\n// applied\n`);
    await writeRecord({
      changes: [],
      restructures: [],
      applying: undefined,
      lastApply: { ok: true, at: Date.now(), pages: ['One', 'Two'] },
    });

    await expect(page.getByText('All applied')).toBeVisible({ timeout: 15_000 });
    await expect(cards(page).nth(0).locator('.osd-board-card')).toHaveClass(/osd-board-applied/, {
      timeout: 3000,
    });
    await expect(changesButton(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Undo this apply' }).click();
    await expect(page.getByText('Put this deck back as it was before the apply?')).toBeVisible();
    await page.getByRole('button', { name: 'Restore' }).click();

    await expect(page.getByText('Restored')).toBeVisible();
    expect(await sha256(slideSourcePath(SLIDE))).toBe(sourceBefore);
    expect((await readRecord()).applyBackup).toBeUndefined();
  });

  test('keeps the chapters in step when an apply adds a page', async ({ page, request }) => {
    await agentReady(page);
    await mockAgent(page);
    await openBoard(page);
    await splitWithFirstBlock(page, 0);

    await changesButton(page).click();
    await page.locator('[data-lr-change-apply]').click();
    await expect(page.locator('[data-lr-applying]')).toBeVisible();

    const before = await readEntries(request);
    expect(before).toHaveLength(3);
    await request.post('/__board/pages/insert', { data: { slideId: SLIDE, index: 1 } });
    const after = await readEntries(request);
    expect(after).toHaveLength(4);
    await expect(cards(page)).toHaveCount(4);
    // The board reshapes its own chapters to the new page count first; the
    // record the server writes at the end of the turn comes after that.
    await expect
      .poll(async () => {
        const columns = ((await readRecord()).columns ?? []) as { size: number }[];
        return columns.reduce((sum, column) => sum + column.size, 0);
      })
      .toBe(4);

    // The turn ends with a page added after the first one; the server works the
    // chapters out from the pages that are still there.
    const beforeKeys = pageKeys(before, before.length);
    const afterKeys = pageKeys(after, after.length);
    await writeRecord({
      changes: [],
      restructures: [],
      applying: undefined,
      applyBackup: undefined,
      columns: columnsAfterApply(
        [
          { title: 'Opening', keys: beforeKeys.slice(0, 2) },
          { title: 'Closing', keys: beforeKeys.slice(2) },
        ],
        afterKeys,
      ),
      lastApply: { ok: true, at: Date.now(), pages: [beforeKeys[0]] },
    });

    await expect(page.getByText('All applied')).toBeVisible({ timeout: 15_000 });
    const labels = page.locator('.react-flow__node-columnLabel');
    await expect(labels.nth(0)).toContainText('Opening');
    await expect(labels.nth(0)).toContainText('03');
    await expect(labels.nth(1)).toContainText('Closing');
    await expect(labels.nth(1)).toContainText('01');
  });

  test('keeps the list when the turn fails, and says why', async ({ page }) => {
    await agentReady(page);
    await mockAgent(page);
    await openBoard(page);
    await splitWithFirstBlock(page, 0);

    await changesButton(page).click();
    await page.locator('[data-lr-change-apply]').click();
    await expect(page.locator('[data-lr-applying]')).toBeVisible();

    await writeRecord({
      applying: undefined,
      applyBackup: undefined,
      lastApply: { ok: false, at: Date.now(), error: 'the file did not compile', pages: [] },
    });

    await expect(page.getByText('Not applied: the file did not compile')).toBeVisible({
      timeout: 15_000,
    });
    await expect(changesButton(page)).toHaveText('Changes (1)');
    expect(await sha256(slideSourcePath(SLIDE))).toBe(sourceBefore);
  });

  test('will not apply while no agent is connected', async ({ page }) => {
    await agentGone(page);
    await openBoard(page);
    await splitWithFirstBlock(page, 0);

    await changesButton(page).click();
    await expect(page.locator('[data-lr-change-apply]')).toBeDisabled();
    await expect(
      page.getByText('Connect an agent to apply these; the list stays here'),
    ).toBeVisible();
  });

  test('will not apply while the deck is being laid out from its outline', async ({ page }) => {
    await agentReady(page);
    await mockAgent(page);
    await openBoard(page);
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

    await splitWithFirstBlock(page, 0);
    await changesButton(page).click();
    await expect(page.locator('[data-lr-change-apply]')).toBeDisabled();
    await expect(
      page.getByText('The deck is being laid out from its outline; apply when it finishes'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('backspace on a card asks first and leaves the card alone', async ({ page }) => {
    await openBoard(page);
    await selectCard(page, 0);
    await page.keyboard.press('Backspace');

    await expect(page.getByRole('dialog')).toBeVisible();
    // React Flow would delete the node it has selected a moment later, so the
    // card has to still be there while the question is on screen.
    await page.waitForTimeout(400);
    await expect(cards(page)).toHaveCount(3);

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(cards(page)).toHaveCount(3);
  });
});
