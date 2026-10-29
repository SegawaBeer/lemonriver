import { useEffect, useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { useLrText } from '../text';
import { setReduceMotionSetting, useReduceMotionSetting } from '../theme/motion';
import { LR_THEME_CHOICES, type LrThemeChoice } from '../theme/themes';
import { useTheme } from '../theme/use-theme';

const SWATCH: Record<LrThemeChoice, { bg: string; fg: string }> = {
  system: { bg: 'linear-gradient(90deg,#fafbf5 50%,#111412 50%)', fg: '#13240f' },
  light: { bg: '#fafbf5', fg: '#13240f' },
  dark: { bg: '#111412', fg: '#eef3ea' },
  lime: { bg: 'linear-gradient(160deg,#eef56a,#9bc929)', fg: '#12300f' },
};

export function SettingsPage() {
  const t = useLocale();
  const lr = useLrText();
  const { theme, setTheme } = useTheme();
  const reduceMotion = useReduceMotionSetting();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const names: Record<LrThemeChoice, string> = {
    system: t.themeToggle.system,
    light: t.themeToggle.light,
    dark: t.themeToggle.dark,
    lime: lr.theme.lime,
  };

  return (
    <div data-lr-settings className="max-w-[760px]">
      <header className="mb-6">
        <h1 className="font-heading text-[28px] font-bold leading-[34px] tracking-[-0.01em]">
          {lr.settings.title}
        </h1>
        <p className="lr-on-lime mt-0.5 text-[14px] text-muted-foreground">
          {lr.settings.subtitle}
        </p>
      </header>

      <section className="rounded-[16px] border border-border bg-card px-6 py-5 shadow-[var(--lr-shadow-1)]">
        <h2 className="text-[16px] font-semibold">{lr.settings.appearance}</h2>
        <p className="mt-1 mb-4 text-[14px] text-muted-foreground">{lr.settings.appearanceHint}</p>
        <div
          role="radiogroup"
          aria-label={t.themeToggle.title}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {LR_THEME_CHOICES.map((choice) => {
            const picked = mounted && theme === choice;
            return (
              // biome-ignore lint/a11y/useSemanticElements: a card-shaped radio, as in the design package
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={picked}
                data-lr-theme-card={choice}
                onClick={() => setTheme(choice)}
                className={cn(
                  'rounded-[12px] border-[1.5px] bg-card px-1.5 pt-1.5 pb-2.5 text-[14px] font-medium outline-none',
                  'transition-[border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring/40',
                  picked
                    ? 'border-[var(--lr-focus)] shadow-[0_0_0_3px_var(--lr-accent-soft)]'
                    : 'border-border hover:border-[var(--lr-text-3)]',
                )}
              >
                <span
                  aria-hidden
                  className="relative mb-2 block h-16 overflow-hidden rounded-[8px] ring-1 ring-black/5"
                  style={{ background: SWATCH[choice].bg, color: SWATCH[choice].fg }}
                >
                  <span className="absolute top-[18%] left-[10%] h-[12%] w-[45%] rounded-[4px] bg-current opacity-85" />
                  <span className="absolute bottom-[16%] left-[10%] h-[22%] w-[32%] rounded-[6px] bg-[#fcd810]" />
                </span>
                {names[choice]}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-4 border-t border-border pt-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold">{lr.settings.reduceMotion}</p>
            <p className="text-[12px] text-muted-foreground">{lr.settings.reduceMotionHint}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={reduceMotion}
            aria-label={lr.settings.reduceMotion}
            onClick={() => setReduceMotionSetting(!reduceMotion)}
            className="lr-switch outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>
      </section>
    </div>
  );
}
