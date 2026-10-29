# @lemonriver/core

## 0.4.0

### Minor Changes

- 6522bb7: Agent preferences in Settings, a confirmation card when the review needs your call, and a three-screen welcome on the guided deck page.
- 7e52187: Build a deck one page at a time with a team panel, pause and resume, pick up where it stopped, and undo back to the outline.
- f2b219e: Start a deck from a brief: upload reference files, review and edit the outline, then build the deck from it.
- 17bf156: Prompt in the app when a newer LemonRiver is out, with update and restart in one place; mark the version as Beta.

### Patch Changes

- d12e3e1: Show New deck before an agent is connected, so first-time users can create a deck and install an agent from the panel.
- 557b56e: Fade to black when entering and leaving present mode, and nudge the slide with a hint when stepping past the last slide.

## 0.3.0

### Minor Changes

- d030fe0: Restyle the app with the LemonRiver design: four themes including Lime, Lemon status feedback, a new home page, a 30-day trash with undo, and a Settings page.

### Patch Changes

- de09f6f: Fix the story board failing to open in installed workspaces: it imported files the package did not ship.

## 0.2.0

### Minor Changes

- Bring in open-slide 2.3.1: an in-app agent panel that drives a locally installed Claude Code or Codex, a comment mode with floating pins, a chrome-less single-page preview route, Spanish UI, and fixes for present-mode letterboxing, narrow toolbars, thumbnail arrow keys and undo/redo.
- 36c8c07: Story board cards can now take a name, a status and a work memo, and two cards can be linked with a dashed line that can be hidden — all stored with the board, never written into the deck.

## 0.1.1

### Patch Changes

- Publish the bin paths without a leading `./` so npm stops printing a misleading "script name was invalid and removed" warning on every release. The commands themselves are unchanged.

LemonRiver starts its own version line at 0.1.0. The framework's history before the fork — every release up to open-slide 2.0.1, which this version is based on — is kept in [CHANGELOG.upstream.md](CHANGELOG.upstream.md).

## 0.1.0

### Minor Changes

- Rename the packages to `@lemonriver/core` and `@lemonriver/cli`, with `lemonriver` as the new CLI command and `lemonriver.config.ts` as the new config file. Workspaces written before the rename keep working: the old package specifier, the old `open-slide` command, and `open-slide.config.ts` all still resolve.
- 81558c3: Add a story board view for a deck: pages laid out in chapter columns on a pannable canvas. Drag a card to reorder, double-click to open the page in the editor, right-click to duplicate or delete, write speaker notes straight on a card, rename a column, or add a blank page to one. The board keeps its own column structure beside the project, so a chapter page is an ordinary card — moving it never re-groups the pages it used to head.

### Patch Changes

- abafe9e: Undo and redo now jump back to the page where the edit was made and select the changed element, and the undo/redo buttons show their keyboard shortcuts.
