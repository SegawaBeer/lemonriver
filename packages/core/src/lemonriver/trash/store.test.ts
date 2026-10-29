import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readManifest, writeManifest } from '../../files/folders.ts';
import {
  isTrashEntryId,
  listTrash,
  moveSlideToTrash,
  purgeTrashEntry,
  restoreTrashEntry,
  TRASH_RETENTION_MS,
  type TrashPaths,
  trashRootFor,
} from './store.ts';

async function withWorkspace<T>(fn: (paths: TrashPaths) => Promise<T>): Promise<T> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'lr-trash-'));
  const slidesRoot = path.join(cwd, 'slides');
  await fs.mkdir(slidesRoot, { recursive: true });
  try {
    return await fn({
      slidesRoot,
      manifestPath: path.join(slidesRoot, '.folders.json'),
      trashRoot: trashRootFor(cwd),
    });
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
}

async function addSlide(paths: TrashPaths, id: string, title = id): Promise<void> {
  await fs.mkdir(path.join(paths.slidesRoot, id), { recursive: true });
  await fs.writeFile(
    path.join(paths.slidesRoot, id, 'index.tsx'),
    `export const meta = { title: '${title}' };\nexport default [];\n`,
  );
  await fs.writeFile(path.join(paths.slidesRoot, id, 'notes.md'), 'kept');
}

const exists = (p: string) =>
  fs.access(p).then(
    () => true,
    () => false,
  );

describe('trash', () => {
  it('moves a deck out of the slides folder and lists it with its title', () =>
    withWorkspace(async (paths) => {
      await addSlide(paths, 'alpha', 'Alpha Deck');
      const moved = await moveSlideToTrash(paths, 'alpha', 1000);
      expect(moved.ok).toBe(true);
      expect(await exists(path.join(paths.slidesRoot, 'alpha'))).toBe(false);

      const entries = await listTrash(paths, 2000);
      expect(entries).toEqual([
        {
          id: 'alpha.1000',
          slideId: 'alpha',
          title: 'Alpha Deck',
          folderId: null,
          deletedAt: 1000,
          expiresAt: 1000 + TRASH_RETENTION_MS,
        },
      ]);
    }));

  it('restores every file and puts the deck back in its folder', () =>
    withWorkspace(async (paths) => {
      await addSlide(paths, 'alpha');
      await writeManifest(paths.manifestPath, {
        folders: [{ id: 'f-00000001', name: 'Work', icon: { type: 'color', value: '#000000' } }],
        assignments: { alpha: 'f-00000001' },
      });
      await moveSlideToTrash(paths, 'alpha', 1000);
      expect((await readManifest(paths.manifestPath)).assignments).toEqual({});

      const restored = await restoreTrashEntry(paths, 'alpha.1000');
      expect(restored).toEqual({ ok: true, slideId: 'alpha' });
      expect(await fs.readFile(path.join(paths.slidesRoot, 'alpha', 'notes.md'), 'utf8')).toBe(
        'kept',
      );
      expect((await readManifest(paths.manifestPath)).assignments).toEqual({ alpha: 'f-00000001' });
      expect(await listTrash(paths, 2000)).toEqual([]);
    }));

  it('does not restore into a folder that was deleted meanwhile', () =>
    withWorkspace(async (paths) => {
      await addSlide(paths, 'alpha');
      await writeManifest(paths.manifestPath, {
        folders: [{ id: 'f-00000001', name: 'Work', icon: { type: 'color', value: '#000000' } }],
        assignments: { alpha: 'f-00000001' },
      });
      await moveSlideToTrash(paths, 'alpha', 1000);
      await writeManifest(paths.manifestPath, { folders: [], assignments: {} });
      await restoreTrashEntry(paths, 'alpha.1000');
      expect((await readManifest(paths.manifestPath)).assignments).toEqual({});
    }));

  it('restores under a new id when the old one is taken again', () =>
    withWorkspace(async (paths) => {
      await addSlide(paths, 'alpha', 'Old');
      await moveSlideToTrash(paths, 'alpha', 1000);
      await addSlide(paths, 'alpha', 'New');
      await addSlide(paths, 'alpha-restored', 'Other');

      const restored = await restoreTrashEntry(paths, 'alpha.1000');
      expect(restored).toEqual({ ok: true, slideId: 'alpha-restored-2' });
      const source = await fs.readFile(
        path.join(paths.slidesRoot, 'alpha-restored-2', 'index.tsx'),
        'utf8',
      );
      expect(source).toContain("'Old'");
    }));

  it('keeps two deletions of the same id apart', () =>
    withWorkspace(async (paths) => {
      await addSlide(paths, 'alpha', 'First');
      await moveSlideToTrash(paths, 'alpha', 1000);
      await addSlide(paths, 'alpha', 'Second');
      await moveSlideToTrash(paths, 'alpha', 1000);
      const entries = await listTrash(paths, 2000);
      expect(entries.map((e) => [e.id, e.title])).toEqual([
        ['alpha.1001', 'Second'],
        ['alpha.1000', 'First'],
      ]);
    }));

  it('purges entries once 30 days have passed', () =>
    withWorkspace(async (paths) => {
      await addSlide(paths, 'old');
      await addSlide(paths, 'fresh');
      await moveSlideToTrash(paths, 'old', 1000);
      await moveSlideToTrash(paths, 'fresh', 5000);
      const now = 1000 + TRASH_RETENTION_MS;
      expect((await listTrash(paths, now)).map((e) => e.id)).toEqual(['fresh.5000']);
      expect(await exists(path.join(paths.trashRoot, 'old.1000'))).toBe(false);
      expect(await exists(path.join(paths.trashRoot, 'fresh.5000'))).toBe(true);
    }));

  it('deletes an entry for good', () =>
    withWorkspace(async (paths) => {
      await addSlide(paths, 'alpha');
      await moveSlideToTrash(paths, 'alpha', 1000);
      expect(await purgeTrashEntry(paths, 'alpha.1000')).toBe(true);
      expect(await purgeTrashEntry(paths, 'alpha.1000')).toBe(false);
      expect(await listTrash(paths, 2000)).toEqual([]);
    }));

  it('refuses ids that would leave the slides or trash folder', () =>
    withWorkspace(async (paths) => {
      await addSlide(paths, 'alpha');
      expect(await moveSlideToTrash(paths, '../alpha')).toMatchObject({ ok: false, status: 400 });
      expect(await moveSlideToTrash(paths, 'missing')).toMatchObject({ ok: false, status: 404 });
      expect(isTrashEntryId('../x.1')).toBe(false);
      expect(isTrashEntryId('alpha.1000')).toBe(true);
      expect(await purgeTrashEntry(paths, '..')).toBe(false);
      expect(await restoreTrashEntry(paths, 'alpha.1')).toMatchObject({ ok: false, status: 404 });
    }));

  it('skips folders in the trash that are not entries', () =>
    withWorkspace(async (paths) => {
      await fs.mkdir(path.join(paths.trashRoot, 'stray'), { recursive: true });
      await fs.mkdir(path.join(paths.trashRoot, 'half.1'), { recursive: true });
      await fs.writeFile(path.join(paths.trashRoot, 'half.1', 'entry.json'), '{"slideId":"half"}');
      expect(await listTrash(paths, 2000)).toEqual([]);
    }));
});
