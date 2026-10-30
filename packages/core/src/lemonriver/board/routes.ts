import fs from 'node:fs/promises';
import type { ViteDevServer } from 'vite';
import { sanitizeCards, sanitizeLinks } from '../../app/lemonriver/board/model/cards.ts';
import { sanitizeChanges } from '../../app/lemonriver/board/model/changes.ts';
import {
  type BoardStructure,
  reconcileColumns,
} from '../../app/lemonriver/board/model/structure.ts';
import { resolveSlideEntry } from '../../editing/slide-ops.ts';
import { validateMutationRequest } from '../../http/request-guard.ts';
import {
  type ApiContext,
  json,
  readBody,
  readSlideSource,
  resolveSlideEntryPath,
} from '../../vite/routes/context.ts';
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
  readBoardStructure,
  updateBoardFile,
  writeBoardStructure,
} from './store.ts';

// GET /__board?slideId=…&pages=n   → { columns } | { columns: null }
// PUT /__board                     { slideId, columns: [{ title, size }] }
// GET /__board/cards?slideId=…     → { cards, links }
// PUT /__board/cards               { slideId, cards, links }
// GET /__board/changes?slideId=…   → { changes }
// PUT /__board/changes             { slideId, changes }
// POST /__board/blocks/source      { slideId, loc, text } → { code }
// GET /__board/entries?slideId=…   → { entries: string[] | null }
// POST /__board/pages/insert       { slideId, index } → insert a blank page
// POST /__board/pages/restore      { slideId, index, entry } → put a removed page back

type PutBody = { slideId?: string; columns?: unknown };
type CardsBody = { slideId?: string; cards?: unknown; links?: unknown };
type ChangesBody = { slideId?: string; changes?: unknown };

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
