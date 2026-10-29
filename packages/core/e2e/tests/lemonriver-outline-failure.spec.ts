import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { devScratchDir } from './helpers.ts';

type ProviderStatus = { id: string; cliFound: boolean; ready: boolean };

const FAILURE = 'API Error: 502 status code (no body).';

function boardPath(slideId: string): string {
  return path.join(devScratchDir, '.open-slide', 'board', `${slideId}.json`);
}

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

async function mockFailedSession(page: Page, slideId: string): Promise<void> {
  const ts = new Date().toISOString();
  const summary = {
    id: 's-failed',
    provider: 'claude',
    title: '',
    createdAt: ts,
    updatedAt: ts,
    status: 'idle',
    slideId,
  };
  const items = [
    { kind: 'user', id: 'u1', ts, text: 'Plan the outline for a new deck.' },
    { kind: 'assistant', id: 'a1', ts, text: FAILURE, streaming: false },
    { kind: 'error', id: 'e1', ts, text: FAILURE },
    { kind: 'result', id: 'r1', ts, durationMs: null, costUsd: null, aborted: false },
  ];
  await page.route('**/__agent/sessions/s-failed', (route) =>
    route.fulfill({ json: { ...summary, providerSessionId: null, items } }),
  );
  await page.route('**/__agent/sessions', (route) =>
    route.fulfill({ json: { sessions: [summary] } }),
  );
}

test.describe('LemonRiver outline failure', () => {
  const created: string[] = [];

  test.afterEach(async ({ page }) => {
    while (created.length > 0) {
      const id = created.pop();
      if (!id) continue;
      await page.request.delete(`/__slides/${id}`);
      await fs.rm(boardPath(id), { force: true });
    }
  });

  test('says why the outline failed and links to the agent panel', async ({ page, request }) => {
    const res = await request.post('/__slides');
    expect(res.ok()).toBe(true);
    const { slideId } = (await res.json()) as { slideId: string };
    created.push(slideId);
    await fs.mkdir(path.dirname(boardPath(slideId)), { recursive: true });
    await fs.writeFile(
      boardPath(slideId),
      JSON.stringify({ outline: { state: 'failed', brief: '给新同事讲报销', pages: 8 } }),
    );

    await agentReady(page);
    await mockFailedSession(page, slideId);
    await page.addInitScript(() => {
      localStorage.setItem('open-slide:locale', 'zh-CN');
    });

    await page.goto(`/s/${slideId}/outline`);
    const reason = page.locator('[data-lr-outline-error]');
    await expect(reason).toContainText(FAILURE);
    await expect(reason).toHaveCSS('user-select', 'text');

    await page.getByRole('button', { name: '打开 Agent 面板看详情' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slideId}$`));
    await expect(page.locator('[data-agent-dock]')).toBeVisible();
  });
});
