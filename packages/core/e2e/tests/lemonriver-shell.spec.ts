import { expect, type Page, test } from '@playwright/test';
import { deleteSlide, duplicateSlide, openSlide, TINY_PNG } from './helpers.ts';

test.describe('LemonRiver themes', () => {
  test('the theme menu offers lime, and lime stays off the editor', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await page.getByRole('menuitem', { name: 'Lime' }).click();
    const html = page.locator('html');
    await expect(html).toHaveClass(/lime/);
    await expect(html).toHaveAttribute('data-lr-brand', '');
    await expect(html).toHaveCSS('background-image', /linear-gradient/);

    await openSlide(page, 'alpha');
    await expect(html).not.toHaveAttribute('data-lr-brand');
    await expect(page.locator('main[data-inspector-root]')).toHaveCSS(
      'background-color',
      'rgb(238, 243, 229)',
    );

    await page.reload();
    await expect(html).toHaveClass(/lime/);
    await expect(html).not.toHaveAttribute('data-lr-brand');
  });

  test('the command menu switches to lime', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open command menu' })).toBeVisible();
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByPlaceholder('Search slides or run a command').fill('theme lime');
    await page.getByRole('option', { name: 'Theme: Lime' }).click();
    await expect(page.locator('html')).toHaveClass(/lime/);
  });

  test('Present is the primary button and slides keep their font', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
    await openSlide(page, 'alpha');
    await expect(page.getByRole('button', { name: 'Present', exact: true })).toHaveCSS(
      'background-color',
      'rgb(252, 216, 16)',
    );
    await expect(page.locator('main[data-inspector-root] [data-osd-canvas]')).toHaveCSS(
      'font-family',
      /^"Geist Variable"/,
    );
    await expect(page.locator('body')).toHaveCSS('font-family', /^-apple-system/);
  });
});

test.describe('LemonRiver settings', () => {
  test('picks a theme from its card and keeps reduce motion across reloads', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const themes = page.getByRole('radiogroup', { name: 'Theme' });
    await themes.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(themes.getByRole('radio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    const motion = page.getByRole('switch', { name: 'Reduce motion' });
    await motion.click();
    await expect(motion).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-lr-reduce-motion', '');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-lr-reduce-motion', '');
    await page.getByRole('switch', { name: 'Reduce motion' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-lr-reduce-motion');
  });
});

test.describe('LemonRiver trash', () => {
  const SLIDE = 'lr-trash';
  const NAME = 'Alpha Deck (copy)';

  test.beforeEach(async ({ request }) => {
    await duplicateSlide(request, 'alpha', SLIDE);
  });

  test.afterEach(async ({ request }) => {
    const { entries } = (await (await request.get('/__lr/trash')).json()) as {
      entries: { id: string; slideId: string }[];
    };
    for (const entry of entries) {
      if (entry.slideId.startsWith(SLIDE)) await request.delete(`/__lr/trash/${entry.id}`);
    }
    await deleteSlide(request, SLIDE);
  });

  async function moveToTrash(page: Page) {
    const card = page.locator(`[data-lr-deck="${SLIDE}"]`);
    await expect(card.getByRole('heading', { name: NAME })).toBeVisible();
    await card.getByRole('button', { name: 'Slide actions' }).click();
    await page.getByRole('menuitem', { name: 'Move to trash' }).click();
    await expect(page.getByText(`Moved “${NAME}” to the trash`)).toBeVisible();
    await expect(card).toHaveCount(0);
  }

  test('a deleted deck can be brought back with undo', async ({ page, request }) => {
    await page.goto('/');
    await moveToTrash(page);
    const { entries } = (await (await request.get('/__lr/trash')).json()) as {
      entries: { slideId: string }[];
    };
    expect(entries.map((e) => e.slideId)).toContain(SLIDE);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByText(`Restored “${NAME}”`)).toBeVisible();
    await expect(
      page.locator(`[data-lr-deck="${SLIDE}"]`).getByRole('heading', { name: NAME }),
    ).toBeVisible();
  });

  test('the trash page restores and deletes for good', async ({ page }) => {
    await page.goto('/');
    await moveToTrash(page);

    await page.getByRole('button', { name: 'Trash', exact: true }).click();
    await expect(page).toHaveURL(/\/trash$/);
    const row = page.locator(`[data-lr-trash-entry="${SLIDE}"]`);
    await expect(row.getByText(NAME)).toBeVisible();
    await expect(row.getByText('30 days left')).toBeVisible();

    await row.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText(`Restored “${NAME}”`)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The trash is empty' })).toBeVisible();

    await page.goto('/');
    await moveToTrash(page);
    await page.goto('/trash');
    await row.getByRole('button', { name: 'Delete for good' }).click();
    const dialog = page.getByRole('dialog');
    const confirm = dialog.getByRole('button', { name: 'Delete for good' });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Slide name').fill('Alpha');
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Slide name').fill(NAME);
    await confirm.click();
    await expect(page.getByText(`Deleted “${NAME}” for good`)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The trash is empty' })).toBeVisible();
  });

  test('rejects ids that are not entries', async ({ request }) => {
    expect((await request.post('/__lr/trash', { data: { slideId: '../x' } })).status()).toBe(400);
    expect((await request.post('/__lr/trash', { data: { slideId: 'nope' } })).status()).toBe(404);
    expect((await request.delete('/__lr/trash/..')).status()).not.toBe(200);
    expect((await request.post('/__lr/trash/nope.1/restore')).status()).toBe(404);
  });
});

test.describe('LemonRiver home', () => {
  test('cards show the page count and when the deck was saved', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('[data-lr-deck="alpha"]');
    await expect(card.getByText(/^3 pages · /)).toBeVisible();
  });

  test('one sentence opens the guided flow with the sentence filled in', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lemonriver:onboarded', '1'));
    await page.goto('/');
    await page.getByLabel('Describe a new deck').fill('A talk on the expense process');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page).toHaveURL(/\/new$/);
    await expect(page.getByLabel('What are you presenting today?')).toHaveValue(
      'A talk on the expense process',
    );
  });

  test('unknown routes offer a way back', async ({ page }) => {
    await page.goto('/definitely-not-a-route');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to slides' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('an upload that is too large says so', async ({ page }) => {
    await page.route('**/__assets/@global/**', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 413, json: { error: 'file too large' } })
        : route.continue(),
    );
    await page.goto('/assets');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'lr-big.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    await expect(page.getByText('The file is over 25 MB')).toBeVisible();
  });
});
