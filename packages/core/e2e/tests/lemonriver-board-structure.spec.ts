import { expect, test } from '@playwright/test';
import { deleteSlide, duplicateSlide, editorCanvas, openSlide } from './helpers.ts';

const SLIDE = 'lr-board-structure';

const cards = (page: import('@playwright/test').Page) => page.locator('.react-flow__node-page');
const labels = (page: import('@playwright/test').Page) =>
  page.locator('.react-flow__node-columnLabel');

async function openBoard(page: import('@playwright/test').Page) {
  await page.goto(`/s/${SLIDE}/board`);
  await expect(cards(page)).toHaveCount(3);
}

type Request = import('@playwright/test').APIRequestContext;

async function seedColumns(request: Request, columns: { title: string; size: number }[]) {
  const res = await request.put('/__board', { data: { slideId: SLIDE, columns } });
  expect(res.ok()).toBe(true);
}

async function readColumns(request: Request, pages = 3) {
  const res = await request.get(`/__board?slideId=${SLIDE}&pages=${pages}`);
  const body = (await res.json()) as { columns?: { title: string; size: number }[] };
  return body.columns ?? [];
}

async function readEntries(request: Request) {
  const res = await request.get(`/__board/entries?slideId=${SLIDE}`);
  const body = (await res.json()) as { entries?: string[] | null };
  return body.entries;
}

/**
 * Drags a React Flow node by `dx` screen pixels. `fromLeft` starts the drag
 * that far from the node's left edge — a chapter label is only draggable by its
 * grip, since its title and buttons carry `nodrag`.
 */
async function dragBy(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
  dx: number,
  fromLeft?: number,
) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('node is not on screen');
  const x = fromLeft === undefined ? box.x + box.width / 2 : box.x + fromLeft;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(x + (dx * step) / 10, y);
  }
  await page.mouse.up();
}

test.describe('story board structure', () => {
  test.beforeEach(async ({ request }) => {
    await duplicateSlide(request, 'alpha', SLIDE);
    const res = await request.put('/__board/cards', {
      data: { slideId: SLIDE, cards: {}, links: [] },
    });
    expect(res.ok()).toBe(true);
    await seedColumns(request, [
      { title: 'Opening', size: 2 },
      { title: 'Closing', size: 1 },
    ]);
  });

  test.afterEach(async ({ request }) => {
    await deleteSlide(request, SLIDE);
  });

  test('adds a chapter, undoes it, and redoes it', async ({ page, request }) => {
    await openBoard(page);
    await expect(labels(page)).toHaveCount(2);

    await page.locator('header').getByRole('button', { name: 'Add a chapter' }).click();
    await expect(labels(page)).toHaveCount(3);
    expect((await readColumns(request)).map((c) => c.title)).toEqual([
      'Opening',
      'Closing',
      'New chapter',
    ]);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(labels(page)).toHaveCount(2);
    expect((await readColumns(request)).map((c) => c.title)).toEqual(['Opening', 'Closing']);

    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(labels(page)).toHaveCount(3);
  });

  test('folds a deleted chapter into the one before it', async ({ page, request }) => {
    await openBoard(page);
    await labels(page).nth(1).getByRole('button', { name: 'Delete this chapter' }).click();

    await expect(labels(page)).toHaveCount(1);
    const columns = await readColumns(request);
    expect(columns).toEqual([{ title: 'Opening', size: 3 }]);
    await expect(cards(page)).toHaveCount(3);
  });

  test('moving a chapter carries its pages with it', async ({ page, request }) => {
    await openBoard(page);
    const before = await readEntries(request);
    expect(before).toEqual(['One', 'Two', 'Three']);

    const box = await labels(page).nth(1).boundingBox();
    if (!box) throw new Error('chapter label is not on screen');
    await dragBy(page, labels(page).nth(1), -(box.width + 88), 8);

    await expect.poll(async () => (await readEntries(request))?.join(',')).toBe('Three,One,Two');
    expect((await readColumns(request)).map((c) => c.title)).toEqual(['Closing', 'Opening']);
  });

  test('folds a chapter away and back without touching the deck', async ({ page, request }) => {
    await openBoard(page);
    const before = await readEntries(request);

    await labels(page).nth(0).getByRole('button', { name: 'Fold this chapter' }).click();
    await expect(cards(page)).toHaveCount(1);
    // The label stays behind with its page count, so the chapter is not lost.
    await expect(labels(page)).toHaveCount(2);
    await expect(labels(page).nth(0)).toContainText('02');

    await labels(page).nth(0).getByRole('button', { name: 'Unfold this chapter' }).click();
    await expect(cards(page)).toHaveCount(3);
    expect(await readEntries(request)).toEqual(before);
    expect((await readColumns(request)).map((c) => c.size)).toEqual([2, 1]);
  });

  test('drops a card into the gap between chapters to start a chapter of its own', async ({
    page,
    request,
  }) => {
    await openBoard(page);
    const first = await labels(page).nth(0).boundingBox();
    const second = await labels(page).nth(1).boundingBox();
    const card = await cards(page).nth(0).boundingBox();
    if (!first || !second || !card) throw new Error('the board is not laid out');

    const gapCentre = (first.x + first.width + second.x) / 2;
    await dragBy(page, cards(page).nth(0), gapCentre - (card.x + card.width / 2));

    await expect.poll(async () => (await readEntries(request))?.join(',')).toBe('Two,One,Three');
    expect((await readColumns(request)).map((c) => [c.title, c.size])).toEqual([
      ['Opening', 1],
      ['New chapter', 1],
      ['Closing', 1],
    ]);
  });

  test('selects two cards, marks them done, deletes them and takes it back', async ({
    page,
    request,
  }) => {
    await openBoard(page);
    await cards(page).nth(0).click();
    await cards(page)
      .nth(1)
      .click({ modifiers: ['Shift'] });
    await expect(page.getByText('2 selected')).toBeVisible();

    await page.getByRole('button', { name: 'Status', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Done' }).click();
    await expect
      .poll(async () => {
        const res = await request.get(`/__board/cards?slideId=${SLIDE}`);
        const body = (await res.json()) as { cards?: Record<string, { status?: string }> };
        return Object.keys(body.cards ?? {}).sort();
      })
      .toEqual(['One', 'Two']);

    await page.keyboard.press('Delete');
    await expect(page.getByRole('dialog')).toContainText('Delete 2 pages?');
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(cards(page)).toHaveCount(1);
    await expect.poll(async () => (await readEntries(request))?.length).toBe(1);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(cards(page)).toHaveCount(3);
    await expect.poll(async () => (await readEntries(request))?.join(',')).toBe('One,Two,Three');

    const res = await request.get(`/__board/cards?slideId=${SLIDE}`);
    const body = (await res.json()) as { cards?: Record<string, { status?: string }> };
    expect(body.cards?.One?.status).toBe('done');
    expect(body.cards?.Two?.status).toBe('done');
  });

  test('duplicates every selected card and takes the copies back', async ({ page, request }) => {
    await openBoard(page);
    await cards(page).nth(0).click();
    await cards(page).nth(1).click({ modifiers: ['Shift'] });
    await expect(page.getByText('2 selected')).toBeVisible();

    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(cards(page)).toHaveCount(5);
    await expect.poll(async () => (await readEntries(request))?.length).toBe(5);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(cards(page)).toHaveCount(3);
    await expect.poll(async () => (await readEntries(request))?.join(',')).toBe('One,Two,Three');
    expect((await readColumns(request)).map((c) => c.size)).toEqual([2, 1]);
  });

  test('switches between the three card sizes', async ({ page }) => {
    await openBoard(page);
    const first = cards(page).first();
    const width = async () => (await first.boundingBox())?.width ?? 0;
    const height = async () => (await first.boundingBox())?.height ?? 0;

    const largeWidth = await width();
    expect(largeWidth).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Small cards' }).click();
    await expect.poll(width).toBeLessThan(largeWidth * 0.8);

    const smallHeight = await height();
    await page.getByRole('button', { name: 'Titles only' }).click();
    await expect.poll(height).toBeLessThan(smallHeight * 0.6);

    await page.getByRole('button', { name: 'Large cards' }).click();
    await expect.poll(width).toBeGreaterThan(largeWidth * 0.95);
  });

  test('dims the cards a filter does not pick out', async ({ page, request }) => {
    const seeded = await request.put('/__board/cards', {
      data: { slideId: SLIDE, cards: { One: { status: 'done' } }, links: [] },
    });
    expect(seeded.ok()).toBe(true);
    await openBoard(page);

    await page.getByRole('button', { name: 'Filter' }).click();
    await page.getByRole('menu').getByText('Done', { exact: true }).click();
    await page.keyboard.press('Escape');

    const opacity = async (n: number) =>
      Number.parseFloat(
        (await cards(page)
          .nth(n)
          .locator('.osd-board-card')
          .evaluate((el) => getComputedStyle(el).opacity)) ?? '1',
      );

    await expect.poll(() => opacity(0)).toBe(1);
    await expect.poll(() => opacity(1)).toBeLessThan(0.5);
    // Both cards are still there: a filter never hides or reorders.
    await expect(cards(page)).toHaveCount(3);
  });

  test('opens the board with b from the assets view', async ({ page }) => {
    await openSlide(page, SLIDE);
    await page.getByRole('tab', { name: /assets/i }).click();
    await expect(editorCanvas(page)).toBeHidden();
    await page.keyboard.press('b');
    await expect(page).toHaveURL(new RegExp(`/s/${SLIDE}/board$`));
    await expect(cards(page)).toHaveCount(3);
  });
});
