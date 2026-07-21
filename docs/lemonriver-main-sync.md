# LemonRiver and upstream main sync guide

This repository is used in two different ways:

1. As a fork/second-development environment for the open-slide application.
2. As the private LemonRiver workspace that contains the user's finished slides, customer materials, images, videos, code snippets, exported files, and backups.

Keep those two uses separate. When in doubt, protect private LemonRiver content first.

## Worktree and branch roles

| Folder | Branch | Role | Sharing rule |
| --- | --- | --- | --- |
| `/Users/changzhichao_work/Documents/AI-Maker/open-slide-main` | `main` | Official open-slide baseline synced from GitHub. | May track GitHub. Do not add LemonRiver private slides or assets. |
| `/Users/changzhichao_work/Documents/AI-Maker/open-slide-fix-pptx-export` | `fix-image-pptx-export-images` | Clean public bugfix branch for framework fixes. | May be proposed upstream, but must contain framework code only. |
| `/Users/changzhichao_work/Documents/AI-Maker/LemonRiver-dev` | `lemonriver-dev` | Private LemonRiver development version. Test upstream updates and local changes here first. | Local/private unless the user explicitly says otherwise. |
| `/Users/changzhichao_work/Documents/AI-Maker/LemonRiver-stable` | `lemonriver-stable` | Private daily-use stable version. | Local/private. Advance only from `lemonriver-dev`. |

Current snapshot when this file was created on 2026-07-21:

- `main`: `df17137` (`@open-slide/core` 1.17.1, `@open-slide/cli` 1.4.1)
- `lemonriver-dev`: `801b6d3` before this policy commit
- `lemonriver-stable`: `801b6d3` before this policy commit

Always verify live state with `git status`, `git log`, and `git worktree list`; this snapshot is only orientation.

## Inheritance model

The intended promotion chain is:

```text
official GitHub main
        |
        v
open-slide-main / main
        |
        | merge only after user approval
        v
LemonRiver-dev / lemonriver-dev
        |
        | promote only after testing and user confirmation
        v
LemonRiver-stable / lemonriver-stable
```

Do not merge `main` directly into `lemonriver-stable`.

Do not push `lemonriver-dev` or `lemonriver-stable` to GitHub unless the user explicitly asks and acknowledges that the branches may contain private materials.

## Updating official main

Only use the official worktree for this:

```bash
cd /Users/changzhichao_work/Documents/AI-Maker/open-slide-main
git status --short --branch
git fetch origin main --tags
git pull --ff-only
```

This updates the official baseline only. It does not update LemonRiver by itself.

After updating, summarize the upstream changes by comparing the old LemonRiver base with the new `main`, especially:

- `packages/core/CHANGELOG.md`
- `packages/cli/CHANGELOG.md`
- `apps/demo/slides`
- `packages/core/skills`
- `apps/web/content/docs`
- package and lockfile changes

## Updating LemonRiver-dev from main

Do this only after the user approves bringing official changes into LemonRiver.

Before merging:

```bash
cd /Users/changzhichao_work/Documents/AI-Maker/LemonRiver-dev
git status --short --branch
git worktree list
```

If there are unrelated local edits, identify them and preserve them. Do not revert user changes without explicit permission.

Merge from local `main`:

```bash
git merge main
```

Then install and verify if dependencies changed:

```bash
pnpm install
pnpm dev
```

If the dev server starts, inspect the actual LemonRiver slide library, not just the command result.

## Promoting LemonRiver-dev to stable

Only promote after:

- dev server starts in `LemonRiver-dev`
- private slide folders are still present
- local slide assets resolve
- no slide stays stuck on loading
- no obvious runtime errors appear
- export paths that matter to the user have been checked
- the user confirms the dev version is acceptable

Then fast-forward stable:

```bash
cd /Users/changzhichao_work/Documents/AI-Maker/LemonRiver-stable
git status --short --branch
git merge --ff-only lemonriver-dev
```

If `--ff-only` fails, stop and explain the divergence. Do not force merge stable unless the user approves the plan.

## Conflict handling rules

When conflicts appear, classify each file before editing.

### Private slide and asset files

Examples:

- `apps/demo/slides/**`
- `apps/demo/slides/.folders.json`
- `apps/demo/slides/_backups/**`
- slide-local `assets/`
- generated/exported deck materials

Default decision: preserve LemonRiver private content.

When upstream demo changes conflict with LemonRiver slide archives, keep LemonRiver folders and folder metadata unless the user explicitly asks to replace them with official demos. Official demo slides are examples; LemonRiver slides are user work.

### Framework code

Examples:

- `packages/core/**`
- `packages/cli/**`
- root build/test/package config
- `pnpm-lock.yaml`

Default decision: prefer upstream `main`, then reapply only intentional LemonRiver framework fixes.

If a local framework change is meant for public contribution, keep or move it to a clean bugfix branch. Do not let private slide materials enter that branch.

### Known migration issue: morph transition API

Official open-slide stabilized the old shared-element API:

- `unstable_SharedElement` became `MorphElement`
- transition option `sharedElements` became `morph`
- official `magic-move-demo` was renamed to `morph-demo`

When merging recent `main` into LemonRiver, search for old usage:

```bash
rg -n "unstable_SharedElement|sharedElements|magic-move-demo" apps/demo/slides packages apps
```

Migrate LemonRiver slides to the new API rather than deleting those slides.

### Non-ASCII slide folder ids

Recent upstream code skips slide folders whose ids are not ASCII-safe. LemonRiver may use Chinese display names in `meta.title` or folder labels, but slide folder ids should stay ASCII/kebab-case.

Good:

```text
apps/demo/slides/comac-ontology
apps/demo/slides/weichai-data-governance
```

Avoid:

```text
apps/demo/slides/商飞项目
apps/demo/slides/潍柴培训
```

## Asset locality rules

LemonRiver slides must be self-contained enough to survive other project folders moving or being deleted.

- One-off materials for a deck go under `apps/demo/slides/<slide-id>/assets/`.
- Shared private materials go under the project-level assets folder if the app uses one.
- Do not import images, videos, code, or documents from unrelated project folders by absolute path.
- Do not leave symlinks inside slide assets unless the user explicitly asks for linked storage.
- If a slide is loading forever, first check missing imports, deleted files, invalid symlinks, and browser console errors.

Suggested checks:

```bash
find apps/demo/slides -type l -print
rg -n "from ['\"]/(Users|Volumes|private|var)/|new URL\\(['\"]/(Users|Volumes|private|var)/" apps/demo/slides
rg -n "unstable_SharedElement|sharedElements" apps/demo/slides
```

## Public bugfix branch rule

Use `open-slide-fix-pptx-export` / `fix-image-pptx-export-images` for public framework fixes only.

Before any upstream PR or push from a bugfix branch, verify:

```bash
git status --short --branch
git diff --stat main...HEAD
git diff --name-only main...HEAD
```

If the diff contains `apps/demo/slides/**` private materials, stop. Do not push.

## Agent behavior checklist

Before doing anything operational in LemonRiver:

1. Confirm which folder/worktree you are in.
2. Confirm the active branch.
3. Read this file and root `AGENTS.md`.
4. Preserve unrelated dirty worktree changes.
5. Ask before merging `main` into `lemonriver-dev`.
6. Ask before promoting `lemonriver-dev` into `lemonriver-stable`.
7. Never push private branches without explicit approval.
8. Verify the actual app behavior, not just that git commands succeeded.
