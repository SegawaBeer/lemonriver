#!/usr/bin/env node
// Reports `open-slide` references that are not part of the deliberate
// compatibility layer. Run after merging upstream: a hit is usually a file
// upstream just added under the pre-rename name.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SKIP_FILES = new Set([
  'AGENTS.md',
  'pnpm-lock.yaml',
  'scripts/check-branding.mjs',
  'scripts/upstream.mjs',
]);
const SKIP_SUFFIXES = ['/CHANGELOG.md', '/CHANGELOG.upstream.md'];
// `apps/web` is upstream's site; `.claude` is maintainer tooling that drives it.
const SKIP_PREFIXES = ['apps/web/', '.claude/'];

// Files that keep the old name on purpose: the compatibility layer itself, the
// legacy fixtures that prove it works, our own docs naming the upstream
// project, and pointers we cannot retarget yet.
const ALLOWED = [
  'CLAUDE.md',
  'README.md',
  'packages/core/src/branding.ts',
  'packages/core/src/branding.test.ts',
  'packages/core/src/config.ts',
  'packages/core/src/index.ts',
  'packages/core/src/editing/revert-asset.test.ts',
  'packages/core/src/editing/slide-ops.test.ts',
  'packages/core/src/vite/design-plugin.test.ts',
  'packages/core/src/vite/open-slide-plugin.test.ts',
  'packages/core/src/workspace-specifier.test.ts',
  'packages/core/src/cli/preflight.ts',
  'packages/core/package.json',
  'packages/cli/package.json',
  'packages/cli/src/index.ts',
  'packages/core/src/app/components/sidebar/sidebar.tsx',
  'packages/core/src/app/components/player.tsx',
];

// The demo is upstream's, kept byte-for-byte apart from one dependency line
// that points `@open-slide/core` at our package. It is what keeps upstream's
// demo changes mergeable, and it exercises the compatibility layer daily.
const ALLOWED_PREFIXES = ['apps/demo/'];

// Internal protocol and module names. Renaming these would drop users' saved
// state or churn files upstream edits constantly, for nothing users can see.
const INTERNAL = [
  /virtual:open-slide\//,
  /\.open-slide\b/,
  /open-slide:/,
  /open-slide-plugin/,
  /open-slide-presenter-/,
  // Prompt markers the agent panel and its parsers agree on. Only this package
  // reads them, so they stay as-is to keep prompt.ts mergeable.
  /open-slide-(context|questions|note)/,
  // Console log prefixes in upstream files; only developers see them.
  /\[open-slide\]/,
];

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !SKIP_FILES.has(f))
  .filter((f) => !SKIP_SUFFIXES.some((s) => f.endsWith(s)))
  .filter((f) => !SKIP_PREFIXES.some((p) => f.startsWith(p)))
  .filter((f) => !ALLOWED.includes(f))
  .filter((f) => !ALLOWED_PREFIXES.some((p) => f.startsWith(p)));

const hits = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (!text.includes('open-slide')) continue;
  text.split('\n').forEach((line, i) => {
    if (!line.includes('open-slide')) return;
    if (INTERNAL.some((re) => re.test(line))) return;
    hits.push(`${file}:${i + 1}: ${line.trim()}`);
  });
}

if (hits.length > 0) {
  console.error(`Found ${hits.length} open-slide reference(s) outside the compatibility layer:\n`);
  for (const hit of hits) console.error(`  ${hit}`);
  console.error('\nRename them, or add the file to ALLOWED in scripts/check-branding.mjs.');
  process.exit(1);
}

console.log(`check:branding — clean (${files.length} files scanned)`);
