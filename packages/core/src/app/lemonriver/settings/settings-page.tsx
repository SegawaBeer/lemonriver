import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import type { AgentPrefs } from '../agent-prefs/prefs';
import { updateAgentPrefs, useAgentPrefs } from '../agent-prefs/use-prefs';
import { AgentProvidersSection } from '../agent-providers/section';
import { HelperMascot, type HelperRole } from '../brand/mascot';
import { ONBOARDED_KEY } from '../onboarding/onboarding';
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
  const navigate = useNavigate();
  const prefs = useAgentPrefs();
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

  function replayOnboarding() {
    try {
      localStorage.removeItem(ONBOARDED_KEY);
    } catch {}
    navigate('/new');
  }

  const helpers: {
    role: HelperRole;
    label: string;
    value: string;
    apply: (value: string) => void;
    options: { value: string; label: string }[];
  }[] = [
    {
      role: 'research',
      label: lr.build.research,
      value: prefs.research,
      apply: (value) => updateAgentPrefs({ research: value as AgentPrefs['research'] }),
      options: [
        { value: 'uploads', label: lr.prefs.researchUploads },
        { value: 'web', label: lr.prefs.researchWeb },
      ],
    },
    {
      role: 'outline',
      label: lr.build.outline,
      value: prefs.outline,
      apply: (value) => updateAgentPrefs({ outline: value as AgentPrefs['outline'] }),
      options: [
        { value: 'review', label: lr.prefs.outlineReview },
        { value: 'direct', label: lr.prefs.outlineDirect },
      ],
    },
    {
      role: 'design',
      label: lr.build.design,
      value: prefs.design,
      apply: (value) => updateAgentPrefs({ design: value as AgentPrefs['design'] }),
      options: [
        { value: 'visual', label: lr.prefs.designVisual },
        { value: 'balanced', label: lr.prefs.designBalanced },
        { value: 'dense', label: lr.prefs.designDense },
      ],
    },
    {
      role: 'review',
      label: lr.build.review,
      value: prefs.review,
      apply: (value) => updateAgentPrefs({ review: value as AgentPrefs['review'] }),
      options: [
        { value: 'strict', label: lr.prefs.reviewStrict },
        { value: 'numbers', label: lr.prefs.reviewNumbers },
      ],
    },
  ];

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

      {import.meta.env.DEV && <AgentProvidersSection />}

      {import.meta.env.DEV && (
        <section
          data-lr-agent-prefs
          className="mt-5 rounded-[16px] border border-border bg-card px-6 py-5 shadow-[var(--lr-shadow-1)]"
        >
          <h2 className="text-[16px] font-semibold">{lr.prefs.title}</h2>
          <p className="mt-1 mb-2 text-[14px] text-muted-foreground">{lr.prefs.hint}</p>

          <PrefsSwitch
            label={lr.prefs.confirmEachPage}
            hint={lr.prefs.confirmEachPageHint}
            checked={prefs.confirmEachPage}
            onChange={(value) => updateAgentPrefs({ confirmEachPage: value })}
          />
          <PrefsSwitch
            label={lr.prefs.askOnMismatch}
            hint={lr.prefs.askOnMismatchHint}
            checked={prefs.askOnMismatch}
            onChange={(value) => updateAgentPrefs({ askOnMismatch: value })}
          />
          <PrefsSwitch
            label={lr.prefs.autoImages}
            hint={lr.prefs.autoImagesHint}
            checked={prefs.autoImages}
            onChange={(value) => updateAgentPrefs({ autoImages: value })}
          />

          <div className="mt-4 border-t border-border pt-4">
            <p className="text-[14px] font-semibold">{lr.prefs.tone}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <PrefPill
                pressed={prefs.tone === 'steady'}
                onClick={() => updateAgentPrefs({ tone: 'steady' })}
              >
                {lr.prefs.toneSteady}
              </PrefPill>
              <PrefPill
                pressed={prefs.tone === 'friendly'}
                onClick={() => updateAgentPrefs({ tone: 'friendly' })}
              >
                {lr.prefs.toneFriendly}
              </PrefPill>
              <PrefPill
                pressed={prefs.tone === 'concise'}
                onClick={() => updateAgentPrefs({ tone: 'concise' })}
              >
                {lr.prefs.toneConcise}
              </PrefPill>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-border pt-4 sm:grid-cols-4">
            {helpers.map((helper) => (
              <div
                key={helper.role}
                data-lr-pref-helper={helper.role}
                className="flex flex-col items-center gap-1.5 rounded-[12px] border border-border bg-muted/30 px-2 py-3 text-center"
              >
                <HelperMascot role={helper.role} state="idle" size={32} />
                <span className="text-[12px] font-semibold">{helper.label}</span>
                <div className="flex flex-wrap justify-center gap-1">
                  {helper.options.map((option) => (
                    <PrefPill
                      key={option.value}
                      compact
                      pressed={helper.value === option.value}
                      onClick={() => helper.apply(option.value)}
                    >
                      {option.label}
                    </PrefPill>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <button
              type="button"
              onClick={replayOnboarding}
              className="rounded text-[13px] text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {lr.prefs.replayOnboarding}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function PrefsSwitch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-4 border-t border-border pt-3">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">{label}</p>
        <p className="text-[12px] text-muted-foreground">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="lr-switch outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
    </div>
  );
}

function PrefPill({
  pressed,
  compact = false,
  onClick,
  children,
}: {
  pressed: boolean;
  compact?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'min-h-8 rounded-full border px-3 py-1 text-center text-[12.5px] leading-snug font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40',
        compact ? 'px-2.5 text-[11.5px]' : '',
        pressed
          ? 'border-[var(--lr-accent)] bg-[var(--lr-accent-soft)] text-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-[var(--lr-text-3)]',
      )}
    >
      {children}
    </button>
  );
}
