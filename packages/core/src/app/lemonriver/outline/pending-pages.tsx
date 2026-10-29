import { createPortal } from 'react-dom';
import { format } from '@/lib/use-locale';
import { useSlot } from '../chrome/use-slot';
import { useLrText } from '../text';
import { useBuildDriver } from './use-build-driver';

/** The pages the build has not reached yet, listed under the thumbnail rail. */
export function PendingPages({ slideId }: { slideId: string }) {
  const lr = useLrText().build;
  const slot = useSlot('data-lr-rail-pending');
  const { outline } = useBuildDriver(slideId);

  if (!slot || !outline || outline.state !== 'building') return null;
  const pending = outline.items.slice(outline.built);
  if (pending.length === 0) return null;

  return createPortal(
    <div data-lr-pending-pages className="max-h-[240px] overflow-y-auto px-2 py-2">
      <ul className="flex flex-col gap-1">
        {pending.map((item, index) => (
          <li
            key={item.id}
            data-lr-pending-page
            className="rounded-[8px] border border-dashed border-border px-2 py-1.5 opacity-70"
          >
            <p className="truncate text-[11.5px] text-foreground">
              {format(lr.pendingPage, {
                k: outline.built + index + 1,
                title: item.title || lr.pending,
              })}
            </p>
            <span className="text-[10.5px] text-muted-foreground">{lr.pending}</span>
          </li>
        ))}
      </ul>
    </div>,
    slot,
  );
}
