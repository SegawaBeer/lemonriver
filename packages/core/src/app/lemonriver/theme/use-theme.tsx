import { Citrus } from 'lucide-react';
import { useTheme as useNextTheme } from 'next-themes';
import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import type { CommandSpec } from '@/components/command/command-menu';
import { format } from '@/lib/use-locale';
import type { Locale } from '../../../locale/types';
import { lrTextFor } from '../text';
import { motionReduced } from './motion';

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

/** Cross-fades the whole page once while the theme changes, unless motion is reduced. */
export function switchTheme(setTheme: (theme: string) => void, next: string): void {
  const doc = document as ViewTransitionDocument;
  if (motionReduced() || typeof doc.startViewTransition !== 'function') {
    setTheme(next);
    return;
  }
  doc.startViewTransition(() => flushSync(() => setTheme(next)));
}

/** next-themes' hook, with every theme change cross-faded. */
export function useTheme() {
  const value = useNextTheme();
  const { setTheme: apply } = value;
  const setTheme = useCallback((next: string) => switchTheme(apply, next), [apply]);
  return { ...value, setTheme };
}

/** The lime entry for the command menu's appearance group. */
export function lemonRiverAppearanceCommands(
  t: Locale,
  theme: string | undefined,
  setTheme: (theme: string) => void,
): CommandSpec[] {
  return [
    {
      id: 'theme-lime',
      label: format(t.commandMenu.themeItem, { name: lrTextFor(t.id).theme.lime }),
      icon: <Citrus />,
      keywords: ['theme', 'lime', 'appearance'],
      active: theme === 'lime',
      run: () => setTheme('lime'),
    },
  ];
}
