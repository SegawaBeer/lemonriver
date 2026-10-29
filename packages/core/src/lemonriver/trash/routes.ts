import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { SLIDE_ID_RE } from '../../editing/slide-ops.ts';
import { validateMutationRequest } from '../../http/request-guard.ts';
import { invalidateSlidesModule } from '../../vite/open-slide-plugin.ts';
import { recordWrite } from '../../vite/recent-writes.ts';
import { type ApiContext, json, readBody } from '../../vite/routes/context.ts';
import {
  isTrashEntryId,
  listTrash,
  moveSlideToTrash,
  purgeTrashEntry,
  restoreTrashEntry,
  type TrashPaths,
  trashRootFor,
} from './store.ts';

// GET    /__lr/trash               → { entries }
// POST   /__lr/trash               { slideId } → move the deck into the trash → { entry }
// POST   /__lr/trash/:id/restore   → { slideId }
// DELETE /__lr/trash/:id           → delete for good
//
// Moving a deck in or out changes the deck list, which clients only read on load.
// Clients get `lemonriver:decks-changed` and reload themselves: the one that made
// the change first saves the toast it wants to show after the reload. The watcher
// would broadcast its own reload a beat later; the recorded writes keep it quiet.

const ENTRY_NAMES = ['index.tsx', 'index.jsx', 'index.ts', 'index.js'];

export const DECKS_CHANGED_EVENT = 'lemonriver:decks-changed';

export function registerTrashRoutes(server: ViteDevServer, ctx: ApiContext): void {
  const paths: TrashPaths = {
    slidesRoot: ctx.slidesRoot,
    manifestPath: ctx.manifestPath,
    trashRoot: trashRootFor(ctx.userCwd),
  };
  const quietWatcher = (slideId: string) => {
    for (const name of ENTRY_NAMES) recordWrite(path.join(ctx.slidesRoot, slideId, name));
  };
  const reloadClients = () => {
    invalidateSlidesModule(server);
    server.ws.send({ type: 'custom', event: DECKS_CHANGED_EVENT });
  };

  server.middlewares.use('/__lr/trash', async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const method = req.method ?? 'GET';

    try {
      if (method === 'GET' && url.pathname === '/') {
        return json(res, 200, { entries: await listTrash(paths) });
      }

      if (method === 'POST' && url.pathname === '/') {
        const check = validateMutationRequest(req, { requireJsonBody: true });
        if (!check.ok) return json(res, check.status, { error: check.error });
        const body = (await readBody(req)) as { slideId?: unknown };
        const slideId = typeof body?.slideId === 'string' ? body.slideId : '';
        if (!SLIDE_ID_RE.test(slideId)) return json(res, 400, { error: 'invalid slideId' });
        quietWatcher(slideId);
        const moved = await moveSlideToTrash(paths, slideId);
        if (!moved.ok) return json(res, moved.status, { error: moved.error });
        json(res, 200, { ok: true, entry: moved.entry });
        return reloadClients();
      }

      const restoreMatch = url.pathname.match(/^\/([^/]+)\/restore$/);
      if (method === 'POST' && restoreMatch) {
        const check = validateMutationRequest(req);
        if (!check.ok) return json(res, check.status, { error: check.error });
        const id = decodeURIComponent(restoreMatch[1]);
        if (!isTrashEntryId(id)) return json(res, 400, { error: 'invalid trash id' });
        const restored = await restoreTrashEntry(paths, id, quietWatcher);
        if (!restored.ok) return json(res, restored.status, { error: restored.error });
        json(res, 200, { ok: true, slideId: restored.slideId });
        return reloadClients();
      }

      const entryMatch = url.pathname.match(/^\/([^/]+)$/);
      if (method === 'DELETE' && entryMatch) {
        const check = validateMutationRequest(req);
        if (!check.ok) return json(res, check.status, { error: check.error });
        const id = decodeURIComponent(entryMatch[1]);
        if (!isTrashEntryId(id)) return json(res, 400, { error: 'invalid trash id' });
        if (!(await purgeTrashEntry(paths, id))) {
          return json(res, 404, { error: 'trash entry not found' });
        }
        return json(res, 200, { ok: true });
      }

      next();
    } catch (err) {
      json(res, 500, { error: String((err as Error).message ?? err) });
    }
  });
}
