import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PKG_NAME, PKG_NAMES } from './branding.ts';

function readDeps(userCwd: string): Record<string, string> {
  try {
    const raw = readFileSync(path.join(userCwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as Record<string, Record<string, string> | undefined>;
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return {};
  }
}

// The specifier a workspace's slide files import the framework through. A
// workspace can declare either name, and a dependency alias
// (`npm:@lemonriver/core@…`) only makes the key it is declared under
// resolvable — so the declared key is the one to write into files.
export function declaredFrameworkSpecifier(userCwd: string): string {
  const deps = readDeps(userCwd);
  for (const name of PKG_NAMES) {
    if (name in deps) return name;
  }
  return PKG_NAME;
}

export type FrameworkDependency = {
  /** The key the workspace declares the framework under. */
  key: string;
  /** The package actually installed, once an alias is resolved. */
  pkg: string;
  /** What to hand the package manager's `add` to move it to the latest version. */
  addTarget: string;
};

// `npm:@lemonriver/core@^0.1.0` → `@lemonriver/core`. A scoped name starts with
// `@`, so the version separator is the last `@` past the first character.
function aliasTarget(value: string): string | null {
  if (!value.startsWith('npm:')) return null;
  const rest = value.slice('npm:'.length);
  const at = rest.lastIndexOf('@');
  return at > 0 ? rest.slice(0, at) : rest;
}

// An update has to keep the shape the workspace declares: an aliased dependency
// re-added under its bare name would be replaced by the upstream package the
// alias was pointing away from.
export function readFrameworkDependency(userCwd: string): FrameworkDependency {
  const deps = readDeps(userCwd);
  for (const name of PKG_NAMES) {
    const value = deps[name];
    if (value === undefined) continue;
    const aliased = aliasTarget(value);
    return {
      key: name,
      pkg: aliased ?? name,
      addTarget: aliased ? `${name}@npm:${aliased}@latest` : `${name}@latest`,
    };
  }
  return { key: PKG_NAME, pkg: PKG_NAME, addTarget: `${PKG_NAME}@latest` };
}
