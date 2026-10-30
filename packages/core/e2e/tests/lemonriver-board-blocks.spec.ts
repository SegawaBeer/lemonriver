import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { deleteSlide, duplicateSlide, slideSourcePath } from './helpers.ts';

const SLIDE = 'lr-board-blocks';
const STEPS = 'lr-board-blocks-steps';

type Page = import('@playwright/test').Page;
type Request = import('@playwright/test').APIRequestContext;

const cards = (page: Page) => page.locator('.react-flow__node-page');
const panel = (page: Page) => page.locator('[data-lr-block-panel]');
const rows = (page: Page) => panel(page).locator('[data-lr-block-list] [data-lr-block-row]');
const parkingRows = (page: Page) =>
  panel(page).locator('[data-lr-parking-list] [data-lr-block-row]');

/** The block panel is a browser preference; turn it on before the board loads. */
async function openBoard(page: Page, slideId = SLIDE, count = 3) {
  await page.addInitScript(() => {
    window.localStorage.setItem('open-slide:board-blocks-visible', '1');
  });
  await page.goto(`/s/${slideId}/board`);
  await expect(cards(page)).toHaveCount(count);
  await expect(panel(page)).toBeVisible();
}

async function selectCard(page: Page, index: number) {
  await cards(page)
    .nth(index)
    .click({ position: { x: 12, y: 12 } });
}

async function sha256(file: string): Promise<string> {
  return crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
}

async function readChanges(request: Request) {
  const res = await request.get(`/__board/changes?slideId=${SLIDE}`);
  const body = (await res.json()) as { changes?: unknown[] };
  return body.changes ?? [];
}

/** Waits until the board has written the change list to disk. */
async function expectSavedChanges(request: Request, count: number) {
  await expect.poll(async () => (await readChanges(request)).length).toBe(count);
}

/** Picks a row up with the keyboard, moves it one place up, and drops it. */
async function liftOneRow(page: Page, rowIndex: number) {
  const handle = rows(page).nth(rowIndex).getByRole('button', { name: 'Drag this block' });
  await handle.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
}

async function moveRowToPage(page: Page, rowIndex: number, pageNumber: number) {
  await rows(page).nth(rowIndex).getByRole('button', { name: 'More for this block' }).click();
  await page.getByRole('menuitem', { name: 'Move to page' }).hover();
  await page.getByRole('menuitem', { name: new RegExp(`^Page ${pageNumber}\\b`) }).click();
}

let sourceBefore = '';
let sourceMayChange = false;

test.describe('story board blocks', () => {
  test.beforeEach(async ({ request }) => {
    sourceMayChange = false;
    await duplicateSlide(request, 'alpha', SLIDE);
    await request.put('/__board/cards', { data: { slideId: SLIDE, cards: {}, links: [] } });
    await request.put('/__board/changes', { data: { slideId: SLIDE, changes: [] } });
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
    if (!sourceMayChange) {
      expect(await sha256(slideSourcePath(SLIDE))).toBe(sourceBefore);
    }
    await deleteSlide(request, SLIDE);
    await deleteSlide(request, STEPS);
  });

  test('lists the blocks of the card last clicked', async ({ page }) => {
    await openBoard(page);
    await selectCard(page, 0);
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(0)).toContainText('Alpha page one');
    await expect(rows(page).nth(0)).toHaveAttribute('data-lr-block-kind', 'title');
    await expect(rows(page).nth(1)).toContainText('Opening content');
    await expect(rows(page).nth(1)).toHaveAttribute('data-lr-block-kind', 'text');

    await selectCard(page, 1);
    await expect(rows(page).nth(0)).toContainText('Alpha page two');
  });

  test('reorders a block by keyboard, keeps it across a reload, and undoes it', async ({
    page,
    request,
  }) => {
    await openBoard(page);
    await selectCard(page, 0);
    await expect(rows(page)).toHaveCount(2);

    await liftOneRow(page, 1);

    await expect(rows(page).nth(0)).toContainText('Opening content');
    await expect(page.getByRole('button', { name: 'Changes (1)' })).toBeVisible();
    await expect(cards(page).first()).toContainText('1 change waiting');
    await expectSavedChanges(request, 1);

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByRole('button', { name: 'Changes (1)' })).toHaveCount(0);
    await expect(rows(page).nth(0)).toContainText('Alpha page one');

    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(page.getByRole('button', { name: 'Changes (1)' })).toBeVisible();

    // The list outlives the page, so a reload still shows it.
    await page.reload();
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Changes (1)' })).toBeVisible();
    await selectCard(page, 0);
    await expect(rows(page).nth(0)).toContainText('Opening content');
  });

  test('moves a block to another page', async ({ page, request }) => {
    await openBoard(page);
    await selectCard(page, 0);
    await expect(rows(page)).toHaveCount(2);
    await moveRowToPage(page, 1, 2);

    await expect(rows(page)).toHaveCount(1);
    await selectCard(page, 1);
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).nth(2)).toContainText('Opening content');
    await expect(rows(page).nth(2)).toContainText('Pending');
    await expect(cards(page).nth(0)).toContainText('1 change waiting');
    await expect(cards(page).nth(1)).toContainText('1 change waiting');

    await expectSavedChanges(request, 1);
    const changes = (await readChanges(request)) as { to?: { page?: string } }[];
    expect(changes).toHaveLength(1);
    expect(changes[0].to?.page).toBeTruthy();
  });

  test('keeps the code of a block parked for later, and puts it back', async ({
    page,
    request,
  }) => {
    await openBoard(page);
    await selectCard(page, 2);
    await expect(rows(page)).toHaveCount(2);

    await rows(page).nth(0).getByRole('button', { name: 'More for this block' }).click();
    await page.getByRole('menuitem', { name: 'Move to the holding area' }).click();

    await expect(parkingRows(page)).toHaveCount(1);
    await expect(parkingRows(page).nth(0)).toContainText('Alpha page three');
    await expect(rows(page)).toHaveCount(1);

    await expect
      .poll(async () => (await readChanges(request)) as { code?: string }[])
      .not.toHaveLength(0);
    const parked = (await readChanges(request)) as { code?: string }[];
    expect(parked[0]?.code).toContain('Alpha page three');

    await parkingRows(page).nth(0).getByRole('button', { name: 'More for this block' }).click();
    await page.getByRole('menuitem', { name: 'Put back on page' }).hover();
    await page.getByRole('menuitem', { name: /^Page 1\b/ }).click();

    await expect(parkingRows(page)).toHaveCount(0);
    await selectCard(page, 0);
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).nth(2)).toContainText('Alpha page three');
  });

  test('follows the pages when one is reordered, and drops the change when one is deleted', async ({
    page,
  }) => {
    await openBoard(page);
    await selectCard(page, 1);
    await expect(rows(page)).toHaveCount(2);
    await moveRowToPage(page, 1, 3);
    await page.getByRole('button', { name: 'Changes (1)' }).click();
    await expect(page.getByText('Page 2 “Middle content” → page 3')).toBeVisible();
    await page.keyboard.press('Escape');

    // Whole-page reorder: page 1 goes to the end, so page 2 becomes page 1.
    await cards(page)
      .first()
      .click({ button: 'right', position: { x: 12, y: 12 } });
    await page.getByRole('menuitem', { name: 'Move to end' }).click();
    await page.getByRole('button', { name: 'Changes (1)' }).click();
    await expect(page.getByText('Page 1 “Middle content” → page 2')).toBeVisible();
    await page.keyboard.press('Escape');

    // Deleting a page is the one thing here that writes the deck itself.
    sourceMayChange = true;
    await cards(page)
      .first()
      .click({ position: { x: 12, y: 12 } });
    await page.keyboard.press('Backspace');
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(cards(page)).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Changes (1)' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Changes (1)' })).toBeVisible();
  });

  test('reads a page with stepped reveals as one whole page', async ({ page, request }) => {
    await duplicateSlide(request, 'steps', STEPS);
    await page.addInitScript(() => {
      window.localStorage.setItem('open-slide:board-blocks-visible', '1');
    });
    await page.goto(`/s/${STEPS}/board`);
    await expect(cards(page).first()).toBeVisible();

    await cards(page)
      .nth(1)
      .click({ position: { x: 12, y: 12 } });
    await expect(panel(page)).toContainText(
      'This page has step-by-step reveals, so it can only move as a whole',
    );
    await expect(rows(page)).toHaveCount(0);
    await expect(cards(page).nth(1)).toContainText('Whole page');
  });

  test('leaves the board shortcuts alone while the block panel has focus', async ({ page }) => {
    await openBoard(page);
    await selectCard(page, 0);
    await expect(rows(page)).toHaveCount(2);

    const handle = rows(page).nth(1).getByRole('button', { name: 'Drag this block' });
    await handle.focus();
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    await page.keyboard.press('b');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(cards(page)).toHaveCount(3);
  });

  test('marks a change stale once the page it points at changes', async ({ page }) => {
    await openBoard(page);
    await selectCard(page, 0);
    await expect(rows(page)).toHaveCount(2);
    await liftOneRow(page, 1);
    await expect(page.getByRole('button', { name: 'Changes (1)' })).toBeVisible();

    sourceMayChange = true;
    const file = slideSourcePath(SLIDE);
    const source = await fs.readFile(file, 'utf8');
    await fs.writeFile(file, source.replace('Opening content', 'Opening content changed'));

    await expect(async () => {
      if ((await panel(page).locator('[data-lr-block-row]').count()) === 0) {
        await selectCard(page, 0);
      }
      await expect(rows(page).nth(0)).toContainText('Opening content changed', { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Changes (1)' }).click();
    await expect(page.getByText('This page changed, so the block is gone')).toBeVisible();
  });
});
