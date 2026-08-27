# open-slide — Framework Repo Guide

## LemonRiver fork policy

This repo is **LemonRiver-dev**, the user's private fork of open-slide. It holds framework code only — the runtime, CLI, tooling, and the official upstream demo slides. Before merging upstream, committing, or pushing, read [docs/lemonriver-main-sync.md](docs/lemonriver-main-sync.md).

Short version:

- `main` / `open-slide-main` is the official upstream baseline. `lemonriver-dev` receives it only after explicit user approval.
- **Private slide content does not live here.** It lives in a separate repo (`../LemonRiver-stable`), which consumes this fork as a packed tarball. Never copy private decks, customer materials, backups, or generated decks into this repo.
- This fork may be pushed to GitHub **private**. Public framework fixes belong on dedicated clean branches such as `fix-image-pptx-export-images`.

## Worktree execution role

This worktree is the **framework developer environment**.

- Framework investigation, upstream integration, compatibility fixes, and changes under `packages/core`, `packages/cli`, `apps/web`, or root tooling happen here.
- `apps/demo/slides` tracks upstream demos only. Use them (or a scratch deck) to reproduce defects — don't pull a private deck over from the content repo to debug.
- Ship a verified framework change to the content repo by packing it, not by copying source. See "Shipping to the content repo" in the sync guide.

You are working on the **open-slide framework** — the runtime, CLI, and tooling that ship to npm.

## Layout

pnpm + Turbo monorepo.

| Path | Package | Role |
| --- | --- | --- |
| `packages/core` | `@open-slide/core` | Runtime (viewer, present mode, inspector), Vite plugin, `open-slide` dev/build CLI. |
| `packages/cli` | `@open-slide/cli` | `npx @open-slide/cli init` scaffolder + project template. |
| `apps/demo` | private | Local consumer of `@open-slide/core` via `workspace:*`. Dogfood target — run `pnpm dev` here to exercise the framework. |
| `apps/web` | private | Marketing site (Next.js). |

Shared config: `biome.json`, `turbo.json`, `pnpm-workspace.yaml`, `tsconfig` per package.

## Workflow

```bash
pnpm dev          # turbo: runs demo against local core
pnpm build        # build all packages
pnpm typecheck    # tsc across the graph
pnpm check        # biome (format + lint + organize imports)
pnpm check:fix    # auto-fix what biome can
pnpm test         # vitest
```

Filter to one package: `pnpm core <script>` / `pnpm cli <script>`.

## Hard rules

- **Biome must pass before commit.** Run `pnpm check` (or `pnpm check:fix`). CI and the user's review both expect a clean tree.
- **If `packages/core` or `packages/cli` changes, add a changeset.** Run `pnpm changeset`, pick the right package(s) and bump (`patch` for fixes/polish, `minor` for new public API, `major` for breaking). Apps (`demo`, `web`) and root tooling do **not** need one.
- **Changeset descriptions: short and direct.** One line, present-tense, what changed from a user's perspective. Match the tone of `.changeset/*.md` already in the repo. No paragraphs, no rationale, no "this PR…".
  - Good: `Replace spinner with a hairline + sliding bar for slide and presenter loading states.`
  - Bad: `This change introduces a new loading indicator because the previous spinner felt heavy and we wanted something more subtle for presentation contexts…`
- Don't bump versions or edit `CHANGELOG.md` by hand — `changeset version` owns that.
- Don't add dependencies casually. The `core` runtime ships to users; every dep inflates install size.
- `packages/core/src/app/components/ui` is shadcn-generated and biome-ignored — leave it alone unless regenerating.
- **Default to writing no comments.** Only add one when the WHY is non-obvious — a hidden constraint, a subtle invariant, a workaround for a specific bug, behavior that would surprise a reader. Don't explain WHAT the code does (well-named identifiers handle that), don't reference tasks/PRs/callers ("added for X", "used by Y"), don't write section-divider banners (`// ── Section ──`) or module-header descriptions, and don't leave commented-out code. If removing a comment wouldn't confuse a future reader, don't write it.

## Releasing (reference)

`pnpm release` builds `core` + `cli` and runs `changeset publish`. Triggered by the maintainer, not by agents.
