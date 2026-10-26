import fs from 'node:fs/promises';
import path from 'node:path';
import {
  type BoardStructure,
  sanitizeStructure,
} from '../../app/lemonriver/board/model/structure.ts';

export type { BoardColumn, BoardStructure } from '../../app/lemonriver/board/model/structure.ts';

export function boardStructurePath(userCwd: string, slideId: string): string {
  return path.join(userCwd, '.open-slide', 'board', `${slideId}.json`);
}

/** The whole board file. Columns, cards and links each own one field of it. */
export async function readBoardFile(file: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function readBoardStructure(file: string): Promise<BoardStructure | null> {
  return sanitizeStructure(await readBoardFile(file));
}

const pending = new Map<string, Promise<unknown>>();

/**
 * Rewrites the fields `fields` names and keeps every other one. Updates to the
 * same file run one after another: the columns and the cards are saved by
 * separate requests, and two read-modify-writes racing would drop one of them.
 */
export function updateBoardFile(file: string, fields: Record<string, unknown>): Promise<void> {
  const previous = pending.get(file) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(async () => {
      const current = await readBoardFile(file);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, `${JSON.stringify({ ...current, ...fields }, null, 2)}\n`, 'utf8');
    });
  pending.set(file, run);
  void run
    .finally(() => {
      if (pending.get(file) === run) pending.delete(file);
    })
    .catch(() => undefined);
  return run;
}

export async function writeBoardStructure(file: string, structure: BoardStructure): Promise<void> {
  await updateBoardFile(file, { columns: structure.columns });
}
