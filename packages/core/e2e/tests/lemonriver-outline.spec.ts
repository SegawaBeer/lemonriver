import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { devScratchDir } from './helpers.ts';

type ProviderStatus = { id: string; cliFound: boolean; ready: boolean };

const BRIEF = 'Walk new hires through the expense process';

async function agentReady(page: Page): Promise<void> {
  await page.route('**/__agent/status', async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { providers: ProviderStatus[] };
    await route.fulfill({
      json: {
        ...body,
        providers: body.providers.map((p) =>
          p.id === 'claude' ? { ...p, ready: true } : { ...p, cliFound: false },
        ),
      },
    });
  });
}

async function mockAgent(page: Page, sent: { text?: string }[]): Promise<void> {
  const ts = new Date().toISOString();
  await page.route('**/__agent/sessions', (route) => {
    if (route.request().method() !== 'POST') {
      return route.fulfill({ json: { sessions: [] } });
    }
    const { slideId } = route.request().postDataJSON() as { slideId: string };
    return route.fulfill({
      json: {
        id: 's-outline',
        provider: 'claude',
        title: '',
        createdAt: ts,
        updatedAt: ts,
        status: 'idle',
        slideId,
        providerSessionId: null,
        items: [],
      },
    });
  });
  await page.route('**/__agent/sessions/s-outline/messages', (route) => {
    sent.push(route.request().postDataJSON() as { text?: string });
    return route.fulfill({ status: 202, json: { ok: true } });
  });
}

async function seedOutline(
  slideId: string,
  items: { title: string; kind: string }[],
): Promise<void> {
  const file = path.join(devScratchDir, '.open-slide', 'board', `${slideId}.json`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    JSON.stringify({
      outline: {
        state: 'ready',
        brief: BRIEF,
        pages: 8,
        files: [],
        items: items.map((item, i) => ({ id: `p${i + 1}`, ...item })),
        updatedAt: Date.now(),
      },
    }),
  );
}

async function createDeck(request: Page['request']): Promise<string> {
  const res = await request.post('/__slides');
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { slideId: string }).slideId;
}

const rows = (page: Page) => page.locator('[data-lr-outline-row]');

test.describe('LemonRiver guided outline', () => {
  test('the home brief opens the describe page with the sentence filled in', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Describe a new deck').fill(BRIEF);
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page).toHaveURL(/\/new$/);
    await expect(page.getByLabel('What are you presenting today?')).toHaveValue(BRIEF);
    await expect(page.getByRole('radio', { name: '8' })).toHaveAttribute('aria-checked', 'true');
  });

  test('a file over 25 MB blocks the start until it is removed', async ({ page }) => {
    await agentReady(page);
    await page.goto('/new');
    await page.getByLabel('What are you presenting today?').fill(BRIEF);
    await page.locator('input[type=file]').setInputFiles({
      name: 'big.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(30 * 1024 * 1024),
    });

    await expect(page.getByText('The file is over 25 MB')).toBeVisible();
    await expect(page.getByRole('button', { name: 'List outline' })).toBeDisabled();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText('The file is over 25 MB')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'List outline' })).toBeEnabled();
  });

  test('a locked Office file can be skipped', async ({ page }) => {
    await agentReady(page);
    await page.goto('/new');
    await page.getByLabel('What are you presenting today?').fill(BRIEF);
    await page.locator('input[type=file]').setInputFiles({
      name: 'locked.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    });

    await expect(page.getByText('locked.xlsx cannot be opened')).toBeVisible();
    await expect(page.getByRole('button', { name: 'List outline' })).toBeDisabled();
    await page.getByRole('button', { name: 'Skip this file' }).click();
    await expect(page.getByText('locked.xlsx cannot be opened')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'List outline' })).toBeEnabled();
  });

  test('listing the outline sends the brief and lands on the outline page', async ({
    page,
    request,
  }) => {
    await agentReady(page);
    const sent: { text?: string }[] = [];
    await mockAgent(page, sent);

    await page.goto('/new');
    await page.getByLabel('What are you presenting today?').fill(BRIEF);
    await page.getByRole('button', { name: 'List outline' }).click();

    await expect(page).toHaveURL(/\/s\/[^/]+\/outline$/);
    const slideId = new URL(page.url()).pathname.split('/')[2] ?? '';
    try {
      await expect.poll(() => sent.length).toBe(1);
      expect(sent[0].text).toContain(BRIEF);
      expect(sent[0].text).toContain('<lemonriver-outline>');
      await expect(page.getByText('Listing the outline…')).toBeVisible();
    } finally {
      expect((await request.delete(`/__slides/${slideId}`)).status()).toBe(200);
    }
  });

  test('the outline can be edited and the edits survive a reload', async ({ page, request }) => {
    await agentReady(page);
    const slideId = await createDeck(request);
    try {
      await seedOutline(slideId, [
        { title: 'Cover', kind: 'cover' },
        { title: 'Why now', kind: 'list' },
        { title: 'Numbers', kind: 'kpi' },
      ]);
      await page.goto(`/s/${slideId}/outline`);
      await expect(rows(page)).toHaveCount(3);

      await page.getByLabel('Title of page 2').fill('Why it matters');
      await page.getByRole('button', { name: 'Move up' }).nth(1).click();
      await page.getByRole('button', { name: 'Add page' }).click();
      await page.getByRole('button', { name: 'Delete this page' }).last().click();
      await page.waitForTimeout(1200);

      await page.reload();
      await expect(rows(page)).toHaveCount(3);
      await expect(page.getByLabel('Title of page 1')).toHaveValue('Why it matters');
      await expect(page.getByLabel('Title of page 2')).toHaveValue('Cover');
      await expect(page.getByLabel('Title of page 3')).toHaveValue('Numbers');
    } finally {
      expect((await request.delete(`/__slides/${slideId}`)).status()).toBe(200);
    }
  });

  test('building sends the outline to the agent and opens the editor', async ({
    page,
    request,
  }) => {
    await agentReady(page);
    const sent: { text?: string }[] = [];
    await mockAgent(page, sent);
    const slideId = await createDeck(request);
    try {
      await seedOutline(slideId, [
        { title: 'Cover', kind: 'cover' },
        { title: 'Why now', kind: 'list' },
      ]);
      await page.goto(`/s/${slideId}/outline`);
      await expect(rows(page)).toHaveCount(2);
      await page.getByRole('button', { name: 'Build from this outline' }).click();

      await expect.poll(() => sent.length).toBe(1);
      expect(sent[0].text).toContain('"title":"Cover"');
      await expect(page).toHaveURL(new RegExp(`/s/${slideId}$`));
    } finally {
      expect((await request.delete(`/__slides/${slideId}`)).status()).toBe(200);
    }
  });
});
