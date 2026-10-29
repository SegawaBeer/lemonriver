import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import done from './mascots/lemon-done.png';
import idle from './mascots/lemon-idle.png';
import needsYou from './mascots/lemon-needs-you.png';
import thinking from './mascots/lemon-thinking.png';
import working from './mascots/lemon-working.png';

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
