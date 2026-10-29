import fs from 'node:fs/promises';
import path from 'node:path';
import { readMetaTitleInSource, SLIDE_ID_RE } from '../../editing/slide-ops.ts';
import { readManifest, writeManifest } from '../../files/folders.ts';

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** `<slideId>.<deletedAt>` — unique per deletion, and safe as a single path segment. */
const ENTRY_ID_RE = /^[a-z0-9_-]+\.\d{1,16}$/i;
const ENTRY_FILE = 'entry.json';
const SLIDE_DIR = 'slide';

export type TrashEntry = {
  id: string;
  slideId: string;
  title: string;
  folderId: string | null;
  deletedAt: number;
  expiresAt: number;
};

export type TrashPaths = { slidesRoot: string; manifestPath: string; trashRoot: string };

type Failure = { ok: false; status: number; error: string };

export function trashRootFor(userCwd: string): string {
  return path.join(userCwd, 'node_modules', '.open-slide', 'trash');
}

export function isTrashEntryId(id: string): boolean {
  return ENTRY_ID_RE.test(id);
}

function inside(root: string, id: string): string | null {
  const dir = path.resolve(root, id);
  return dir.startsWith(path.resolve(root) + path.sep) ? dir : null;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function moveDir(from: string, to: string): Promise<void> {
  try {
    await fs.rename(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false });
    await fs.rm(from, { recursive: true, force: true });
  }
}

async function readTitle(slideDir: string, fallback: string): Promise<string> {
  try {
    const read = readMetaTitleInSource(await fs.readFile(path.join(slideDir, 'index.tsx'), 'utf8'));
    return read.kind === 'found' && read.title.trim() ? read.title : fallback;
  } catch {
    return fallback;
  }
}

function toEntry(id: string, raw: unknown): TrashEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.slideId !== 'string' || !SLIDE_ID_RE.test(r.slideId)) return null;
  if (typeof r.deletedAt !== 'number' || !Number.isFinite(r.deletedAt)) return null;
  return {
    id,
    slideId: r.slideId,
    title: typeof r.title === 'string' && r.title ? r.title : r.slideId,
    folderId: typeof r.folderId === 'string' ? r.folderId : null,
    deletedAt: r.deletedAt,
    expiresAt: r.deletedAt + TRASH_RETENTION_MS,
  };
}

async function readEntry(trashRoot: string, id: string): Promise<TrashEntry | null> {
  if (!isTrashEntryId(id)) return null;
  const dir = inside(trashRoot, id);
  if (!dir) return null;
  try {
    const entry = toEntry(id, JSON.parse(await fs.readFile(path.join(dir, ENTRY_FILE), 'utf8')));
    return entry && (await exists(path.join(dir, SLIDE_DIR))) ? entry : null;
  } catch {
    return null;
  }
}

async function idTaken(slidesRoot: string, slideId: string): Promise<boolean> {
  try {
    const want = slideId.toLowerCase();
    return (await fs.readdir(slidesRoot)).some((name) => name.toLowerCase() === want);
  } catch {
    return false;
  }
}

async function freeSlideId(slidesRoot: string, slideId: string): Promise<string> {
  if (!(await idTaken(slidesRoot, slideId))) return slideId;
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${slideId}-restored` : `${slideId}-restored-${n}`;
    if (!(await idTaken(slidesRoot, candidate))) return candidate;
  }
}

export async function listTrash(paths: TrashPaths, now = Date.now()): Promise<TrashEntry[]> {
  let names: string[];
  try {
    names = await fs.readdir(paths.trashRoot);
  } catch {
    return [];
  }
  const entries: TrashEntry[] = [];
  for (const name of names) {
    const entry = await readEntry(paths.trashRoot, name);
    if (!entry) continue;
    if (now >= entry.expiresAt) {
      await purgeTrashEntry(paths, entry.id);
      continue;
    }
    entries.push(entry);
  }
  return entries.sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function moveSlideToTrash(
  paths: TrashPaths,
  slideId: string,
  now = Date.now(),
): Promise<{ ok: true; entry: TrashEntry } | Failure> {
  if (!SLIDE_ID_RE.test(slideId)) return { ok: false, status: 400, error: 'invalid slideId' };
  const slideDir = inside(paths.slidesRoot, slideId);
  if (!slideDir || !(await exists(slideDir))) {
    return { ok: false, status: 404, error: 'slide not found' };
  }

  let deletedAt = now;
  while (await exists(path.join(paths.trashRoot, `${slideId}.${deletedAt}`))) deletedAt++;
  const id = `${slideId}.${deletedAt}`;
  const entryDir = path.join(paths.trashRoot, id);

  const manifest = await readManifest(paths.manifestPath);
  const folderId = manifest.assignments[slideId] ?? null;
  const title = await readTitle(slideDir, slideId);

  await fs.mkdir(entryDir, { recursive: true });
  await fs.writeFile(
    path.join(entryDir, ENTRY_FILE),
    `${JSON.stringify({ slideId, title, folderId, deletedAt }, null, 2)}\n`,
    'utf8',
  );
  try {
    await moveDir(slideDir, path.join(entryDir, SLIDE_DIR));
  } catch (err) {
    await fs.rm(entryDir, { recursive: true, force: true });
    throw err;
  }

  if (folderId !== null) {
    delete manifest.assignments[slideId];
    await writeManifest(paths.manifestPath, manifest);
  }
  return {
    ok: true,
    entry: { id, slideId, title, folderId, deletedAt, expiresAt: deletedAt + TRASH_RETENTION_MS },
  };
}

export async function restoreTrashEntry(
  paths: TrashPaths,
  id: string,
  beforeMove: (slideId: string) => void = () => {},
): Promise<{ ok: true; slideId: string } | Failure> {
  const entry = await readEntry(paths.trashRoot, id);
  if (!entry) return { ok: false, status: 404, error: 'trash entry not found' };
  const entryDir = path.join(paths.trashRoot, id);
  const slideId = await freeSlideId(paths.slidesRoot, entry.slideId);
  const slideDir = inside(paths.slidesRoot, slideId);
  if (!slideDir) return { ok: false, status: 400, error: 'invalid slideId' };

  await fs.mkdir(paths.slidesRoot, { recursive: true });
  beforeMove(slideId);
  await moveDir(path.join(entryDir, SLIDE_DIR), slideDir);
  await fs.rm(entryDir, { recursive: true, force: true });

  if (entry.folderId !== null) {
    const manifest = await readManifest(paths.manifestPath);
    if (manifest.folders.some((f) => f.id === entry.folderId)) {
      manifest.assignments[slideId] = entry.folderId;
      await writeManifest(paths.manifestPath, manifest);
    }
  }
  return { ok: true, slideId };
}

export async function purgeTrashEntry(paths: TrashPaths, id: string): Promise<boolean> {
  if (!isTrashEntryId(id)) return false;
  const dir = inside(paths.trashRoot, id);
  if (!dir || !(await exists(dir))) return false;
  await fs.rm(dir, { recursive: true, force: true });
  return true;
}
