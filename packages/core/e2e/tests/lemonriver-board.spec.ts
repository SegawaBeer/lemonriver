import { expect, test } from '@playwright/test';
import { deleteSlide, duplicateSlide, openSlide, readSlideSource } from './helpers.ts';

const SLIDE = 'lr-board';
const MEMO = 'Q3 numbers still missing';
const MEMO_LABEL = 'Work memo — stays on the board…';

async function openBoard(page: import('@playwright/test').Page) {
  await page.goto(`/s/${SLIDE}/board`);
  await expect(page.locator('.react-flow__node-page')).toHaveCount(3);
}

test.describe('story board', () => {
  test.beforeEach(async ({ request }) => {
    await duplicateSlide(request, 'alpha', SLIDE);
    const res = await request.put('/__board/cards', {
      data: { slideId: SLIDE, cards: {}, links: [] },
    });
    expect(res.ok()).toBe(true);
  });

  test.afterEach(async ({ request }) => {
    await deleteSlide(request, SLIDE);
  });

  test('opens with b and shows every page as a card', async ({ page }) => {
    await openSlide(page, SLIDE);
    await page.keyboard.press('b');
    await expect(page).toHaveURL(new RegExp(`/s/${SLIDE}/board$`));
    await expect(page.locator('.react-flow__node-page')).toHaveCount(3);
  });

  test('opens from the thumbnail rail button', async ({ page }) => {
    await openSlide(page, SLIDE);
    await page.getByRole('button', { name: 'Story board (B)' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${SLIDE}/board$`));
    await expect(page.locator('.react-flow__node-page')).toHaveCount(3);
  });

  test('keeps a work memo on the board, not in the deck', async ({ page, request }) => {
    await openBoard(page);
    const first = page.locator('.react-flow__node-page').first();
    await first.getByRole('button', { name: MEMO_LABEL }).click();
    const editor = page.getByRole('textbox', { name: MEMO_LABEL });
    await editor.fill(MEMO);
    await editor.press('Tab');

    await expect
      .poll(async () => {
        const res = await request.get(`/__board/cards?slideId=${SLIDE}`);
        const body = (await res.json()) as { cards?: Record<string, { memo?: string }> };
        return Object.values(body.cards ?? {}).map((card) => card.memo);
      })
      .toContain(MEMO);
    expect(await readSlideSource(SLIDE)).not.toContain(MEMO);
  });

  test('moves a card to the end and keeps its memo', async ({ page, request }) => {
    const seeded = await request.put('/__board/cards', {
      data: { slideId: SLIDE, cards: { One: { memo: MEMO } }, links: [] },
    });
    expect(seeded.ok()).toBe(true);
    await openBoard(page);
    const first = page.locator('.react-flow__node-page').first();

    await first.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to end' }).click();

    await expect
      .poll(async () => {
        const res = await request.get(`/__board/entries?slideId=${SLIDE}`);
        const body = (await res.json()) as { entries?: string[] | null };
        return body.entries;
      })
      .toEqual(['Two', 'Three', 'One']);

    const res = await request.get(`/__board/cards?slideId=${SLIDE}`);
    const body = (await res.json()) as { cards?: Record<string, { memo?: string }> };
    expect(body.cards?.One?.memo).toBe(MEMO);
  });

  test('adds a blank page from a column', async ({ page, request }) => {
    await openBoard(page);
    await page
      .getByRole('button', { name: /^Add a page to this column/ })
      .first()
      .click();

    await expect
      .poll(async () => {
        const res = await request.get(`/__board/entries?slideId=${SLIDE}`);
        const body = (await res.json()) as { entries?: string[] | null };
        return body.entries;
      })
      .toContain('NewPage1');
    const res = await request.get(`/__board/entries?slideId=${SLIDE}`);
    const body = (await res.json()) as { entries?: string[] | null };
    expect(body.entries).toHaveLength(4);
    await expect(page.locator('.react-flow__node-page')).toHaveCount(4);
    expect(await readSlideSource(SLIDE)).toContain('const NewPage1 =');
  });

  test('ignores b while the overview is open', async ({ page }) => {
    await openSlide(page, SLIDE);
    await page.keyboard.press('o');
    await page.keyboard.press('b');
    await expect(page).toHaveURL(new RegExp(`/s/${SLIDE}$`));
  });
});
