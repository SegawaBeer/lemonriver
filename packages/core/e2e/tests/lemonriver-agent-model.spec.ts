import { expect, type Page, test } from '@playwright/test';

// Mirrors what the dev server reports once Claude Code's own settings are read:
// the first row stands for "use whatever the client is set to".
const CLAUDE_MODELS = [
  {
    id: '',
    label: 'Opus 4.8',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    clientEffort: 'xhigh',
  },
  { id: 'sonnet', label: 'Sonnet', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { id: 'haiku', label: 'Haiku', efforts: [] },
];

type Sent = { text?: string; model?: unknown; effort?: unknown };

type Mock = { sent: Sent[] };

async function mockAgent(page: Page): Promise<Mock> {
  const sent: Sent[] = [];
  const ts = new Date().toISOString();
  const session = {
    id: 's-model',
    provider: 'claude',
    title: '',
    createdAt: ts,
    updatedAt: ts,
    status: 'idle',
    slideId: '',
    providerSessionId: null,
    items: [],
  };

  await page.route('**/__agent/status', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        packageManager: 'npm',
        providers: [
          {
            id: 'claude',
            name: 'Claude Code',
            sdkPackage: '@anthropic-ai/claude-agent-sdk',
            sdkVersion: '0.0.0',
            cliCommand: 'claude',
            cliFound: true,
            cliVersion: '0.0.0',
            ready: true,
            models: CLAUDE_MODELS,
          },
          {
            id: 'codex',
            name: 'Codex',
            sdkPackage: '@openai/codex-sdk',
            sdkVersion: null,
            cliCommand: 'codex',
            cliFound: false,
            cliVersion: null,
            ready: false,
            models: [],
          },
        ],
      },
    }),
  );

  await page.route('**/__agent/sessions/s-model/messages', async (route) => {
    sent.push(route.request().postDataJSON() as Sent);
    await route.fulfill({ status: 202, json: { ok: true } });
  });
  await page.route('**/__agent/sessions/s-model', (route) => route.fulfill({ json: session }));
  await page.route('**/__agent/sessions', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { slideId?: string };
      session.slideId = body.slideId ?? '';
      return route.fulfill({ json: session });
    }
    return route.fulfill({ json: { sessions: [] } });
  });

  return { sent };
}

async function openDock(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New deck' }).click();
  await expect(page).toHaveURL(/\/s\/untitled[^/]*$/);
  const dock = page.locator('[data-agent-dock]');
  await expect(dock).toBeVisible();
  return dock;
}

async function sendText(dock: ReturnType<Page['locator']>, text: string) {
  const box = dock.getByRole('textbox');
  await box.fill(text);
  await box.press('Enter');
}

test.describe('LemonRiver agent model follows the client', () => {
  test.afterEach(async ({ page }) => {
    const id = page.url().match(/\/s\/([^/?#]+)/)?.[1];
    if (id) await page.request.delete(`/__slides/${id}`);
  });

  test('sends no model or effort until one is picked', async ({ page }) => {
    const mock = await mockAgent(page);
    const dock = await openDock(page);

    await expect(dock.getByRole('button', { name: /^Opus 4\.8/ })).toBeVisible();

    await sendText(dock, 'Walk new hires through expenses');
    await expect.poll(() => mock.sent.length).toBe(1);
    expect(mock.sent[0].model).toBeUndefined();
    expect(mock.sent[0].effort).toBeUndefined();

    await dock.getByRole('button', { name: /^Opus 4\.8/ }).click();
    const menu = page.locator('[data-agent-model-menu]');
    await expect(menu.getByText('client settings')).toBeVisible();
    await menu.getByRole('button', { name: /^Sonnet/ }).click();
    await menu.getByRole('button', { name: 'High', exact: true }).click();
    await page.keyboard.press('Escape');

    await sendText(dock, 'Keep going');
    await expect.poll(() => mock.sent.length).toBe(2);
    expect(mock.sent[1].model).toBe('sonnet');
    expect(mock.sent[1].effort).toBe('high');

    await dock.getByRole('button', { name: /^Sonnet/ }).click();
    await menu.getByRole('button', { name: /^Opus 4\.8/ }).click();
    await page.keyboard.press('Escape');

    await sendText(dock, 'Back to your settings');
    await expect.poll(() => mock.sent.length).toBe(3);
    expect(mock.sent[2].model).toBeUndefined();
    expect(mock.sent[2].effort).toBeUndefined();
  });
});
