import fs from 'node:fs/promises';
import type { ViteDevServer } from 'vite';
import { sanitizeTask } from '../../app/lemonriver/board/model/agent-tasks.ts';
import { sanitizeCards, sanitizeLinks } from '../../app/lemonriver/board/model/cards.ts';
import { sanitizeChanges } from '../../app/lemonriver/board/model/changes.ts';
import { sanitizeRestructures } from '../../app/lemonriver/board/model/restructure.ts';
import {
  type BoardStructure,
  reconcileColumns,
  sanitizeStructure,
} from '../../app/lemonriver/board/model/structure.ts';
import { sanitizeTargetMinutes } from '../../app/lemonriver/board/model/timing.ts';
import { resolveSlideEntry } from '../../editing/slide-ops.ts';
import { validateMutationRequest } from '../../http/request-guard.ts';
import {
  type ApiContext,
  json,
  readBody,
  readSlideSource,
  resolveSlideEntryPath,
} from '../../vite/routes/context.ts';
import {
  cancelApply,
  linkApply,
  sanitizeApplying,
  sanitizeChapterPlan,
  sanitizeLastApply,
  saveChapterPlan,
  startApply,
  undoApply,
} from './apply.ts';
import { blockSourceInSource } from './block-source.ts';
import { defaultExportEntriesInSource } from './page-entries.ts';
import {
  insertBlankPageInDefaultExportInSource,
  insertNotesElementInSource,
  insertPageEntryInDefaultExportInSource,
} from './page-insert.ts';
import {
  boardStructurePath,
  readBoardFile,
  updateBoardFile,
  writeBoardStructure,
} from './store.ts';

// GET /__board?slideId=…&pages=n   → { columns, applying, lastApply, chapterPlan, targetMinutes }
// PUT /__board                     { slideId, columns: [{ title, size }] }
// PUT /__board/target              { slideId, targetMinutes } → the length the deck aims for
// GET /__board/cards?slideId=…     → { cards, links }
// PUT /__board/cards               { slideId, cards, links }
// GET /__board/changes?slideId=…   → { changes }
// PUT /__board/changes             { slideId, changes }
// GET /__board/restructures?slideId=… → { restructures }
// PUT /__board/restructures        { slideId, restructures }
// POST /__board/apply              { slideId, task?, lang? } → { prompt }
// PATCH /__board/apply             { slideId, sessionId, userItemId } → { ok }
// POST /__board/apply/undo         { slideId } → put the deck back as it was
// POST /__board/apply/cancel       { slideId } → stop waiting for that apply
// PUT /__board/plan                { slideId, chapterPlan } → save or drop the planned titles
// POST /__board/blocks/source      { slideId, loc, text } → { code }
// GET /__board/entries?slideId=…   → { entries: string[] | null }
// POST /__board/pages/insert       { slideId, index } → insert a blank page
// POST /__board/pages/restore      { slideId, index, entry } → put a removed page back

type PutBody = { slideId?: string; columns?: unknown };
type CardsBody = { slideId?: string; cards?: unknown; links?: unknown };
type ChangesBody = { slideId?: string; changes?: unknown };
type RestructuresBody = { slideId?: string; restructures?: unknown };

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
        const raw = await readBoardFile(boardStructurePath(ctx.userCwd, slideId));
        const pages = Number(url.searchParams.get('pages') ?? '0');
        const stored = sanitizeStructure(raw);
        const columns =
          !stored || pages <= 0
            ? (stored?.columns ?? null)
            : reconcileColumns(stored.columns, pages);
        return json(res, 200, {
          columns,
          applying: sanitizeApplying(raw.applying),
          lastApply: sanitizeLastApply(raw.lastApply),
          chapterPlan: sanitizeChapterPlan(raw.chapterPlan),
          targetMinutes: sanitizeTargetMinutes(raw.targetMinutes),
        });
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

      if (method === 'PUT' && url.pathname === '/target') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as { slideId?: unknown; targetMinutes?: unknown };
        const slideId = typeof body?.slideId === 'string' ? body.slideId : '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        if (body?.targetMinutes != null && sanitizeTargetMinutes(body.targetMinutes) === null) {
          return json(res, 400, { error: 'invalid targetMinutes' });
        }
        await updateBoardFile(boardStructurePath(ctx.userCwd, slideId), {
          targetMinutes: sanitizeTargetMinutes(body?.targetMinutes),
        });
        return json(res, 200, { ok: true });
      }

      if (method === 'GET' && url.pathname === '/cards') {
        const slideId = url.searchParams.get('slideId') ?? '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        const stored = await readBoardFile(boardStructurePath(ctx.userCwd, slideId));
        return json(res, 200, {
          cards: sanitizeCards(stored.cards),
          links: sanitizeLinks(stored.links),
        });
      }

      if (method === 'PUT' && url.pathname === '/cards') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as CardsBody;
        const slideId = body.slideId ?? '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        await updateBoardFile(boardStructurePath(ctx.userCwd, slideId), {
          cards: sanitizeCards(body.cards),
          links: sanitizeLinks(body.links),
        });
        return json(res, 200, { ok: true });
      }

      if (method === 'GET' && url.pathname === '/changes') {
        const slideId = url.searchParams.get('slideId') ?? '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        const stored = await readBoardFile(boardStructurePath(ctx.userCwd, slideId));
        return json(res, 200, { changes: sanitizeChanges(stored.changes) });
      }

      if (method === 'PUT' && url.pathname === '/changes') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as ChangesBody;
        const slideId = body.slideId ?? '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        await updateBoardFile(boardStructurePath(ctx.userCwd, slideId), {
          changes: sanitizeChanges(body.changes),
        });
        return json(res, 200, { ok: true });
      }

      if (method === 'GET' && url.pathname === '/restructures') {
        const slideId = url.searchParams.get('slideId') ?? '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        const stored = await readBoardFile(boardStructurePath(ctx.userCwd, slideId));
        return json(res, 200, { restructures: sanitizeRestructures(stored.restructures) });
      }

      if (method === 'PUT' && url.pathname === '/restructures') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as RestructuresBody;
        const slideId = body.slideId ?? '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        await updateBoardFile(boardStructurePath(ctx.userCwd, slideId), {
          restructures: sanitizeRestructures(body.restructures),
        });
        return json(res, 200, { ok: true });
      }

      if (method === 'POST' && url.pathname === '/apply') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as {
          slideId?: unknown;
          task?: unknown;
          lang?: unknown;
        };
        const slideId = typeof body?.slideId === 'string' ? body.slideId : '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        const task =
          body?.task === undefined ? { kind: 'changes' as const } : sanitizeTask(body.task);
        if (!task) return json(res, 400, { error: 'invalid task' });
        const lang = typeof body?.lang === 'string' && body.lang ? body.lang.slice(0, 20) : 'en';
        const started = await startApply(ctx, slideId, task, lang);
        if (!started.ok) return json(res, started.status, { error: started.error });
        return json(res, 200, { prompt: started.prompt });
      }

      if (method === 'PUT' && url.pathname === '/plan') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as { slideId?: unknown; chapterPlan?: unknown };
        const slideId = typeof body?.slideId === 'string' ? body.slideId : '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        const plan =
          body?.chapterPlan === null || body?.chapterPlan === undefined
            ? null
            : sanitizeChapterPlan(body.chapterPlan);
        if (body?.chapterPlan != null && !plan) {
          return json(res, 400, { error: 'invalid chapterPlan' });
        }
        await saveChapterPlan(ctx, slideId, plan);
        return json(res, 200, { ok: true });
      }

      if (method === 'PATCH' && url.pathname === '/apply') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as {
          slideId?: unknown;
          sessionId?: unknown;
          userItemId?: unknown;
        };
        const slideId = typeof body?.slideId === 'string' ? body.slideId : '';
        const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
        const userItemId = typeof body?.userItemId === 'string' ? body.userItemId : '';
        if (!resolveSlideEntryPath(ctx, slideId) || !sessionId) {
          return json(res, 400, { error: 'invalid slideId or sessionId' });
        }
        const linked = await linkApply(ctx, slideId, sessionId, userItemId);
        if (!linked) return json(res, 409, { error: 'no apply is running' });
        return json(res, 200, { ok: true });
      }

      if (method === 'POST' && url.pathname === '/apply/undo') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as { slideId?: unknown };
        const slideId = typeof body?.slideId === 'string' ? body.slideId : '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        const undone = await undoApply(ctx, slideId);
        if (!undone.ok) return json(res, undone.status, { error: undone.error });
        return json(res, 200, { ok: true });
      }

      if (method === 'POST' && url.pathname === '/apply/cancel') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as { slideId?: unknown };
        const slideId = typeof body?.slideId === 'string' ? body.slideId : '';
        if (!resolveSlideEntryPath(ctx, slideId)) {
          return json(res, 400, { error: 'invalid slideId' });
        }
        await cancelApply(ctx, slideId);
        return json(res, 200, { ok: true });
      }

      if (method === 'POST' && url.pathname === '/blocks/source') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as { slideId?: unknown; loc?: unknown; text?: unknown };
        const slideId = typeof body?.slideId === 'string' ? body.slideId : '';
        const loc = typeof body?.loc === 'string' ? body.loc : '';
        const text = typeof body?.text === 'string' ? body.text : '';
        const entry = resolveSlideEntryPath(ctx, slideId);
        if (!entry || !loc) return json(res, 400, { error: 'invalid slideId or loc' });

        const source = await readSlideSource(entry);
        if (source === null) return json(res, 404, { error: 'slide not found' });
        const code = blockSourceInSource(source, loc, text);
        if (code === null) return json(res, 404, { error: 'block source not found' });
        return json(res, 200, { code });
      }

      if (method === 'POST' && url.pathname === '/pages/insert') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as { slideId?: unknown; index?: unknown };
        const slideId = typeof body?.slideId === 'string' ? body.slideId : '';
        const index = typeof body?.index === 'number' ? body.index : Number.NaN;
        if (!Number.isInteger(index) || index < 0) {
          return json(res, 400, { error: 'invalid index' });
        }
        const entry = resolveSlideEntry(ctx.slidesRoot, slideId);
        if (!entry) return json(res, 400, { error: 'invalid slideId' });

        let source: string;
        try {
          source = await fs.readFile(entry, 'utf8');
        } catch {
          return json(res, 404, { error: 'slide not found' });
        }

        const withPage = insertBlankPageInDefaultExportInSource(source, index);
        if (withPage === null) {
          return json(res, 422, {
            error: 'could not insert a page — index out of range or default export is not an array',
          });
        }
        const withNotes = insertNotesElementInSource(withPage, index);
        if (withNotes === null) {
          return json(res, 422, {
            error: 'could not insert a page — `notes` export has an unexpected shape',
          });
        }
        if (withNotes !== source) {
          await fs.writeFile(entry, withNotes, 'utf8');
        }
        return json(res, 200, { ok: true, slideId, index });
      }

      if (method === 'POST' && url.pathname === '/pages/restore') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }
        const body = (await readBody(req)) as {
          slideId?: unknown;
          index?: unknown;
          entry?: unknown;
        };
        const slideId = typeof body?.slideId === 'string' ? body.slideId : '';
        const index = typeof body?.index === 'number' ? body.index : Number.NaN;
        const entry = typeof body?.entry === 'string' ? body.entry : '';
        if (!Number.isInteger(index) || index < 0 || !entry.trim()) {
          return json(res, 400, { error: 'invalid index or entry' });
        }
        const target = resolveSlideEntry(ctx.slidesRoot, slideId);
        if (!target) return json(res, 400, { error: 'invalid slideId' });

        let source: string;
        try {
          source = await fs.readFile(target, 'utf8');
        } catch {
          return json(res, 404, { error: 'slide not found' });
        }

        const withPage = insertPageEntryInDefaultExportInSource(source, index, entry);
        if (withPage === null) {
          return json(res, 422, {
            error:
              'could not restore the page — index out of range or default export is not an array',
          });
        }
        const withNotes = insertNotesElementInSource(withPage, index);
        if (withNotes === null) {
          return json(res, 422, {
            error: 'could not restore the page — notes export is malformed',
          });
        }
        if (withNotes !== source) await fs.writeFile(target, withNotes, 'utf8');
        return json(res, 200, { ok: true, slideId, index });
      }

      if (method === 'GET' && url.pathname === '/entries') {
        const slideId = url.searchParams.get('slideId') ?? '';
        const entry = resolveSlideEntryPath(ctx, slideId);
        if (!entry) return json(res, 400, { error: 'invalid slideId' });
        const source = await readSlideSource(entry);
        return json(res, 200, { entries: source ? defaultExportEntriesInSource(source) : null });
      }

      next();
    } catch (err) {
      json(res, 500, { error: String((err as Error).message ?? err) });
    }
  });
}
