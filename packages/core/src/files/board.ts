import fs from 'node:fs/promises';
import path from 'node:path';
import { type BoardStructure, sanitizeStructure } from './board-structure.ts';

export type { BoardColumn, BoardStructure } from './board-structure.ts';

export function boardStructurePath(userCwd: string, slideId: string): string {
  return path.join(userCwd, '.open-slide', 'board', `${slideId}.json`);
}

export async function readBoardStructure(file: string): Promise<BoardStructure | null> {
  try {
    return sanitizeStructure(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch {
    return null;
  }
}

export async function writeBoardStructure(file: string, structure: BoardStructure): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(structure, null, 2)}\n`, 'utf8');
}
