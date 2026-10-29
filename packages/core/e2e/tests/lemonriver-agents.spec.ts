import { expect, type Page, test } from '@playwright/test';

const WORKBUDDY_MODELS = [
  { id: '', label: 'Client settings', efforts: [], clientEffort: null },
  { id: 'glm-5.1', label: 'GLM-5.1', efforts: [] },
  { id: 'kimi-k2.5', label: 'Kimi K2.5', efforts: [] },
];

const CLAUDE_MODELS = [
  { id: '', label: 'Opus 4.8', efforts: ['low', 'medium', 'high'], clientEffort: null },
];

type Row = {
  id: string;
  name: string;
  builtin: boolean;
  detected: boolean;
  connectable: boolean;
  reason: string | null;
};

function catalog(workbuddyDetected = true): Row[] {
  return [
    {
      id: 'claude',
      name: 'Claude Code',
      builtin: true,
      detected: true,
      connectable: true,
      reason: null,
    },
    { id: 'codex', name: 'Codex', builtin: true, detected: true, connectable: true, reason: null },
    {
      id: 'workbuddy',
      name: 'WorkBuddy',
      builtin: false,
      detected: workbuddyDetected,
      connectable: true,
      reason: null,
    },
    {
      id: 'dumate',
      name: 'DuMate',
      builtin: false,
      detected: true,
      connectable: false,
      reason: 'desktop-only',
    },
  ];
}

async function mockCatalog(page: Page, detected = true) {
  const puts: { enabled: string[] }[] = [];
  let enabled: string[] = [];
  await page.route('**/__lr/agent-providers', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as { enabled: string[] };
      enabled = body.enabled;
      puts.push(body);
      return route.fulfill({ json: { enabled } });
    }
    return route.fulfill({ json: { enabled, providers: catalog(detected) } });
  });
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
            sdkVersion: null,
            cliCommand: 'claude',
            cliFound: false,
            cliVersion: null,
            ready: false,
            models: [],
          },
        ],
      },
    }),
  );
  return { puts };
}

type Sent = { text?: string; model?: unknown };

async function mockPanel(page: Page) {
  const created: { provider?: string }[] = [];
  const sent: Sent[] = [];
  const ts = new Date().toISOString();
  const session: Record<string, unknown> = {
    id: 's-wb',
    provider: 'workbuddy',
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
            id: 'workbuddy',
            name: 'WorkBuddy',
            sdkPackage: '@anthropic-ai/claude-agent-sdk',
            sdkVersion: '0.0.0',
            cliCommand: 'codebuddy',
            cliFound: true,
            cliVersion: '2.147.0',
            ready: true,
            models: WORKBUDDY_MODELS,
          },
        ],
      },
    }),
  );

  await page.route('**/__agent/sessions/s-wb/messages', async (route) => {
    sent.push(route.request().postDataJSON() as Sent);
    await route.fulfill({ status: 202, json: { ok: true } });
  });
  await page.route('**/__agent/sessions/s-wb', (route) => route.fulfill({ json: session }));
  await page.route('**/__agent/sessions', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { provider?: string; slideId?: string };
      created.push(body);
      session.slideId = body.slideId ?? '';
      return route.fulfill({ json: session });
    }
    return route.fulfill({ json: { sessions: [] } });
  });

  return { created, sent };
}

test.describe('LemonRiver agent providers', () => {
  test.afterEach(async ({ page }) => {
    const id = page.url().match(/\/s\/([^/?#]+)/)?.[1];
    if (id) await page.request.delete(`/__slides/${id}`);
  });

  test('Settings switches WorkBuddy on and explains DuMate', async ({ page }) => {
    const { puts } = await mockCatalog(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible();

    await expect(page.locator('[data-lr-agent-switch="claude"]')).toBeDisabled();
    await expect(page.locator('[data-lr-agent-switch="claude"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    const workbuddy = page.locator('[data-lr-agent-switch="workbuddy"]');
    await expect(workbuddy).toBeEnabled();
    await workbuddy.click();
    await expect.poll(() => puts.length).toBe(1);
    expect(puts[0]?.enabled).toEqual(['workbuddy']);
    await expect(workbuddy).toHaveAttribute('aria-checked', 'true');

    const dumate = page.locator('[data-lr-agent-switch="dumate"]');
    await expect(dumate).toBeDisabled();
    await expect(page.locator('[data-lr-agent-state="dumate"]')).toContainText(
      'DuMate can’t be called from here yet',
    );
  });

  test('a provider that is not installed stays switched off', async ({ page }) => {
    await mockCatalog(page, false);
    await page.goto('/settings');
    const workbuddy = page.locator('[data-lr-agent-switch="workbuddy"]');
    await expect(workbuddy).toBeDisabled();
    await expect(page.locator('[data-lr-agent-state="workbuddy"]')).toContainText('Not found');
  });

  test('an enabled WorkBuddy appears in the panel and gets the message', async ({ page }) => {
    const mock = await mockPanel(page);
    await page.addInitScript(() => {
      localStorage.setItem('open-slide:agent-dock', '1');
      localStorage.setItem('open-slide:agent-provider', 'workbuddy');
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'New deck' }).click();
    await expect(page).toHaveURL(/\/s\/untitled[^/]*$/);
    const dock = page.locator('[data-agent-dock]');
    await expect(dock).toBeVisible();
    const panel = page.locator('[data-agent-provider]');
    await expect(panel).toHaveAttribute('data-agent-provider', 'workbuddy');

    await panel.getByRole('button', { name: /^Client settings/ }).click();
    const menu = page.locator('[data-agent-model-menu]');
    await expect(menu.getByRole('tab', { name: 'WorkBuddy' })).toBeVisible();
    await menu.getByRole('tab', { name: 'WorkBuddy' }).click();
    await menu.getByRole('button', { name: /^GLM-5\.1/ }).click();
    await page.keyboard.press('Escape');

    const box = dock.getByRole('textbox');
    await box.fill('Change the cover title to 你好');
    await box.press('Enter');

    await expect.poll(() => mock.sent.length).toBe(1);
    expect(mock.created[0]?.provider).toBe('workbuddy');
    expect(mock.sent[0]?.model).toBe('glm-5.1');
  });
});
