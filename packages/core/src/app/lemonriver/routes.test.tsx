import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./features', () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock('./chrome/not-found', () => ({ NotFound: () => null }));
vi.mock('./home/home-page', () => ({ LemonRiverHome: () => null }));
vi.mock('./settings/settings-page', () => ({ SettingsPage: () => null }));
vi.mock('./trash/trash-page', () => ({ TrashPage: () => null }));

import { isFeatureEnabled } from './features';
import { lemonRiverRoutes, lemonRiverShellRoutes } from './routes';

const paths = (routes: unknown[]) =>
  routes.filter(Boolean).map((r) => (r as ReactElement<{ path: string }>).props.path);

describe('lemonRiverRoutes', () => {
  it('adds the board and the not-found page', () => {
    expect(paths(lemonRiverRoutes())).toEqual(['/s/:slideId/board', '*']);
  });

  it('drops the board when the feature is off', () => {
    vi.mocked(isFeatureEnabled).mockReturnValue(false);
    expect(paths(lemonRiverRoutes())).toEqual(['*']);
    vi.mocked(isFeatureEnabled).mockReturnValue(true);
  });
});

describe('lemonRiverShellRoutes', () => {
  it('puts our home first, then settings and trash', () => {
    expect(paths(lemonRiverShellRoutes())).toEqual(['/', '/settings', '/trash']);
  });

  it('leaves out the pages whose feature is off', () => {
    vi.mocked(isFeatureEnabled).mockImplementation((id) => id !== 'trash');
    expect(paths(lemonRiverShellRoutes())).toEqual(['/', '/settings']);
  });
});
