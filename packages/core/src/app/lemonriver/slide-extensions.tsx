import { Workflow } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { hasModifier, isTypingTarget } from '@/lib/keys';
import { cn } from '@/lib/utils';
import { useSlot } from './chrome/use-slot';
import { isFeatureEnabled } from './features';
import { useNewDeckBrief } from './home/brief';
import { PendingPages } from './outline/pending-pages';
import { useLrText } from './text';

type Props = {
  slideId: string;
  overviewOpen: boolean;
};

/**
 * A key pressed with focus inside a menu or dialog belongs to that overlay. A
 * focused button does not: the shortcut has to reach the page from any view,
 * including the asset grid, whose own controls sit under the pointer.
 */
function isInsideOverlay(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest('[role="dialog"], [role="menu"], [role="listbox"]')
  );
}

export function SlideExtensions({ slideId, overviewOpen }: Props) {
  const enabled = isFeatureEnabled('board');
  const navigate = useNavigate();
  const slot = useSlot('data-lr-rail-actions', enabled);
  useNewDeckBrief(slideId);
  const lr = useLrText();

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        isTypingTarget(e.target) ||
        isInsideOverlay(e.target) ||
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

  if (!enabled) return null;

  return (
    <>
      {slot &&
        createPortal(
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
        )}
      <PendingPages slideId={slideId} />
    </>
  );
}
