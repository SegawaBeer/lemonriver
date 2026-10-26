import { Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { hasModifier, isShortcutControlTarget, isTypingTarget } from '@/lib/keys';
import { cn } from '@/lib/utils';
import { isFeatureEnabled } from './features';
import { useLrText } from './text';

type Props = {
  slideId: string;
  overviewOpen: boolean;
};

function useRailActionsSlot(enabled: boolean): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const find = () => document.querySelector<HTMLElement>('[data-lr-rail-actions]');
    setSlot(find());
    const observer = new MutationObserver(() => {
      const next = find();
      setSlot((prev) => (prev === next ? prev : next));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [enabled]);

  return slot;
}

export function SlideExtensions({ slideId, overviewOpen }: Props) {
  const enabled = isFeatureEnabled('board');
  const navigate = useNavigate();
  const slot = useRailActionsSlot(enabled);
  const lr = useLrText();

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        isTypingTarget(e.target) ||
        isShortcutControlTarget(e.target) ||
        e.isComposing ||
        e.keyCode === 229 ||
        e.defaultPrevented
      )
        return;
      if (hasModifier(e)) return;
      if (overviewOpen) return;
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        navigate(`/s/${encodeURIComponent(slideId)}/board`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, navigate, overviewOpen, slideId]);

  if (!enabled || !slot) return null;

  return createPortal(
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => navigate(`/s/${encodeURIComponent(slideId)}/board`)}
            aria-label={lr.board.openBoard}
            className={cn(
              'flex size-5 items-center justify-center rounded-[3px] text-muted-foreground/70 outline-none',
              'motion-safe:transition-colors hover:bg-muted hover:text-foreground',
              'focus-visible:ring-1 focus-visible:ring-brand',
            )}
          >
            <Workflow className="size-3.5" strokeWidth={1.75} />
          </button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {lr.board.openBoard}
      </TooltipContent>
    </Tooltip>,
    slot,
  );
}
