import { expect, type Page, test } from '@playwright/test';

const CHECK = '**/__update-check';
const UPDATE = '**/__update-package';

type CheckBody = { current: string; latest: string | null; outdated: boolean };

const NEWER: CheckBody = { current: '0.3.0', latest: '9.9.9', outdated: true };

async function mockCheck(page: Page, read: () => CheckBody, onRequest?: () => void): Promise<void> {
  await page.route(CHECK, (route) => {
    onRequest?.();
    return route.fulfill({ json: read() });
  });
}

test.describe('LemonRiver update prompt', () => {
  test('announces a newer version with update and later', async ({ page }) => {
    await mockCheck(page, () => NEWER);
    await page.goto('/');
    await expect(page.getByText('LemonRiver 9.9.9 is available')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update now' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Later' })).toBeVisible();
  });

  test('Later silences the same version, but a newer one speaks up again', async ({ page }) => {
    let check: CheckBody = NEWER;
    let served = 0;
    await mockCheck(
      page,
      () => check,
      () => {
        served += 1;
      },
    );

    await page.goto('/');
    await expect(page.getByText('LemonRiver 9.9.9 is available')).toBeVisible();
    await page.getByRole('button', { name: 'Later' }).click();
    await expect(page.getByText('LemonRiver 9.9.9 is available')).toHaveCount(0);

    const before = served;
    await page.reload();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    await expect.poll(() => served).toBeGreaterThan(before);
    await expect(page.getByText('LemonRiver 9.9.9 is available')).toHaveCount(0);

    check = { ...NEWER, latest: '9.9.10' };
    await page.reload();
    await expect(page.getByText('LemonRiver 9.9.10 is available')).toBeVisible();
  });

  test('Update now installs once and reports the result', async ({ page }) => {
    await mockCheck(page, () => NEWER);
    let posts = 0;
    await page.route(UPDATE, (route) => {
      posts += 1;
      return route.fulfill({ json: {} });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Update now' }).click();
    await expect(page.getByText('Updated to 9.9.9')).toBeVisible();
    expect(posts).toBe(1);
  });

  test('a failed update offers a retry', async ({ page }) => {
    await mockCheck(page, () => NEWER);
    await page.route(UPDATE, (route) => route.fulfill({ status: 500, json: { error: 'nope' } }));

    await page.goto('/');
    await page.getByRole('button', { name: 'Update now' }).click();
    await expect(page.getByText("The update didn't go through")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.getByText('Updated to 9.9.9')).toHaveCount(0);
  });

  test('stays quiet when the installed version is current', async ({ page }) => {
    let served = 0;
    await mockCheck(
      page,
      () => ({ current: '0.3.0', latest: '0.3.0', outdated: false }),
      () => {
        served += 1;
      },
    );

    await page.goto('/');
    await expect.poll(() => served).toBeGreaterThan(0);
    await expect(page.getByText(/is available$/)).toHaveCount(0);
  });

  test('the capture pages never ask', async ({ page }) => {
    let served = 0;
    await mockCheck(
      page,
      () => NEWER,
      () => {
        served += 1;
      },
    );

    await page.goto('/s/alpha/preview?p=1');
    await expect(page.locator('[data-osd-preview]')).toHaveAttribute('data-osd-preview', 'ready');
    expect(served).toBe(0);

    await page.goto('/s/alpha/presenter');
    await expect(page.getByText('Presenter')).toBeVisible({ timeout: 30_000 });
    expect(served).toBe(0);
  });

  test('marks the sidebar version as Beta', async ({ page }) => {
    await mockCheck(page, () => ({ current: '0.3.0', latest: null, outdated: false }));
    await page.goto('/');
    await expect(page.getByText('Beta', { exact: true }).first()).toBeVisible();
  });
});
