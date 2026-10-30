import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { deleteSlide, duplicateSlide, slideSourcePath } from './helpers.ts';

const SLIDE = 'lr-board-views';

type Page = import('@playwright/test').Page;
type Request = import('@playwright/test').APIRequestContext;

const cards = (page: Page) => page.locator('.react-flow__node-page');
const rows = (page: Page) => page.locator('[data-lr-list-row]');
const segments = (page: Page) => page.locator('[data-lr-timeline-segment]');
const chapters = (page: Page) => page.locator('[data-lr-timeline-chapter]');
const progress = (page: Page) => page.locator('[data-lr-progress]');

async function openBoard(page: Page) {
  await page.goto(`/s/${SLIDE}/board`);
  await expect(cards(page)).toHaveCount(3);
}

async function showView(page: Page, view: 'cards' | 'list' | 'timeline') {
  await page.locator(`[data-lr-view="${view}"]`).click();
}

/** The mode the board is drawn in, which is also what the page declares. */
async function viewOf(page: Page) {
  return page.locator('[data-lr-board-view]').getAttribute('data-lr-board-view');
}

async function seedColumns(request: Request, columns: { title: string; size: number }[]) {
  const res = await request.put('/__board', { data: { slideId: SLIDE, columns } });
  expect(res.ok()).toBe(true);
}

async function readEntries(request: Request) {
  const res = await request.get(`/__board/entries?slideId=${SLIDE}`);
  const body = (await res.json()) as { entries?: string[] | null };
  return body.entries;
}

async function readColumns(request: Request) {
  const res = await request.get(`/__board?slideId=${SLIDE}&pages=3`);
  const body = (await res.json()) as { columns?: { title: string; size: number }[] };
  return body.columns ?? [];
}

async function sha256(file: string): Promise<string> {
  return crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
}

/** Presses the row's own grip, walks it to the top of the list, and drops it. */
async function liftRowToTop(page: Page, index: number) {
  await rows(page).nth(index).locator('button').first().focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  for (let step = 0; step < index; step++) {
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);
  }
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
}

let sourceBefore = '';
let sourceMayChange = false;

test.describe('story board views', () => {
  test.beforeEach(async ({ request }) => {
    sourceMayChange = false;
    await duplicateSlide(request, 'alpha', SLIDE);
    await request.put('/__board/cards', { data: { slideId: SLIDE, cards: {}, links: [] } });
    await request.put('/__board/changes', { data: { slideId: SLIDE, changes: [] } });
    await request.put('/__board/restructures', { data: { slideId: SLIDE, restructures: [] } });
    await request.put('/__board/target', { data: { slideId: SLIDE, targetMinutes: null } });
    await seedColumns(request, [
      { title: 'Opening', size: 2 },
      { title: 'Closing', size: 1 },
    ]);
    sourceBefore = await sha256(slideSourcePath(SLIDE));
  });

  test.afterEach(async ({ request }) => {
    if (!sourceMayChange) {
      expect(await sha256(slideSourcePath(SLIDE))).toBe(sourceBefore);
    }
    await deleteSlide(request, SLIDE);
  });

  test('edits a title in the list and finds it on the card', async ({ page }) => {
    await openBoard(page);
    await showView(page, 'list');
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).nth(0)).toContainText('01');
    await expect(rows(page).nth(0)).toContainText('One');
    await expect(rows(page).nth(2)).toContainText('Three');

    await page.locator('[data-lr-list-title]').nth(1).click();
    const field = page.getByRole('textbox', { name: 'Rename this card' });
    await field.fill('Two renamed');
    await field.press('Enter');
    await expect(rows(page).nth(1)).toContainText('Two renamed');

    // The card wall reads the same board data, so the new name is already there.
    await showView(page, 'cards');
    await expect(cards(page).nth(1)).toContainText('Two renamed');

    await page.keyboard.press('ControlOrMeta+z');
    await expect(cards(page).nth(1)).toContainText('Name this card');

    // The view is a preference, so a reload comes back to the list.
    await showView(page, 'list');
    await page.reload();
    await expect.poll(() => viewOf(page)).toBe('list');
    await expect(rows(page)).toHaveCount(3);
  });

  test('moves a row to the front by keyboard and takes it back', async ({ page, request }) => {
    sourceMayChange = true;
    await openBoard(page);
    await showView(page, 'list');
    await expect(rows(page)).toHaveCount(3);

    await liftRowToTop(page, 2);
    await expect.poll(async () => (await readEntries(request))?.join(',')).toBe('Three,One,Two');
    await expect.poll(async () => (await readColumns(request)).map((c) => c.size)).toEqual([3, 0]);

    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await readEntries(request))?.join(',')).toBe('One,Two,Three');
    await expect.poll(async () => (await readColumns(request)).map((c) => c.size)).toEqual([2, 1]);
  });

  test('times every page by its notes or its own words', async ({ page }) => {
    await openBoard(page);
    await showView(page, 'timeline');
    await expect(segments(page)).toHaveCount(3);
    await expect(chapters(page)).toHaveCount(2);

    // Page 1 has speaker notes, page 2 has none, and three short pages only
    // ever reach the minimum.
    await expect(segments(page).nth(0)).toHaveAttribute('title', /15s · From the speaker notes/u);
    await expect(segments(page).nth(1)).toHaveAttribute(
      'title',
      /15s · From the words on the page/u,
    );
    await expect(page.locator('[data-lr-total]')).toContainText('About 45s');
  });

  test('measures the deck against a target and keeps it', async ({ page, request }) => {
    sourceMayChange = true;
    // A page's notes are what the talk will say, so a long one makes the deck
    // longer than a minute.
    const file = slideSourcePath(SLIDE);
    const source = await fs.readFile(file, 'utf8');
    const longNote = 'word '.repeat(200).trim();
    const edited = source.replace(
      "= ['Alpha speaker note', undefined, 'Alpha final note']",
      `= ['${longNote}', undefined, 'Alpha final note']`,
    );
    expect(edited).not.toBe(source);
    await fs.writeFile(file, edited);

    await openBoard(page);
    await showView(page, 'timeline');

    const target = page.locator('[data-lr-target]');
    await target.fill('1');
    await expect(page.locator('[data-lr-target-diff]')).toContainText('Over by 50s');
    await expect(page.locator('[data-lr-total]')).toHaveAttribute('data-over', 'true');

    await target.fill('');
    await expect(page.locator('[data-lr-target-diff]')).toHaveCount(0);

    await target.fill('1');
    await expect(page.locator('[data-lr-target-diff]')).toBeVisible();
    await page.reload();
    await expect.poll(() => viewOf(page)).toBe('timeline');
    await expect(page.locator('[data-lr-target]')).toHaveValue('1');
    await expect(page.locator('[data-lr-target-diff]')).toContainText('Over by 50s');

    const stored = await request.get(`/__board?slideId=${SLIDE}&pages=3`);
    expect(((await stored.json()) as { targetMinutes?: number }).targetMinutes).toBe(1);
  });

  test('shows how much of a chapter is done in all three views', async ({ page, request }) => {
    await seedColumns(request, [{ title: 'Opening', size: 3 }]);
    await request.put('/__board/cards', {
      data: {
        slideId: SLIDE,
        cards: { One: { status: 'done' }, Two: { status: 'done' } },
        links: [],
      },
    });
    await openBoard(page);
    await expect(progress(page)).toHaveText('2/3 done');

    await showView(page, 'list');
    await expect(progress(page)).toHaveText('2/3 done');

    await showView(page, 'timeline');
    await expect(progress(page)).toHaveText('2/3 done');
  });

  test('names what links two pages, jumps between them, and takes the name back', async ({
    page,
  }) => {
    await openBoard(page);

    // Drag the dot on the first card onto the third.
    const first = await cards(page).nth(0).boundingBox();
    const third = await cards(page).nth(2).boundingBox();
    if (!first || !third) throw new Error('the cards are not on screen');
    const dot = await cards(page).nth(0).locator('.osd-board-link-handle').boundingBox();
    if (!dot) throw new Error('the link dot is not on screen');
    await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
    await page.mouse.down();
    await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2, { steps: 12 });
    await page.mouse.up();

    const menu = page.locator('[data-lr-link-menu]');
    await expect(menu).toHaveCount(1);
    await menu.click();
    await page.getByRole('menuitem', { name: 'Cause', exact: true }).click();
    await expect(page.locator('[data-lr-link-kind]')).toHaveText('Cause');

    await menu.click();
    await page.getByRole('menuitem', { name: 'Jump to page 3' }).click();
    await expect(cards(page).nth(2)).toHaveClass(/selected/u);

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('[data-lr-link-kind]')).toHaveCount(0);
  });

  test('dims what the filter does not pick out in the list and the timeline', async ({
    page,
    request,
  }) => {
    await request.put('/__board/cards', {
      data: { slideId: SLIDE, cards: { One: { status: 'done' } }, links: [] },
    });
    await openBoard(page);

    await page.getByRole('button', { name: 'Filter' }).click();
    await page.getByRole('menu').getByText('Done', { exact: true }).click();
    await page.keyboard.press('Escape');

    await showView(page, 'list');
    const rowOpacity = async (n: number) =>
      Number.parseFloat(
        (await rows(page)
          .nth(n)
          .evaluate((el) => getComputedStyle(el).opacity)) ?? '1',
      );
    await expect.poll(() => rowOpacity(0)).toBe(1);
    await expect.poll(() => rowOpacity(1)).toBeLessThan(0.5);

    await showView(page, 'timeline');
    const segmentOpacity = async (n: number) =>
      Number.parseFloat(
        (await segments(page)
          .nth(n)
          .evaluate((el) => getComputedStyle(el).opacity)) ?? '1',
      );
    await expect.poll(() => segmentOpacity(0)).toBe(1);
    await expect.poll(() => segmentOpacity(1)).toBeLessThan(0.5);
  });
});
