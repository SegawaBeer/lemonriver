# LemonRiver and upstream main sync guide

LemonRiver is split across **two independent git repositories**:

| Repo | Path | What it holds | Sharing |
| --- | --- | --- | --- |
| Framework fork | `/Users/changzhichao_work/Documents/AI-Maker/LemonRiver-dev` | open-slide source: `packages/core`, `packages/cli`, `apps/web`, upstream demo slides, root tooling. | May be pushed to GitHub **private**. |
| Content repo | `/Users/changzhichao_work/Documents/AI-Maker/LemonRiver-stable` | The user's private decks, themes, assets. Consumes the framework as a packed tarball under `vendor/`. | **Local only. Never pushed anywhere.** |

They share no git history and no working tree. The framework repo has no private
content in it, so the elaborate protected-paths rules this file used to carry are
gone — the separation is structural now, not procedural.

Split on 2026-08-27. Before that both were worktrees of this one repo, which is
why older commits here contain private decks.

## Worktrees of the framework repo

| Folder | Branch | Role |
| --- | --- | --- |
| `LemonRiver-dev` | `lemonriver-dev` | Second development. Upstream lands here after user approval. |
| `open-slide-main` | `main` | Official upstream baseline, synced from GitHub. |
| `open-slide-fix-pptx-export` | `fix-image-pptx-export-images` | Clean public bugfix branch, framework code only. |
| `LemonRiver-stable-legacy` | `lemonriver-stable` | **Frozen archive** of the pre-split state. Kept only until the user is done with it; do not develop here. |

`git worktree list` is the live answer. This table is orientation.

## Inheritance model

```text
official GitHub main
        |
        v
open-slide-main / main
        |
        | git merge, only after user approval
        v
LemonRiver-dev / lemonriver-dev
        |
        | pnpm pack, after verification
        v
LemonRiver-stable/vendor/open-slide-core-<version>+<sha>.tgz
```

Framework code only ever travels **downward**. The content repo never sends code
back up; if a defect shows up while authoring slides, reproduce it here.

## Updating official main

```bash
cd /Users/changzhichao_work/Documents/AI-Maker/open-slide-main
git status --short --branch
git fetch origin main --tags
git pull --ff-only
```

This updates the baseline only. Then summarize what changed before proposing a
merge, especially:

- `packages/core/CHANGELOG.md`, `packages/cli/CHANGELOG.md`
- `packages/core/skills`
- `apps/web/content/docs`
- package and lockfile changes

## Updating LemonRiver-dev from main

Only after the user approves.

```bash
cd /Users/changzhichao_work/Documents/AI-Maker/LemonRiver-dev
git status --short --branch
git merge main
pnpm install    # if dependencies changed
pnpm dev
```

Preserve unrelated local edits. Don't revert user changes without permission.

Watch for API renames that the content repo's decks would trip over — upstream
has done this before (`unstable_SharedElement` → `MorphElement`,
`sharedElements` → `morph`). Grep the content repo, not just this one:

```bash
rg -n "unstable_SharedElement|sharedElements" ../LemonRiver-stable/slides
```

## Shipping to the content repo

The content repo depends on `file:vendor/open-slide-core-<version>+<sha>.tgz`,
which pins in `pnpm-lock.yaml` by path. To ship a framework update:

```bash
cd /Users/changzhichao_work/Documents/AI-Maker/LemonRiver-dev
pnpm core build
SHA=$(git rev-parse --short HEAD)
cd packages/core && pnpm pack --pack-destination /tmp
# rename so provenance is unambiguous — the version string alone can't tell a
# local build apart from the real npm release of the same number
mv "/tmp/open-slide-core-$(node -p "require('./package.json').version").tgz" \
   "/tmp/open-slide-core-$(node -p "require('./package.json').version")+$SHA.tgz"
```

Then in the content repo: drop the new tarball into `vendor/`, point
`dependencies['@open-slide/core']` at it, `pnpm install`, and verify before
deleting the old tarball. Keep the previous one until the new one is proven —
rolling back is then a one-line edit.

Verify in the content repo, not here:

- dev server starts, every deck loads with no failed requests
- slide-local and `@assets/` imports resolve
- presenter view and present-mode paging work
- PDF and image-PPTX export still produce the right page count

## Public bugfix branch rule

Use `fix-image-pptx-export-images` (or another dedicated branch) for anything
headed upstream. Before pushing or opening a PR:

```bash
git status --short --branch
git diff --name-only main...HEAD
```

Private content can no longer reach these branches by accident, but a stray
local scratch deck still can. If the diff touches `apps/demo/slides/**` and the
change isn't about an official demo, stop.

## Local guardrails

`.git/info/exclude` (not `.gitignore`, so it never shows up in an upstream PR)
ignores `_backups/`, `_exports/`, `apps/demo/slides/_sources/`, and
`apps/demo/slides/_plans/`. It applies to every worktree of this repo.

Rationale: a 406MB backup tarball was once committed here and its blob is still
in `.git`. Keeping backups unstageable is cheaper than rewriting history again.

## Agent behavior checklist

1. Confirm which repo you are in — `git rev-parse --show-toplevel`. The two
   LemonRiver repos look alike at a glance and share directory-name prefixes.
2. Confirm the active branch.
3. Preserve unrelated dirty worktree changes.
4. Ask before merging `main` into `lemonriver-dev`.
5. Never push a private branch without explicit approval.
6. Verify actual app behavior, not just that git commands succeeded.
