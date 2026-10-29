export type LrPage =
  | 'home'
  | 'themes'
  | 'assets'
  | 'settings'
  | 'trash'
  | 'new'
  | 'editor'
  | 'board'
  | 'presenter'
  | 'preview'
  | 'other';

/** Pages that wear the lime theme when it is picked; the editor and present views stay fresh. */
const BRAND_PAGES: ReadonlySet<LrPage> = new Set([
  'home',
  'themes',
  'assets',
  'settings',
  'trash',
  'new',
]);

/**
 * BRAND_PAGES as a path pattern, for the pre-paint script, which runs before
 * any module loads. pages.test.ts keeps the two in step.
 */
export const BRAND_PATH_SOURCE = '^/(themes(/.*)?|assets|settings|trash|new)?/*$';

/** Agent screenshots and thumbnails render through this route; nothing may cover it. */
export const PREVIEW_PATH_SOURCE = '^/s/[^/]+/preview/*$';

export const REDUCE_MOTION_KEY = 'lemonriver:reduce-motion';

export const SPLASH_ID = 'lr-splash';

export function pageForPath(pathname: string): LrPage {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return 'home';
  if (path === '/themes' || path.startsWith('/themes/')) return 'themes';
  if (path === '/assets') return 'assets';
  if (path === '/settings') return 'settings';
  if (path === '/trash') return 'trash';
  if (path === '/new') return 'new';
  if (/^\/s\/[^/]+\/board$/.test(path)) return 'board';
  if (/^\/s\/[^/]+\/presenter$/.test(path)) return 'presenter';
  if (/^\/s\/[^/]+\/preview$/.test(path)) return 'preview';
  if (/^\/s\/[^/]+$/.test(path)) return 'editor';
  return 'other';
}

export function isBrandPage(page: LrPage): boolean {
  return BRAND_PAGES.has(page);
}

export const SETTINGS_VIEW_ID = '__lr_settings__';
export const TRASH_VIEW_ID = '__lr_trash__';

/** The sidebar selection for our pages inside the home shell, or null for the official ones. */
export function lemonRiverViewFor(pathname: string): string | null {
  const page = pageForPath(pathname);
  if (page === 'settings') return SETTINGS_VIEW_ID;
  if (page === 'trash') return TRASH_VIEW_ID;
  return null;
}
