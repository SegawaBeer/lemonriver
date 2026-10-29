import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { devScratchDir, readSlideSource, slideSourcePath } from './helpers.ts';

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

type Sent = { text?: string };
type Mock = { sent: Sent[]; status: { value: 'idle' | 'running' } };

async function mockAgent(page: Page): Promise<Mock> {
  const sent: Sent[] = [];
  const status: Mock['status'] = { value: 'idle' };
  const ts = new Date().toISOString();
  const known = { slideId: '' };

  const session = () => ({
    id: 's-build',
    provider: 'claude',
    title: '',
    createdAt: ts,
    updatedAt: ts,
    status: status.value,
    slideId: known.slideId,
    providerSessionId: null,
    items: [],
  });

  await page.route('**/__agent/sessions/s-build/messages', async (route) => {
    sent.push(route.request().postDataJSON() as Sent);
    status.value = 'running';
    await route.fulfill({ status: 202, json: { ok: true } });
  });
  await page.route('**/__agent/sessions/s-build', (route) => route.fulfill({ json: session() }));
  await page.route('**/__agent/sessions', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { slideId: string };
      known.slideId = body.slideId;
      return route.fulfill({ json: session() });
    }
    return route.fulfill({
      json: { sessions: sent.length > 0 && status.value === 'running' ? [session()] : [] },
    });
  });

  return { sent, status };
}

function boardPath(slideId: string): string {
  return path.join(devScratchDir, '.open-slide', 'board', `${slideId}.json`);
}

type BuildFields = {
  state: string;
  built?: number;
  paused?: boolean;
  stage?: string;
  dispatched?: unknown;
  lastTurn?: unknown;
};

async function seedOutline(
  slideId: string,
  items: { title: string; kind: string }[],
  build: BuildFields = { state: 'ready' },
  outlineExtra: Record<string, unknown> = {},
  recordExtra: Record<string, unknown> = {},
): Promise<void> {
  const file = boardPath(slideId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    JSON.stringify({
      outline: {
        state: build.state,
        brief: BRIEF,
        pages: 8,
        files: [],
        items: items.map((item, i) => ({ id: `p${i + 1}`, ...item })),
        updatedAt: Date.now(),
        built: build.built ?? 0,
        paused: build.paused ?? false,
        stage: build.stage ?? 'pages',
        dispatched: build.dispatched ?? null,
        lastTurn: build.lastTurn ?? null,
        ...outlineExtra,
      },
      ...recordExtra,
    }),
  );
}

async function readOutline(slideId: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(boardPath(slideId), 'utf8');
  return (JSON.parse(raw) as { outline: Record<string, unknown> }).outline;
}

async function writeOutline(slideId: string, outline: Record<string, unknown>): Promise<void> {
  await fs.writeFile(boardPath(slideId), JSON.stringify({ outline }));
}

const created: string[] = [];

async function createDeck(request: Page['request']): Promise<string> {
  const res = await request.post('/__slides');
  expect(res.ok()).toBe(true);
  const { slideId } = (await res.json()) as { slideId: string };
  created.push(slideId);
  return slideId;
}

const pageItems = (count: number) => [
  { title: 'Cover', kind: 'cover' },
  ...Array.from({ length: count - 2 }, (_, i) => ({ title: `Point ${i + 1}`, kind: 'list' })),
  { title: 'Close', kind: 'end' },
];

const pendingRows = (page: Page) => page.locator('[data-lr-pending-page]');

test.describe('LemonRiver one-page-at-a-time build', () => {
  test.afterEach(async ({ page }) => {
    while (created.length > 0) {
      const slideId = created.pop();
      if (slideId) await page.request.delete(`/__slides/${slideId}`);
    }
  });

  test('the first turn writes page 1 and the team panel shows the helpers', async ({ page }) => {
    await agentReady(page);
    const mock = await mockAgent(page);
    const slideId = await createDeck(page.request);
    await seedOutline(slideId, pageItems(8), { state: 'ready' }, { files: ['costs.pdf'] });

    await page.goto(`/s/${slideId}/outline`);
    await page.getByRole('button', { name: 'Build from this outline' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slideId}$`));

    await expect.poll(() => mock.sent.length).toBe(1);
    expect(mock.sent[0].text).toContain('write page 1 only');
    expect(mock.sent[0].text).toContain('1. [cover] Cover');

    await page.reload();
    await expect(page.getByText('Laying out page 1')).toBeVisible();
    await expect(page.locator('[data-lr-helper="design"]')).toHaveAttribute(
      'data-lr-helper-state',
      'working',
    );
    await expect(page.locator('[data-lr-helper="research"]')).toHaveAttribute(
      'data-lr-helper-state',
      'done',
    );
    await expect(page.getByText('Read 1 files')).toBeVisible();
    await expect(page.getByText('Page 0 / 8')).toBeVisible();
  });

  test('the next turn writes page 2 and the rail loses one pending row', async ({ page }) => {
    await agentReady(page);
    const mock = await mockAgent(page);
    const slideId = await createDeck(page.request);
    await seedOutline(slideId, pageItems(8), { state: 'ready' });

    await page.goto(`/s/${slideId}/outline`);
    await page.getByRole('button', { name: 'Build from this outline' }).click();
    await expect.poll(() => mock.sent.length).toBe(1);
    await expect(pendingRows(page)).toHaveCount(8);

    const now = Date.now();
    await writeOutline(slideId, {
      ...(await readOutline(slideId)),
      built: 1,
      dispatched: null,
      lastTurn: { kind: 'page', n: 1, ok: true, at: now },
    });

    await expect.poll(() => mock.sent.length, { timeout: 15_000 }).toBe(2);
    expect(mock.sent[1].text).toContain('Page 2 of 8');
    expect(mock.sent[1].text).toContain('Write only this page');
    await expect(pendingRows(page)).toHaveCount(7);
    await expect(page.getByText('Page 1 / 8')).toBeVisible();
  });

  test('pausing holds the next page until the user continues', async ({ page }) => {
    await agentReady(page);
    const mock = await mockAgent(page);
    const slideId = await createDeck(page.request);
    await seedOutline(slideId, pageItems(8), { state: 'ready' });

    await page.goto(`/s/${slideId}/outline`);
    await page.getByRole('button', { name: 'Build from this outline' }).click();
    await expect.poll(() => mock.sent.length).toBe(1);

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByText('Paused. Continue when you are ready')).toBeVisible();

    await writeOutline(slideId, {
      ...(await readOutline(slideId)),
      built: 2,
      lastTurn: { kind: 'page', n: 2, ok: true, at: Date.now() },
    });

    await page.waitForTimeout(3000);
    expect(mock.sent).toHaveLength(1);

    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect.poll(() => mock.sent.length, { timeout: 15_000 }).toBe(2);
    expect(mock.sent[1].text).toContain('Page 3 of 8');
  });

  test('a stale step shows the interrupted banner and resumes the build', async ({ page }) => {
    await agentReady(page);
    const mock = await mockAgent(page);
    const slideId = await createDeck(page.request);
    await seedOutline(slideId, pageItems(8), { state: 'ready' });

    await page.goto(`/s/${slideId}/outline`);
    await page.getByRole('button', { name: 'Build from this outline' }).click();
    await expect.poll(() => mock.sent.length).toBe(1);

    await writeOutline(slideId, {
      ...(await readOutline(slideId)),
      built: 1,
      dispatched: { kind: 'page', n: 2, at: Date.now() - 5 * 60_000 },
    });
    mock.status.value = 'idle';
    await page.reload();

    await expect(page.locator('[data-lr-build-interrupted]')).toBeVisible();
    await expect(page.getByText('Stopped at page 2').first()).toBeVisible();
    await expect(page.getByText('The first 1 pages are saved.')).toBeVisible();

    await page.getByRole('button', { name: 'Continue building' }).click();
    await expect.poll(() => mock.sent.length, { timeout: 15_000 }).toBe(2);
    expect(mock.sent[1].text).toContain('Page 2 of 8');
  });

  test('the finished deck offers undo back to the outline and restores the slide', async ({
    page,
  }) => {
    await agentReady(page);
    await mockAgent(page);
    const slideId = await createDeck(page.request);
    const original = await readSlideSource(slideId);
    const built = `${original}\n// built by the agent\n`;
    await fs.writeFile(slideSourcePath(slideId), built);
    await seedOutline(
      slideId,
      pageItems(2),
      {
        state: 'built',
        built: 2,
        stage: 'review',
        lastTurn: { kind: 'review', n: 0, ok: true, at: Date.now() },
      },
      {},
      { buildBackup: original },
    );
    await page.addInitScript(() => localStorage.setItem('open-slide:agent-dock', '1'));

    await page.goto(`/s/${slideId}`);
    await expect(page.getByText('2 pages are ready').first()).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();

    await expect(page).toHaveURL(new RegExp(`/s/${slideId}/outline$`));
    expect(await readSlideSource(slideId)).toBe(original);
    expect(await readOutline(slideId)).toMatchObject({ state: 'ready', built: 0 });
    const record = JSON.parse(await fs.readFile(boardPath(slideId), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(record.buildBackup).toBeUndefined();
  });

  test('the reader mascot gets a soft glow in dark mode', async ({ page }) => {
    await agentReady(page);
    await mockAgent(page);
    const slideId = await createDeck(page.request);
    await seedOutline(slideId, pageItems(4), {
      state: 'building',
      lastTurn: { kind: 'page', n: 1, ok: true, at: Date.now() },
      paused: true,
      built: 1,
    });
    await page.addInitScript(() => {
      localStorage.setItem('open-slide:agent-dock', '1');
      localStorage.setItem('theme', 'dark');
    });

    await page.goto(`/s/${slideId}`);
    await expect(page.locator('[data-lr-helper="research"]')).toHaveCSS('filter', /drop-shadow/);
  });
});
