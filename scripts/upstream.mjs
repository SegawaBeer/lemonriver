#!/usr/bin/env node
// Following upstream takes two operations:
//
//   pnpm upstream:check   what landed since the last merge
//   pnpm upstream:merge   take it, then report what needs fixing
//
// The fork tracks open-slide; everything else in this repo is ours. A merge
// that lands cleanly still needs the branding check afterwards, because
// upstream writes the pre-rename package name into new files.
import { execFileSync } from 'node:child_process';

const UPSTREAM = 'upstream/main';
const BRANCH = 'main';

function run(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    if (allowFail) return null;
    throw err;
  }
}

function lines(text) {
  return text ? text.split('\n').filter(Boolean) : [];
}

function behind() {
  return Number(run(['rev-list', '--count', `${BRANCH}..${UPSTREAM}`]));
}

// Files both sides edited since they diverged — exactly the ones a merge fights
// over. Computed rather than listed so it stays right as the fork grows.
function contested() {
  const base = run(['merge-base', BRANCH, UPSTREAM]);
  const ours = new Set(lines(run(['diff', '--name-only', base, BRANCH])));
  return lines(run(['diff', '--name-only', base, UPSTREAM])).filter((f) => ours.has(f));
}

function fetchUpstream() {
  process.stdout.write('Fetching upstream… ');
  if (run(['fetch', 'upstream'], { allowFail: true }) === null) {
    console.log('failed.');
    console.log('\n  Could not reach the upstream repository. Check the network, then retry.');
    process.exit(1);
  }
  console.log('done');
}

// `apps/demo/slides/x.tsx` → `apps/demo`. Keeps a long conflict list readable.
function byArea(files) {
  const counts = new Map();
  for (const f of files) {
    const parts = f.split('/');
    const area = parts.length > 2 ? parts.slice(0, 2).join('/') : f;
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function report() {
  const n = behind();
  if (n === 0) {
    console.log('\nNothing new. main is level with upstream.');
    return 0;
  }

  console.log(`\nUpstream is ${n} commit${n === 1 ? '' : 's'} ahead of main.\n`);

  console.log('Commits');
  for (const line of lines(run(['log', '--oneline', `${BRANCH}..${UPSTREAM}`])).slice(0, 20)) {
    console.log(`  ${line}`);
  }
  if (n > 20) console.log(`  … and ${n - 20} more`);

  const changed = lines(run(['diff', '--name-only', `${BRANCH}...${UPSTREAM}`]));
  console.log(`\nFiles: ${changed.length} changed`);

  const fights = contested();
  if (fights.length > 0) {
    console.log(`\nBoth sides edited ${fights.length} of them, so expect the merge to stop in:`);
    for (const [area, count] of byArea(fights).slice(0, 12)) {
      console.log(`  ${String(count).padStart(3)}  ${area}`);
    }
    console.log("\n  These are where our work and upstream's overlap: the compatibility");
    console.log('  layer, the docs site, and the repo guide. Most resolve by keeping');
    console.log("  both sides — upstream's change plus our code around it.");
  } else {
    console.log('Neither side touched the same file, so the merge should land clean.');
  }

  return n;
}

function check() {
  fetchUpstream();
  report();
}

function merge() {
  const branch = run(['branch', '--show-current']);
  if (branch !== BRANCH) {
    console.log(`\nOn "${branch}", not "${BRANCH}". Switch to ${BRANCH} first.`);
    process.exit(1);
  }

  const dirty = lines(run(['status', '--porcelain']));
  if (dirty.length > 0) {
    console.log(`\n${dirty.length} uncommitted change(s). Commit or stash them first.`);
    process.exit(1);
  }

  fetchUpstream();
  if (behind() === 0) {
    console.log('\nNothing to merge — main is already level with upstream.');
    return;
  }

  console.log('\nMerging…');
  const merged = run(['merge', UPSTREAM], { allowFail: true });
  if (merged === null) {
    const conflicted = lines(run(['diff', '--name-only', '--diff-filter=U']));
    console.log(
      '\nThe merge stopped on conflicts. Nothing was lost — the merge is still in progress.\n',
    );
    for (const f of conflicted) console.log(`  ${f}`);
    console.log('\nResolve those, then:');
    console.log('  git add <files> && git commit --no-edit');
    console.log('\nTo back out instead:');
    console.log('  git merge --abort');
    process.exit(1);
  }

  console.log('  merged');
  console.log('\nInstalling dependencies…');
  execFileSync('pnpm', ['install'], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log('  done');

  console.log('\nChecking for upstream names that came back…');
  try {
    execFileSync('node', ['scripts/check-branding.mjs'], { stdio: 'inherit' });
  } catch {
    console.log('\n  Those are new files upstream added under the pre-rename name.');
    console.log('  Rename them, then run `pnpm check:branding` again.');
  }

  console.log('\nMerged. Next:');
  console.log('  pnpm check && pnpm typecheck && pnpm test');
  console.log('\nThen review and push:');
  console.log('  git push origin main');
}

const mode = process.argv[2];
if (mode === 'check') check();
else if (mode === 'merge') merge();
else {
  console.log('Usage: node scripts/upstream.mjs check|merge');
  process.exit(1);
}
