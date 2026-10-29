import { existsSync, statSync } from 'node:fs';
import { findOnPath } from '../../../agent/detect.ts';

// Apps that ship a command line keep it inside their bundle, out of PATH.
export function findCommand(
  fixedPaths: readonly string[],
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  for (const file of fixedPaths) {
    try {
      if (statSync(file, { throwIfNoEntry: false })?.isFile()) return file;
    } catch {}
  }
  return findOnPath(name, env);
}

export function appInstalled(bundle: string): boolean {
  try {
    return existsSync(bundle);
  } catch {
    return false;
  }
}
