import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import designDone from './mascots/design-done.png';
import designIdle from './mascots/design-idle.png';
import designNeedsYou from './mascots/design-needs-you.png';
import designWorking from './mascots/design-working.png';
import done from './mascots/lemon-done.png';
import idle from './mascots/lemon-idle.png';
import needsYou from './mascots/lemon-needs-you.png';
import thinking from './mascots/lemon-thinking.png';
import working from './mascots/lemon-working.png';
import outlineDone from './mascots/outline-done.png';
import outlineIdle from './mascots/outline-idle.png';
import outlineNeedsYou from './mascots/outline-needs-you.png';
import outlineWorking from './mascots/outline-working.png';
import researchDone from './mascots/research-done.png';
import researchIdle from './mascots/research-idle.png';
import researchNeedsYou from './mascots/research-needs-you.png';
import researchWorking from './mascots/research-working.png';
import reviewDone from './mascots/review-done.png';
import reviewIdle from './mascots/review-idle.png';
import reviewNeedsYou from './mascots/review-needs-you.png';
import reviewWorking from './mascots/review-working.png';

export type MascotState = 'idle' | 'thinking' | 'working' | 'needs-you' | 'done';

export const MASCOT_SRC: Record<MascotState, string> = {
  idle,
  thinking,
  working,
  'needs-you': needsYou,
  done,
};

/** Lemon. Floats while idle and bounces once when its state changes; both stop under reduced motion. */
export function Mascot({
  state,
  size,
  float = false,
  className,
}: {
  state: MascotState;
  size: number;
  float?: boolean;
  className?: string;
}) {
  const first = useRef(true);
  const [bounce, setBounce] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: state is the trigger
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setBounce((n) => n + 1);
  }, [state]);

  return (
    <img
      key={bounce}
      src={MASCOT_SRC[state]}
      alt=""
      aria-hidden
      draggable={false}
      width={size}
      height={size}
      data-lr-mascot={state}
      data-float={float && bounce === 0 ? '' : undefined}
      data-bounce={bounce > 0 ? '' : undefined}
      className={cn('lr-mascot shrink-0', className)}
      style={{ width: size, height: size }}
    />
  );
}

export type HelperRole = 'research' | 'outline' | 'design' | 'review';
export type HelperState = 'idle' | 'working' | 'done' | 'needs-you';

const HELPER_SRC: Record<HelperRole, Record<HelperState, string>> = {
  research: {
    idle: researchIdle,
    working: researchWorking,
    done: researchDone,
    'needs-you': researchNeedsYou,
  },
  outline: {
    idle: outlineIdle,
    working: outlineWorking,
    done: outlineDone,
    'needs-you': outlineNeedsYou,
  },
  design: {
    idle: designIdle,
    working: designWorking,
    done: designDone,
    'needs-you': designNeedsYou,
  },
  review: {
    idle: reviewIdle,
    working: reviewWorking,
    done: reviewDone,
    'needs-you': reviewNeedsYou,
  },
};

/** One of the four helpers on the build team; floats and bounces like Lemon. */
export function HelperMascot({
  role,
  state,
  size,
}: {
  role: HelperRole;
  state: HelperState;
  size: number;
}) {
  const first = useRef(true);
  const [bounce, setBounce] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: state is the trigger
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setBounce((n) => n + 1);
  }, [state]);

  return (
    <img
      key={bounce}
      src={HELPER_SRC[role][state]}
      alt=""
      aria-hidden
      draggable={false}
      width={size}
      height={size}
      data-lr-helper={role}
      data-lr-helper-state={state}
      data-bounce={bounce > 0 ? '' : undefined}
      className={cn('lr-mascot shrink-0', state === 'idle' && 'opacity-45')}
      style={{ width: size, height: size }}
    />
  );
}
