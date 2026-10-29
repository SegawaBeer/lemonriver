import type { ViteDevServer } from 'vite';
import {
  buildPrompt,
  MAX_BRIEF,
  OUTLINE_PAGE_SIZES,
  type Outline,
  sanitizeOutline,
} from '../../app/lemonriver/outline/model.ts';
import { validateMutationRequest } from '../../http/request-guard.ts';
import {
  type ApiContext,
  json,
  readBody,
  resolveSlideEntryPath,
} from '../../vite/routes/context.ts';
import { boardStructurePath, readBoardFile, updateBoardFile } from '../board/store.ts';

// GET  /__lr/outline?slideId=…  → { outline: Outline | null }
// PUT  /__lr/outline            { slideId, items } → { ok, outline }
// POST /__lr/outline/start      { slideId, brief, pages, files } → { ok }
// POST /__lr/outline/build      { slideId } → { ok, prompt }

export function startOutline(
  input: { brief?: unknown; pages?: unknown; files?: unknown },
  now: number,
): Outline {
  const brief = typeof input.brief === 'string' ? input.brief.trim().slice(0, MAX_BRIEF) : '';
  const files = Array.isArray(input.files)
    ? input.files.filter((file): file is string => typeof file === 'string' && file.trim() !== '')
    : [];
  return {
    state: 'drafting',
    brief,
    pages: OUTLINE_PAGE_SIZES.find((size) => size === input.pages) ?? 8,
    files,
    items: [],
    updatedAt: now,
  };
}

/** Only a ready outline may be edited: while drafting the agent owns the list. */
export function replaceItems(outline: Outline, rawItems: unknown, now: number): Outline | null {
  if (outline.state !== 'ready') return null;
  return sanitizeOutline({ ...outline, items: rawItems, updatedAt: now });
}

async function readOutline(ctx: ApiContext, slideId: string): Promise<Outline | null> {
  const stored = await readBoardFile(boardStructurePath(ctx.userCwd, slideId));
  return sanitizeOutline(stored.outline);
}

export function registerOutlineRoutes(server: ViteDevServer, ctx: ApiContext): void {
  server.middlewares.use('/__lr/outline', async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const method = req.method ?? 'GET';

    try {
      if (method === 'GET' && url.pathname === '/') {
        const slideId = url.searchParams.get('slideId') ?? '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        return json(res, 200, { outline: await readOutline(ctx, slideId) });
      }

      if (method === 'PUT' && url.pathname === '/') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as { slideId?: unknown; items?: unknown };
        const slideId = typeof body.slideId === 'string' ? body.slideId : '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        const outline = await readOutline(ctx, slideId);
        const next = outline ? replaceItems(outline, body.items, Date.now()) : null;
        if (!next) return json(res, 409, { error: 'outline is not ready' });
        await updateBoardFile(boardStructurePath(ctx.userCwd, slideId), { outline: next });
        return json(res, 200, { ok: true, outline: next });
      }

      if (method === 'POST' && url.pathname === '/start') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as Record<string, unknown>;
        const slideId = typeof body.slideId === 'string' ? body.slideId : '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        await updateBoardFile(boardStructurePath(ctx.userCwd, slideId), {
          outline: startOutline(body, Date.now()),
        });
        return json(res, 200, { ok: true });
      }

      if (method === 'POST' && url.pathname === '/build') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as { slideId?: unknown };
        const slideId = typeof body.slideId === 'string' ? body.slideId : '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        const outline = await readOutline(ctx, slideId);
        if (!outline || outline.state !== 'ready') {
          return json(res, 409, { error: 'outline is not ready' });
        }
        await updateBoardFile(boardStructurePath(ctx.userCwd, slideId), {
          outline: { ...outline, state: 'building', updatedAt: Date.now() },
        });
        return json(res, 200, { ok: true, prompt: buildPrompt(outline, slideId) });
      }

      next();
    } catch (err) {
      json(res, 500, { error: String((err as Error).message ?? err) });
    }
  });
}
