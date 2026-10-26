import { lazy, Suspense } from 'react';
import { Route } from 'react-router-dom';
import { isFeatureEnabled } from './features';

const BoardPage = lazy(() => import('./board/board-page').then((m) => ({ default: m.Board })));

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
  ];
}
