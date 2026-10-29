import { lazy, Suspense } from 'react';
import { Route } from 'react-router-dom';
import { NotFound } from './chrome/not-found';
import { isFeatureEnabled } from './features';
import { LemonRiverHome } from './home/home-page';
import { SettingsPage } from './settings/settings-page';
import { TrashPage } from './trash/trash-page';

const BoardPage = lazy(() => import('./board/board-page').then((m) => ({ default: m.Board })));

/** Routes of our own, outside the home shell. Placed before the official catch-all. */
export function lemonRiverRoutes() {
  return [
    isFeatureEnabled('board') && (
      <Route
        key="board"
        path="/s/:slideId/board"
        element={
          <Suspense fallback={null}>
            <BoardPage />
          </Suspense>
        }
      />
    ),
    <Route key="not-found" path="*" element={<NotFound />} />,
  ];
}

/** Pages inside the home shell. Placed before the official home route, which they replace. */
export function lemonRiverShellRoutes() {
  return [
    <Route key="home" path="/" element={<LemonRiverHome />} />,
    isFeatureEnabled('settings') && (
      <Route key="settings" path="/settings" element={<SettingsPage />} />
    ),
    isFeatureEnabled('trash') && <Route key="trash" path="/trash" element={<TrashPage />} />,
  ];
}
