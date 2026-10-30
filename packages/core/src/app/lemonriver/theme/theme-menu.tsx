import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconTooltip, MenuTooltipTrigger } from '@/components/icon-tooltip';
import { buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { useLrText } from '../text';
import { LemonThemeIcon } from './lemon-icon';
import { useTheme } from './use-theme';

/** The sidebar's theme button, with the lime theme added. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const t = useLocale();
  const lr = useLrText();

  useEffect(() => {
    setMounted(true);
  }, []);

  const items = [
    { id: 'system', label: t.themeToggle.system, icon: <Monitor /> },
    { id: 'light', label: t.themeToggle.light, icon: <Sun /> },
    { id: 'dark', label: t.themeToggle.dark, icon: <Moon /> },
    { id: 'lime', label: lr.theme.lime, icon: <LemonThemeIcon /> },
  ];

  return (
    <DropdownMenu>
      <IconTooltip label={t.themeToggle.title}>
        <DropdownMenuTrigger
          render={
            <MenuTooltipTrigger
              type="button"
              aria-label={t.themeToggle.toggleAria}
              className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'relative')}
            />
          }
        >
          <Sun className="size-3.5 scale-100 rotate-0 opacity-100 ease-swift motion-safe:transition-[opacity,scale,rotate] motion-safe:duration-200 dark:scale-75 dark:-rotate-90 dark:opacity-0" />
          <Moon className="absolute size-3.5 scale-75 rotate-90 opacity-0 ease-swift motion-safe:transition-[opacity,scale,rotate] motion-safe:duration-200 dark:scale-100 dark:rotate-0 dark:opacity-100" />
        </DropdownMenuTrigger>
      </IconTooltip>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onClick={() => setTheme(item.id)}
            data-active={mounted && theme === item.id}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
