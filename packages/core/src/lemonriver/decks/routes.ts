import fs from 'node:fs/promises';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { SLIDE_ID_RE } from '../../editing/slide-ops.ts';
import { type ApiContext, json } from '../../vite/routes/context.ts';

// GET /__lr/decks → { decks: { [slideId]: { modifiedAt } } }
//
// modifiedAt is the deck entry file's mtime, in ms since the epoch.

const ENTRY_NAMES = ['index.tsx', 'index.jsx', 'index.ts', 'index.js'];

export async function readDeckTimes(
  slidesRoot: string,
): Promise<Record<string, { modifiedAt: number }>> {
  let names: string[];
  try {
    names = await fs.readdir(slidesRoot);
  } catch {
    return {};
  }
  const decks: Record<string, { modifiedAt: number }> = {};
  for (const name of names) {
    if (!SLIDE_ID_RE.test(name)) continue;
    for (const entry of ENTRY_NAMES) {
      try {
        const stat = await fs.stat(path.join(slidesRoot, name, entry));
        decks[name] = { modifiedAt: Math.round(stat.mtimeMs) };
        break;
      } catch {}
    }
  }
  return decks;
}

export function registerDeckRoutes(server: ViteDevServer, ctx: ApiContext): void {
  server.middlewares.use('/__lr/decks', async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    if ((req.method ?? 'GET') !== 'GET' || url.pathname !== '/') return next();
    try {
      json(res, 200, { decks: await readDeckTimes(ctx.slidesRoot) });
    } catch (err) {
      json(res, 500, { error: String((err as Error).message ?? err) });
    }
  });
}
