import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { format } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { toneForUses, type UseId } from '../agent-prefs/prefs';
import { updateAgentPrefs } from '../agent-prefs/use-prefs';
import { HelperMascot, type HelperRole, Mascot } from '../brand/mascot';
import { useLrText } from '../text';

export const ONBOARDED_KEY = 'lemonriver:onboarded';

const STEPS = 3;

function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return true;
  }
}

function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {}
}

export function Onboarding() {
  const lr = useLrText();
  const [open, setOpen] = useState(() => !isOnboarded());
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);

  function close(withTone: boolean) {
    if (withTone) {
      const tone = toneForUses(picked);
      if (tone) updateAgentPrefs({ tone });
    }
    markOnboarded();
    setOpen(false);
  }

  const helpers: { role: HelperRole; name: string; line: string }[] = [
    { role: 'research', name: lr.build.research, line: lr.onboarding.researchLine },
    { role: 'outline', name: lr.build.outline, line: lr.onboarding.outlineLine },
    { role: 'design', name: lr.build.design, line: lr.onboarding.designLine },
    { role: 'review', name: lr.build.review, line: lr.onboarding.reviewLine },
  ];

  const uses: { id: UseId; label: string }[] = [
    { id: 'report', label: lr.onboarding.useReport },
    { id: 'pitch', label: lr.onboarding.usePitch },
    { id: 'lecture', label: lr.onboarding.useLecture },
    { id: 'launch', label: lr.onboarding.useLaunch },
    { id: 'training', label: lr.onboarding.useTraining },
    { id: 'other', label: lr.onboarding.useOther },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close(false);
      }}
    >
      <DialogContent data-lr-onboarding="" showCloseButton={false} className="sm:max-w-[520px]">
        {step === 0 && (
          <div
            data-lr-onboarding-step="1"
            className="flex flex-col items-center gap-3 py-2 text-center"
          >
            <Mascot state="idle" size={88} float />
            <DialogTitle className="text-[20px] leading-snug">
              {lr.onboarding.step1Title}
            </DialogTitle>
            <DialogDescription className="max-w-[380px] text-[13.5px] leading-relaxed">
              {lr.onboarding.step1Body}
            </DialogDescription>
          </div>
        )}

        {step === 1 && (
          <div data-lr-onboarding-step="2">
            <DialogTitle className="text-[18px] leading-snug">
              {lr.onboarding.step2Title}
            </DialogTitle>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {helpers.map((helper) => (
                <div key={helper.role} className="flex items-start gap-2 text-left">
                  <HelperMascot role={helper.role} state="idle" size={36} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">{helper.name}</p>
                    <p className="text-[12px] leading-snug text-muted-foreground">{helper.line}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div data-lr-onboarding-step="3">
            <DialogTitle className="text-[18px] leading-snug">
              {lr.onboarding.step3Title}
            </DialogTitle>
            <DialogDescription className="mt-1 text-[13px]">
              {lr.onboarding.step3Body}
            </DialogDescription>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {uses.map((use) => {
                const on = picked.includes(use.id);
                return (
                  <button
                    key={use.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setPicked((prev) =>
                        on ? prev.filter((id) => id !== use.id) : [...prev, use.id],
                      )
                    }
                    className={cn(
                      'h-8 rounded-full border px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40',
                      on
                        ? 'border-[var(--lr-accent)] bg-[var(--lr-accent-soft)] text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:border-[var(--lr-text-3)]',
                    )}
                  >
                    {use.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-1 flex items-center justify-between gap-3">
          {step === 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => close(false)}>
              {lr.onboarding.skip}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
            >
              {lr.onboarding.back}
            </Button>
          )}

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="sr-only">{format(lr.onboarding.progress, { k: step + 1 })}</span>
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  aria-hidden
                  className={cn(
                    'size-1.5 rounded-full transition-colors',
                    dot === step ? 'bg-[var(--lr-focus)]' : 'bg-border',
                  )}
                />
              ))}
            </div>
            {step < STEPS - 1 ? (
              <Button type="button" size="sm" onClick={() => setStep((current) => current + 1)}>
                {lr.onboarding.next}
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={() => close(true)}>
                {lr.onboarding.start}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
