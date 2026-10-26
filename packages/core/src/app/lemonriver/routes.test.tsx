import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./features', () => ({ isFeatureEnabled: vi.fn(() => true) }));

import { isFeatureEnabled } from './features';
import { lemonRiverRoutes } from './routes';

describe('lemonRiverRoutes', () => {
  it('adds the board route when the feature is on', () => {
    const routes = lemonRiverRoutes();
    expect(routes).toHaveLength(1);
    const route = routes[0] as ReactElement<{ path: string }>;
    expect(route.props.path).toBe('/s/:slideId/board');
  });

  it('adds nothing when the feature is off', () => {
    vi.mocked(isFeatureEnabled).mockReturnValue(false);
    expect(lemonRiverRoutes()).toEqual([false]);
  });
});
