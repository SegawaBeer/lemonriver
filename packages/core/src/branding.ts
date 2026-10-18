export const PKG_NAME = '@lemonriver/core';
export const LEGACY_PKG_NAME = '@open-slide/core';

// Workspaces scaffolded before the rename still declare the old specifier.
// Every reader accepts both; anything written back into a user's files must
// follow whichever one that workspace already uses.
export const PKG_NAMES: readonly string[] = [PKG_NAME, LEGACY_PKG_NAME];

export const CONFIG_FILE = 'lemonriver.config.ts';
export const LEGACY_CONFIG_FILE = 'open-slide.config.ts';

// Order matters: the current name wins when a workspace carries both.
export const CONFIG_FILES: readonly string[] = [CONFIG_FILE, LEGACY_CONFIG_FILE];

export const BIN_NAME = 'lemonriver';
export const LEGACY_BIN_NAME = 'open-slide';

export function isFrameworkSpecifier(source: string): boolean {
  return PKG_NAMES.includes(source);
}
