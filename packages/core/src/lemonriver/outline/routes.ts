import fs from 'node:fs/promises';
import type { ViteDevServer } from 'vite';
import {
  DISPATCH_STALE_MS,
  MAX_BRIEF,
  nextStep,
  OUTLINE_PAGE_SIZES,
  type Outline,
  pagePrompt,
  reviewPrompt,
  sanitizeOutline,
} from '../../app/lemonriver/outline/model.ts';
import { validateMutationRequest } from '../../http/request-guard.ts';
import {
  type ApiContext,
  json,
  readBody,
  readSlideSource,
  resolveSlideEntryPath,
} from '../../vite/routes/context.ts';
import { boardStructurePath, readBoardFile, updateBoardFile } from '../board/store.ts';

// GET  /__lr/outline?slideId=…  → { outline: Outline | null }
// PUT  /__lr/outline            { slideId, items } → { ok, outline }
// POST /__lr/outline/start      { slideId, brief, pages, files } → { ok }
// POST /__lr/outline/build      { slideId } → { ok }
// POST /__lr/outline/next       { slideId, resume? } → { prompt, step }
// POST /__lr/outline/pause      { slideId, paused } → { ok }
// POST /__lr/outline/undo       { slideId } → { ok }

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
    built: 0,
    paused: false,
    stage: 'pages',
    dispatched: null,
    lastTurn: null,
  };
}

/** Only a ready outline may be edited: while drafting the agent owns the list. */
export function replaceItems(outline: Outline, rawItems: unknown, now: number): Outline | null {
  if (outline.state !== 'ready') return null;
  return sanitizeOutline({ ...outline, items: rawItems, updatedAt: now });
}

export function beginBuild(outline: Outline, now: number): Outline {
  return {
    ...outline,
    state: 'building',
    built: 0,
    paused: false,
    stage: 'pages',
    dispatched: null,
    lastTurn: null,
    updatedAt: now,
  };
}

/** Claims the next page (or the review) for this tab. Null means another tab is ahead. */
export function claimNextStep(
  outline: Outline,
  input: { resume: boolean; now: number },
): { outline: Outline; step: { kind: 'page'; n: number } | { kind: 'review' } } | null {
  if (outline.state !== 'building') return null;
  const base = input.resume ? { ...outline, paused: false, dispatched: null } : outline;
  if (base.paused) return null;
  if (base.dispatched && input.now - base.dispatched.at < DISPATCH_STALE_MS) return null;
  const step = nextStep(base);
  if (!step) return null;
  return {
    outline: {
      ...base,
      dispatched: {
        kind: step.kind,
        n: step.kind === 'page' ? step.n : 0,
        at: input.now,
      },
      updatedAt: input.now,
    },
    step,
  };
}

export function setPaused(outline: Outline, paused: boolean, now: number): Outline {
  return { ...outline, paused, updatedAt: now };
}

export function undoBuild(outline: Outline, now: number): Outline | null {
  if (outline.state !== 'built') return null;
  return {
    ...outline,
    state: 'ready',
    built: 0,
    paused: false,
    stage: 'pages',
    dispatched: null,
    lastTurn: null,
    updatedAt: now,
  };
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
        const entry = resolveSlideEntryPath(ctx, slideId);
        if (!entry) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        const file = boardStructurePath(ctx.userCwd, slideId);
        const stored = await readBoardFile(file);
        const outline = sanitizeOutline(stored.outline);
        if (outline?.state !== 'ready') {
          return json(res, 409, { error: 'outline is not ready' });
        }
        const buildBackup = (await readSlideSource(entry)) ?? '';
        await updateBoardFile(file, {
          outline: beginBuild(outline, Date.now()),
          buildBackup,
        });
        return json(res, 200, { ok: true });
      }

      if (method === 'POST' && url.pathname === '/next') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as { slideId?: unknown; resume?: unknown };
        const slideId = typeof body.slideId === 'string' ? body.slideId : '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        const outline = await readOutline(ctx, slideId);
        if (!outline) return json(res, 409, { error: 'no outline' });
        const claimed = claimNextStep(outline, {
          resume: body.resume === true,
          now: Date.now(),
        });
        if (!claimed) return json(res, 409, { error: 'no step to send' });
        await updateBoardFile(boardStructurePath(ctx.userCwd, slideId), {
          outline: claimed.outline,
        });
        const prompt =
          claimed.step.kind === 'review'
            ? reviewPrompt(outline, slideId)
            : pagePrompt(outline, slideId, claimed.step.n);
        return json(res, 200, { prompt, step: claimed.step });
      }

      if (method === 'POST' && url.pathname === '/pause') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as { slideId?: unknown; paused?: unknown };
        const slideId = typeof body.slideId === 'string' ? body.slideId : '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        const outline = await readOutline(ctx, slideId);
        if (!outline) return json(res, 409, { error: 'no outline' });
        const next = setPaused(outline, body.paused === true, Date.now());
        await updateBoardFile(boardStructurePath(ctx.userCwd, slideId), { outline: next });
        return json(res, 200, { ok: true, outline: next });
      }

      if (method === 'POST' && url.pathname === '/undo') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as { slideId?: unknown };
        const slideId = typeof body.slideId === 'string' ? body.slideId : '';
        const entry = resolveSlideEntryPath(ctx, slideId);
        if (!entry) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        const file = boardStructurePath(ctx.userCwd, slideId);
        const stored = await readBoardFile(file);
        const outline = sanitizeOutline(stored.outline);
        const backup = stored.buildBackup;
        if (!outline || typeof backup !== 'string') {
          return json(res, 409, { error: 'nothing to undo' });
        }
        const next = undoBuild(outline, Date.now());
        if (!next) return json(res, 409, { error: 'nothing to undo' });
        await fs.writeFile(entry, backup, 'utf8');
        await updateBoardFile(file, { outline: next, buildBackup: undefined });
        return json(res, 200, { ok: true });
      }

      next();
    } catch (err) {
      json(res, 500, { error: String((err as Error).message ?? err) });
    }
  });
}
