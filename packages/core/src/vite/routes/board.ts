import type { ViteDevServer } from 'vite';
import { boardStructurePath, readBoardStructure, writeBoardStructure } from '../../files/board.ts';
import { type BoardStructure, reconcileColumns } from '../../files/board-structure.ts';
import { validateMutationRequest } from '../../http/request-guard.ts';
import { type ApiContext, json, readBody, resolveSlideEntryPath } from './context.ts';

// GET /__board?slideId=…&pages=n   → { columns } | { columns: null }
// PUT /__board                     { slideId, columns: [{ title, size }] }

type PutBody = { slideId?: string; columns?: unknown };

export function registerBoardRoutes(server: ViteDevServer, ctx: ApiContext): void {
  server.middlewares.use('/__board', async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const method = req.method ?? 'GET';

    try {
      if (method === 'GET' && url.pathname === '/') {
        const slideId = url.searchParams.get('slideId') ?? '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        const stored = await readBoardStructure(boardStructurePath(ctx.userCwd, slideId));
        if (!stored) return json(res, 200, { columns: null });
        const pages = Number(url.searchParams.get('pages') ?? '0');
        const columns = pages > 0 ? reconcileColumns(stored.columns, pages) : stored.columns;
        return json(res, 200, { columns });
      }

      if (method === 'PUT' && url.pathname === '/') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as PutBody;
        const slideId = body.slideId ?? '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        if (!Array.isArray(body.columns)) return json(res, 400, { error: 'missing columns' });
        const structure: BoardStructure = {
          columns: body.columns.flatMap((column) => {
            const { title, size } = (column ?? {}) as { title?: unknown; size?: unknown };
            if (typeof size !== 'number' || !Number.isInteger(size) || size < 0) return [];
            return [{ title: typeof title === 'string' ? title : '', size }];
          }),
        };
        if (structure.columns.length === 0) return json(res, 400, { error: 'no usable columns' });
        await writeBoardStructure(boardStructurePath(ctx.userCwd, slideId), structure);
        return json(res, 200, { ok: true });
      }

      next();
    } catch (err) {
      json(res, 500, { error: String((err as Error).message ?? err) });
    }
  });
}
