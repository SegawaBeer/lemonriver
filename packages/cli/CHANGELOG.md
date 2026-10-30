# @lemonriver/cli

## 0.1.2

### Patch Changes

- New workspaces start on the latest LemonRiver release.

## 0.1.1

### Patch Changes

- New workspaces scaffold against the current core release instead of the stale 0.0.6 range.

LemonRiver starts its own version line at 0.1.0. The scaffolder's history before the fork is kept in [CHANGELOG.upstream.md](CHANGELOG.upstream.md).

## 0.1.0

### Minor Changes

- Rename the packages to `@lemonriver/core` and `@lemonriver/cli`, with `lemonriver` as the new CLI command and `lemonriver.config.ts` as the new config file. Workspaces written before the rename keep working: the old package specifier, the old `open-slide` command, and `open-slide.config.ts` all still resolve.
