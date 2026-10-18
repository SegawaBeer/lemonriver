# @lemonriver/core

LemonRiver starts its own version line at 0.1.0. The framework's history before the fork — every release up to open-slide 2.0.1, which this version is based on — is kept in [CHANGELOG.upstream.md](CHANGELOG.upstream.md).

## 0.1.0

### Minor Changes

- Rename the packages to `@lemonriver/core` and `@lemonriver/cli`, with `lemonriver` as the new CLI command and `lemonriver.config.ts` as the new config file. Workspaces written before the rename keep working: the old package specifier, the old `open-slide` command, and `open-slide.config.ts` all still resolve.
- 81558c3: Add a story board view for a deck: pages laid out in chapter columns on a pannable canvas. Drag a card to reorder, double-click to open the page in the editor, right-click to duplicate or delete, write speaker notes straight on a card, rename a column, or add a blank page to one. The board keeps its own column structure beside the project, so a chapter page is an ordinary card — moving it never re-groups the pages it used to head.

### Patch Changes

- abafe9e: Undo and redo now jump back to the page where the edit was made and select the changed element, and the undo/redo buttons show their keyboard shortcuts.
