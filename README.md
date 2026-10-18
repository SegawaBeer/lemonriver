# LemonRiver

**The slide framework built for agents.** Describe your deck in natural language — your coding agent writes the React. LemonRiver handles the canvas, scaling, navigation, hot reload, and present mode so the agent can focus on content.

Every slide renders into a fixed **1920 × 1080** canvas. Pages are arbitrary React components, not a constrained DSL.

```bash
npx @lemonriver/cli init my-slide
```

## Why LemonRiver

Slides are visual code. Agents are great at writing code. LemonRiver is the runtime that turns "make slides about X" into a polished, presentable deck — without you ever leaving the chat.

## Highlights

### 🤖 Agent-native authoring

Works with any coding agent (Claude Code, Codex, Cursor, …). The scaffolder ships with built-in skills:

- **`/create-slide`** — drafts a deck end-to-end. Asks four scoping questions (topic & aesthetic, page count, text density, motion vs. static), picks an id, plans the structure, and writes the pages.
- **`/slide-authoring`** — the technical reference for the 1920 × 1080 canvas, type scale, palette, and layout rules. The agent reads this before writing.

From a one-line prompt to a polished deck, no boilerplate.

### 🎯 In-browser inspector

Click any element in the dev server and attach a comment — *"make this red"*, *"change to 'LemonRiver Rocks'"*, *"shrink the headline"*. Comments are persisted as `@slide-comment` markers in source. Run `/apply-comments` and the agent applies every pending edit, then clears the markers.

The loop: present → click to comment → `/apply-comments` → repeat.

### 🖼️ Assets manager + svgl logo search

Manage images, videos, and fonts per deck through a built-in assets panel. Search and drop in any brand logo via the integrated [svgl](https://svgl.app/) catalogue — no more hunting for SVGs.

### 🎬 Professional present mode

Fullscreen playback with keyboard navigation, plus a **presenter mode** with current/next slide preview, speaker notes, and a timer. Built for the stage, not just the browser tab.

### 📦 Export to static HTML, PDF & PPTX

One command exports your deck as a self-contained static HTML site, a print-ready PDF, or an editable PowerPoint file. The PPTX export runs entirely in the browser and turns each page into native text boxes, shapes, and images — no server, no headless browser.

### 📁 Slide manager

Organise decks into folders with custom emoji and drag-and-drop to reorder. Useful once you've built more than three decks and need to find anything.

### 🚀 Deploy-friendly

Outputs a plain static build — one-click deploy to Vercel, Cloudflare Pages, Zeabur, Netlify, or any static host. No server, no runtime, no lock-in.

## Get started

```bash
npx @lemonriver/cli init my-slide
cd my-slide
pnpm dev
```

The scaffolded workspace ships with agent skills preconfigured for Claude Code. From there you drive the deck through your agent — or edit `slides/<id>/index.tsx` directly. See [CLAUDE.md](CLAUDE.md) for the hard rules.

## Repo layout

This repo is a pnpm + Turbo monorepo.

| Path | Description |
| --- | --- |
| [packages/core](packages/core) | `@lemonriver/core` — runtime (home page, slide viewer, present mode, inspector), Vite plugin, and the `lemonriver` dev/build/preview CLI. |
| [packages/cli](packages/cli) | `@lemonriver/cli` — `npx @lemonriver/cli init` scaffolder. Generates a minimal workspace where Vite/React/tsconfig stay hidden inside core. |
| [apps/demo](apps/demo) | Example workspace that consumes `@lemonriver/core` via `workspace:*`. Used for local development of the framework. |

## Development

```bash
pnpm install
pnpm dev      # runs the demo against the local @lemonriver/core
pnpm build    # builds all packages
pnpm check    # lints and formats via biome
pnpm test     # runs vitest
```

## Relationship to open-slide

LemonRiver is a fork of [open-slide](https://github.com/1weiho/open-slide) and tracks it as `upstream`. The framework still resolves workspaces written against the pre-rename package name and config file, so decks authored before the fork keep working unchanged.

## License

MIT. The original copyright notice is retained in [LICENSE](LICENSE).
