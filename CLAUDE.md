# LemonRiver — Framework Repo Guide

This is LemonRiver's framework layer: the runtime, CLI, and tooling forked from open-slide and published as `@lemonriver/core` and `@lemonriver/cli`.

`AGENTS.md` is upstream's file, kept byte-for-byte so upstream merges stay clean. Its package and command names are the pre-rename ones. **This file is authoritative.**

(Slide-authoring guidance lives in the `slide-authoring` / `create-slide` skills under `packages/core/skills/`. Those ship to end-user workspaces — edit them there, never the generated copy under `packages/cli/template/.agents/skills/`.)

## Relationship to upstream

| Remote | Points at | Use |
| --- | --- | --- |
| `upstream` | `1weiho/open-slide` | Read-only. Push is disabled. |
| `origin` | `SegawaBeer/lemonriver` | Our repo, and `remote.pushDefault`. |
| `mine` | `SegawaBeer/open-slide` | Public fork. Only for branches that become upstream PRs. |

Pull upstream updates:

```bash
pnpm upstream:check
pnpm upstream:merge
```

See "Following upstream" below. `check:branding` fails on any `@open-slide` reference outside the compatibility allowlist — a merge usually surfaces a file upstream just added that imports the old specifier, and that is where to rename it.

## The compatibility layer — do not remove

Workspaces scaffolded before the rename have to keep working with zero edits, so these deliberately still accept the old names:

- both package manifests register a `lemonriver` **and** an `open-slide` bin
- the config loader tries `lemonriver.config.ts`, then `open-slide.config.ts`
- the version probe, the dev child-process entry, and the two places that write an import into a user's slide file accept either specifier
- the self-updater re-adds whichever specifier the workspace declares, so a dependency alias (`"@open-slide/core": "npm:@lemonriver/core@…"`) survives an update instead of being replaced by the upstream package
- `OpenSlideConfig` and `OpenSlideBuildConfig` stay exported as deprecated aliases
- `apps/demo` keeps upstream's names throughout and reaches our package through a
  dependency alias. Leave its files alone: that is what lets upstream's demo
  changes merge cleanly, and it exercises the compatibility layer on every build.
  The lab decks beside it do the same.

Virtual module ids (`virtual:open-slide/*`), HMR event names, storage keys, and the `node_modules/.open-slide/` data directory are internal protocol. Leaving those alone is deliberate: renaming them would drop users' saved state and buy nothing.

## Following upstream

Two commands, and nothing else:

```bash
pnpm upstream:check   # what landed upstream, and which files a merge will fight over
pnpm upstream:merge   # fetch, merge, install, then re-run the branding check
```

`merge` stops rather than guessing when files conflict. The files it predicts are
computed — both sides edited them since they diverged — so the list stays correct
as the fork grows. Conflicts are where our work and upstream's overlap; the rest
of the tree follows upstream untouched.

## Layout

pnpm + Turbo monorepo.

| Path | Package | Role |
| --- | --- | --- |
| `packages/core` | `@lemonriver/core` | Runtime (viewer, present mode, inspector), Vite plugin, `lemonriver` dev/build CLI. |
| `packages/cli` | `@lemonriver/cli` | `npx @lemonriver/cli init` scaffolder + project template. |
| `apps/demo` | private | Local consumer of `@lemonriver/core` via `workspace:*`. Dogfood target — run `pnpm dev` here. |
| `apps/web` | private | Upstream's marketing site, left untouched. Not published. |

Shared config: `biome.json`, `turbo.json`, `pnpm-workspace.yaml`, `tsconfig` per package.

## Workflow

```bash
pnpm dev          # turbo: runs demo against local core
pnpm build        # build all packages
pnpm typecheck    # tsc across the graph (demo needs typescript installed to pass)
pnpm check        # biome (format + lint + organize imports)
pnpm check:fix    # auto-fix what biome can
pnpm test         # vitest
```

Filter to one package: `pnpm core <script>` / `pnpm cli <script>`.

## Hard rules

- **Biome must pass before commit.** Run `pnpm check` (or `pnpm check:fix`).
- **If `packages/core` or `packages/cli` changes, add a changeset.** Run `pnpm changeset`, pick the right package(s) and bump. Apps and root tooling do **not** need one.
- **Changeset descriptions: short and direct.** One line, present-tense, what changed from a user's perspective.
- Don't bump versions or edit `CHANGELOG.md` by hand — `changeset version` owns that.
- Don't add dependencies casually. The `core` runtime ships to users; every dep inflates install size.
- `packages/core/src/app/components/ui` is shadcn-generated and biome-ignored — leave it alone unless regenerating.
- **Default to writing no comments.** Only add one when the WHY is non-obvious — a hidden constraint, a subtle invariant, a workaround for a specific bug, behavior that would surprise a reader. Don't explain WHAT the code does, don't reference tasks/PRs/callers, don't write section-divider banners or module-header descriptions, and don't leave commented-out code.

## Versioning

`@lemonriver/core` and `@lemonriver/cli` run their own version line, starting at 0.1.0 (based on open-slide 2.0.1). Pre-fork history is kept in `packages/*/CHANGELOG.upstream.md`.

The changelog uses `@changesets/cli/changelog`, not the GitHub plugin: this repo is private, and the GitHub plugin needs a token for every `changeset version` run.

## Releasing

`pnpm release` builds `core` + `cli` and runs `changeset publish`. Triggered by the maintainer, not by agents. The workflow in `.github/workflows/release.yml` fires on pushes to `main`; publishing needs the `@lemonriver` scope configured for npm trusted publishing.
