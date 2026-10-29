# @lemonriver/cli

Build a workspace for [LemonRiver](https://github.com/SegawaBeer/lemonriver) in one command. It installs the current version of the framework and the skills an agent reads to author slides, so the first deck can start from a sentence.

## Usage

```bash
npx @lemonriver/cli init my-slide --use-pnpm
cd my-slide
pnpm dev
```

`init` installs the dependencies itself; `--use-npm`, `--use-yarn` and `--use-bun` pick a different one, and `--no-install` skips it.

Open the address the dev server prints, press **New deck**, and tell the agent what the deck is about.

This creates a workspace containing:

- `slides/getting-started/` — a starter deck you can edit or delete.
- `package.json` — depends on the current `@lemonriver/core`, which provides the runtime (home page, deck viewer, story board, present mode, agent panel) and the `lemonriver` CLI.
- `lemonriver.config.ts` — optional typed config (slidesDir, port).
- `.claude/skills/` and `.agents/skills/` — the skills agents use: `create-slide`, `apply-comments`, `create-theme`, `current-slide`, `slide-authoring`.
- `CLAUDE.md` and `AGENTS.md` — the guide each agent reads before writing a page.

You won't see any Vite, React, or tsconfig files in the workspace. They live inside `@lemonriver/core` and you never touch them.

## Commands

| Command | Description |
| --- | --- |
| `lemonriver init [dir]` | Scaffold a new workspace in `dir` (defaults to current dir). |
| `lemonriver init --force` | Scaffold into a non-empty directory. |
| `lemonriver init --name <name>` | Override the generated `package.json` name. |

(Once installed in the workspace, `@lemonriver/core` provides `lemonriver dev`, `lemonriver build`, and `lemonriver preview` via its own bin.)

## Authoring

Inside the scaffolded workspace, slides live under `slides/<kebab-case-id>/index.tsx` and default-export an array of `Page` components. Each page renders into a fixed 1920×1080 canvas; the framework handles scaling.

Ask your agent to "make slides about X" and the `create-slide` skill will take it from there — or open the agent panel in the browser and start from a sentence there.
