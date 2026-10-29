# @lemonriver/core

The runtime behind [LemonRiver](https://github.com/SegawaBeer/lemonriver) — a slide framework built for agents. Describe a deck in one sentence, review the outline, and the agent lays it out page by page; this package supplies everything around the slides themselves.

## Install

```bash
pnpm add @lemonriver/core
```

Most people get this installed automatically by running `npx @lemonriver/cli init`. Use this package directly only if you're wiring up an existing workspace by hand.

## What you get

- **A deck you can walk through** — a home page listing your decks, a viewer with a thumbnail rail and keyboard navigation, and fullscreen present mode with presenter view.
- **Building with an agent** — the in-app agent panel drives Claude Code, Codex or WorkBuddy: outline first, then one page at a time, with pause, resume and undo.
- **The story board** — every page grouped into chapters, with drag to reorder, folding, multi-select, filters and undo.
- **Editing in the browser** — comment mode that pins notes to the page, and an inspector for changing the selected element directly.
- **Export** — static HTML, PDF, and editable PPTX.

Every page renders into a fixed **1920 × 1080** canvas and the framework handles the scaling, so slides look the same in the editor, in present mode and in the exported files.

## What's inside the package

- **Runtime** — home page, deck viewer, thumbnail rail, story board, keyboard navigation, fullscreen presenter mode, and the agent panel.
- **Vite plugin** — discovers `slides/<id>/index.{tsx,jsx,ts,js}`, exposes them via virtual modules, and reloads when slides are added or removed.
- **CLI** — `lemonriver dev | build | preview` so workspaces never need to touch Vite, React, or tsconfig directly.

## CLI

Once installed, the `lemonriver` bin is available in the workspace:

| Command | Description |
| --- | --- |
| `lemonriver dev` | Start the dev server. Flags: `-p, --port <port>`, `--host [host]`, `--open`. |
| `lemonriver build` | Build a static site. Flags: `--out-dir <dir>` (defaults to `dist`). |
| `lemonriver preview` | Preview the production build. Flags: `-p, --port <port>`, `--host [host]`, `--open`. |

## Config

Create `lemonriver.config.ts` in the workspace root (all fields optional):

```ts
import type { OpenSlideConfig } from '@lemonriver/core';

const openSlideConfig: OpenSlideConfig = {
  slidesDir: 'slides',
  port: 5173,
};

export default openSlideConfig;
```

### Hosting under a subpath

Set `base` to deploy the built site under a sub-directory (intranet folders, GitHub Pages project sites, reverse proxies). Use a leading and trailing slash:

```ts
const openSlideConfig: OpenSlideConfig = {
  base: '/my-slides/',
};
```

The value is passed straight to Vite's `base` and to React Router's `basename`, so client-side navigation matches the deployed path.

## Authoring slides

Slides live under `slides/<kebab-case-id>/index.tsx` and default-export an array of `Page` components:

```tsx
import type { Page } from '@lemonriver/core';

const Cover: Page = () => (
  <div className="flex h-full w-full items-center justify-center">
    <h1 className="text-[120px] font-bold">Hello, LemonRiver</h1>
  </div>
);

const pages: Page[] = [Cover];
export default pages;

export const meta = { title: 'Hello' };
```

## Exports

```ts
import {
  CANVAS_WIDTH,   // 1920
  CANVAS_HEIGHT,  // 1080
  MorphElement,   // match or fade objects across pages for morph transitions
  type Page,
  type SlideMeta,
  type SlideModule,
  type SlideTransition,
  type OpenSlideConfig,
} from '@lemonriver/core';
```

The Vite plugin is exposed under a subpath for advanced setups:

```ts
import { createViteConfig } from '@lemonriver/core/vite';
```

## License

MIT
