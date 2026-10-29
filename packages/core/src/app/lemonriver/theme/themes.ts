/** next-themes values. next-themes adds `system` itself. */
export const LR_THEMES = ['light', 'dark', 'lime'];

export type LrThemeChoice = 'system' | 'light' | 'dark' | 'lime';

export const LR_THEME_CHOICES: readonly LrThemeChoice[] = ['system', 'light', 'dark', 'lime'];

export function isLrThemeChoice(value: unknown): value is LrThemeChoice {
  return typeof value === 'string' && (LR_THEME_CHOICES as readonly string[]).includes(value);
}

/** The theme part of <html>'s class list, so other class changes don't count as a switch. */
export function themeClassOf(className: string): string {
  const classes = className.split(/\s+/);
  return LR_THEMES.filter((theme) => classes.includes(theme)).join(' ');
}
