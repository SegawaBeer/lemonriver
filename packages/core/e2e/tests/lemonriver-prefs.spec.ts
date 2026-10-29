import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { devScratchDir } from './helpers.ts';

type ProviderStatus = { id: string; cliFound: boolean; ready: boolean };

const BRIEF = 'Walk new hires through the expense process';
const PREFS_KEY = 'lemonriver:agent-prefs';

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
    id: 's-prefs',
    provider: 'claude',
    title: '',
    createdAt: ts,
    updatedAt: ts,
    status: status.value,
    slideId: known.slideId,
    providerSessionId: null,
    items: [],
  });

  await page.route('**/__agent/sessions/s-prefs/messages', async (route) => {
    sent.push(route.request().postDataJSON() as Sent);
    status.value = 'running';
    await route.fulfill({ status: 202, json: { ok: true } });
  });
  await page.route('**/__agent/sessions/s-prefs', (route) => route.fulfill({ json: session() }));
  await page.route('**/__agent/sessions', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { slideId: string };
      known.slideId = body.slideId;
      return route.fulfill({ json: session() });
    }
    return route.fulfill({ json: { sessions: known.slideId ? [session()] : [] } });
  });

  return { sent, status };
}

async function mockReviewQuestion(page: Page, slideId: string): Promise<void> {
  const ts = new Date().toISOString();
  const session = {
    id: 's-review',
    provider: 'claude',
    title: '',
    createdAt: ts,
    updatedAt: ts,
    status: 'idle',
    slideId,
    providerSessionId: null,
    items: [
      {
        kind: 'assistant',
        id: 'a1',
        ts,
        text: 'Two files give different numbers for the launch share.',
        streaming: false,
      },
      {
        kind: 'question',
        id: 'q1',
        ts,
        questions: [
          {
            header: 'Numbers',
            question: 'Which share is right?',
            options: [{ label: '38%' }, { label: '41%' }],
            multiSelect: false,
          },
        ],
        answers: null,
        status: 'pending',
      },
    ],
  };
  await page.route('**/__agent/sessions', (route) =>
    route.fulfill({ json: { sessions: [session] } }),
  );
  await page.route('**/__agent/sessions/s-review', (route) => route.fulfill({ json: session }));
  await page.route('**/__agent/sessions/s-review/messages', (route) =>
    route.fulfill({ status: 202, json: { ok: true } }),
  );
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

test.describe('LemonRiver agent preferences', () => {
  test.afterEach(async ({ page }) => {
    while (created.length > 0) {
      const slideId = created.pop();
      if (slideId) await page.request.delete(`/__slides/${slideId}`);
    }
  });

  test('the settings page keeps the preferences across a reload', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Agent preferences' })).toBeVisible();

    const perPage = page.getByRole('switch', { name: 'Wait for me after each page' });
    await perPage.click();
    await expect(perPage).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Light and friendly', exact: true }).click();
    await page.getByRole('button', { name: 'More content', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Light and friendly' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.reload();
    await expect(page.getByRole('switch', { name: 'Wait for me after each page' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Light and friendly' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'More content' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('the preferences reach the agent on both steps', async ({ page }) => {
    await agentReady(page);
    const mock = await mockAgent(page);
    await page.addInitScript((key) => {
      localStorage.setItem('lemonriver:onboarded', '1');
      localStorage.setItem('open-slide:agent-dock', '1');
      localStorage.setItem(key, JSON.stringify({ research: 'web', design: 'dense' }));
    }, PREFS_KEY);

    await page.goto('/new');
    await page.getByLabel('What are you presenting today?').fill(BRIEF);
    await page.getByRole('button', { name: 'List outline' }).click();

    await expect(page).toHaveURL(/\/s\/[^/]+\/outline$/);
    const slideId = new URL(page.url()).pathname.split('/')[2] ?? '';
    created.push(slideId);
    await expect.poll(() => mock.sent.length).toBe(1);
    expect(mock.sent[0].text).toContain('look up facts');
    const drafted = await readOutline(slideId);
    expect((drafted.prefs as { design?: string }).design).toBe('dense');
    expect((drafted.prefs as { research?: string }).research).toBe('web');

    mock.status.value = 'idle';
    await writeOutline(slideId, {
      ...drafted,
      state: 'building',
      built: 0,
      paused: false,
      stage: 'pages',
      dispatched: null,
      lastTurn: null,
      items: pageItems(3).map((item, i) => ({ id: `p${i + 1}`, ...item })),
      updatedAt: Date.now(),
    });

    await page.goto(`/s/${slideId}`);
    await expect.poll(() => mock.sent.length, { timeout: 15_000 }).toBe(2);
    expect(mock.sent[1].text).toContain('more text and data');
  });

  test('a check after each page waits for Continue, then sends the next one', async ({ page }) => {
    await agentReady(page);
    const mock = await mockAgent(page);
    const slideId = await createDeck(page.request);
    await seedOutline(
      slideId,
      pageItems(8),
      {
        state: 'building',
        built: 1,
        paused: true,
        stage: 'pages',
        lastTurn: { kind: 'page', n: 1, ok: true, at: Date.now() },
      },
      { prefs: { confirmEachPage: true } },
    );
    await page.addInitScript(() => localStorage.setItem('open-slide:agent-dock', '1'));

    await page.goto(`/s/${slideId}`);
    await expect(page.getByText('Page 1 is done — check it, then press Continue')).toBeVisible();
    expect(mock.sent).toHaveLength(0);

    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect.poll(() => mock.sent.length, { timeout: 15_000 }).toBe(1);
    expect(mock.sent[0].text).toContain('Page 2 of 8');
  });

  test('a question during the review wears the review header', async ({ page }) => {
    await agentReady(page);
    const slideId = await createDeck(page.request);
    await seedOutline(slideId, pageItems(4), {
      state: 'building',
      built: 4,
      stage: 'review',
      dispatched: { kind: 'review', n: 0, at: Date.now() },
    });
    await mockReviewQuestion(page, slideId);
    await page.addInitScript(() => {
      localStorage.setItem('open-slide:agent-dock', '1');
      localStorage.setItem('open-slide:agent-session', 's-review');
    });

    await page.goto(`/s/${slideId}`);
    await expect(page.getByText('Review needs your call')).toBeVisible();
    await expect(page.getByText('Which share is right?')).toBeVisible();
    await expect(page.getByText('Waiting for your answer', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);
    const option = page.locator('[data-lr-confirm] button[aria-pressed]').first();
    await expect(option).toHaveCSS('border-radius', '12px');
  });

  test('a direct outline hands the deck to the editor on its own', async ({ page }) => {
    await agentReady(page);
    const mock = await mockAgent(page);
    const slideId = await createDeck(page.request);
    await seedOutline(
      slideId,
      pageItems(8),
      { state: 'building', built: 0, stage: 'pages' },
      { prefs: { outline: 'direct' } },
    );

    await page.goto(`/s/${slideId}/outline`);
    await expect(page).toHaveURL(new RegExp(`/s/${slideId}$`));
    await expect.poll(() => mock.sent.length, { timeout: 15_000 }).toBe(1);
    expect(mock.sent[0].text).toContain('write page 1 only');
  });

  test('the welcome walks three screens and picks the tone', async ({ page }) => {
    await page.goto('/new');
    await expect(page.getByText('You bring the topic; Lemon writes the deck')).toBeVisible();

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('One Lemon, four helpers')).toBeVisible();

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('What will you mostly present?')).toBeVisible();
    await page.getByRole('button', { name: 'Lecture notes', exact: true }).click();
    await page.getByRole('button', { name: 'Get started', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Light and friendly' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.goto('/new');
    await expect(page.getByText('You bring the topic; Lemon writes the deck')).toHaveCount(0);
  });

  test('skipping the welcome keeps the default tone', async ({ page }) => {
    await page.goto('/new');
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Steady and professional' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
