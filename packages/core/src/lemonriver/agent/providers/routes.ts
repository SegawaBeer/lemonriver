import type { ViteDevServer } from 'vite';
import { validateMutationRequest } from '../../../http/request-guard.ts';
import { type ApiContext, json, readBody } from '../../../vite/routes/context.ts';
import { isIconProviderId, readProviderIcon } from './app-icon.ts';
import { connectableIds, providerCatalog } from './index.ts';
import { readEnabledProviders, writeEnabledProviders } from './store.ts';

// GET /__lr/agent-providers → { enabled, providers } for the Settings block
// PUT /__lr/agent-providers { enabled: string[] } → { enabled }
// GET /__lr/agent-providers/:id/icon → the product's own app icon as PNG
//
// A provider can only be switched on when it is detected and actually
// callable, so an uninstalled app or a desktop-only one is refused here as
// well as greyed out in the UI.

const BODY_LIMIT = 16 * 1024;

export function registerAgentProviderRoutes(server: ViteDevServer, ctx: ApiContext): void {
  server.middlewares.use('/__lr/agent-providers', async (req, res, next) => {
    const method = req.method ?? 'GET';
    try {
      const url = new URL(req.url ?? '/', 'http://local');

      const iconMatch = url.pathname.match(/^\/([^/]+)\/icon$/);
      if (iconMatch && method === 'GET') {
        const id = iconMatch[1];
        if (!isIconProviderId(id)) return json(res, 404, { error: 'not found' });
        const png = await readProviderIcon(ctx.userCwd, id);
        if (!png) return json(res, 404, { error: 'not found' });
        res.statusCode = 200;
        res.setHeader('content-type', 'image/png');
        res.setHeader('cache-control', 'no-store');
        res.end(png);
        return;
      }

      if (method === 'GET') {
        res.setHeader('cache-control', 'no-store');
        const enabled = [...(await readEnabledProviders(ctx.userCwd))];
        return json(res, 200, { enabled, providers: providerCatalog() });
      }

      if (method === 'PUT') {
        const guard = validateMutationRequest(req, { requireJsonBody: true });
        if (!guard.ok) return json(res, guard.status, { error: guard.error });
        const body = (await readBody(req, BODY_LIMIT)) as { enabled?: unknown };
        if (!Array.isArray(body.enabled)) return json(res, 400, { error: 'invalid enabled' });
        const wanted = body.enabled.filter((id): id is string => typeof id === 'string');
        const allowed = connectableIds(providerCatalog(), wanted);
        if (allowed.length !== wanted.length) {
          return json(res, 400, { error: 'provider cannot be enabled' });
        }
        const enabled = await writeEnabledProviders(ctx.userCwd, wanted);
        return json(res, 200, { enabled });
      }

      next();
    } catch (err) {
      json(res, 500, { error: String((err as Error).message ?? err) });
    }
  });
}
