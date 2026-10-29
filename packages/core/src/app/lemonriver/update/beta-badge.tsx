import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLrText } from '../text';

export function BetaBadge() {
  const t = useLrText().update;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="ml-1 shrink-0 cursor-default rounded-[3px] border border-border px-1 py-px font-medium text-[9px] text-muted-foreground uppercase leading-none tracking-wider">
            {t.beta}
          </span>
        }
      />
      <TooltipContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-64 px-3 py-2.5 text-left text-pretty"
      >
        <p className="font-medium text-[12px]">{t.betaTitle}</p>
        <p className="mt-1 text-[11.5px] text-background/70 leading-relaxed">{t.betaHint}</p>
      </TooltipContent>
    </Tooltip>
  );
}
