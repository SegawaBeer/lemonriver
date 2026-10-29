import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { format, plural } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import {
  HelperMascot,
  type HelperRole,
  type HelperState,
  Mascot,
  type MascotState,
} from '../brand/mascot';
import { useLrText } from '../text';
import { teamState } from './model';
import { useBuildDriver } from './use-build-driver';

function basePath(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, '');
}

function leadMascot(state: ReturnType<typeof teamState>['lead']): MascotState {
  if (state === 'working') return 'working';
  if (state === 'done') return 'done';
  if (state === 'needs-you') return 'needs-you';
  if (state === 'idle') return 'idle';
  return 'thinking';
}

function helperMascot(state: ReturnType<typeof teamState>['design']): HelperState {
  return state === 'none' ? 'idle' : state;
}

type Event = { id: number; text: string };

function nextEventId(seq: { current: number }): number {
  seq.current += 1;
  return seq.current;
}

export function BuildTeam({ slideId }: { slideId: string }) {
  const lr = useLrText().build;
  const { outline, action, running, waitingForAnswer, connected, pause, resume, undo } =
    useBuildDriver(slideId);
  const [events, setEvents] = useState<Event[]>([]);
  const [hidden, setHidden] = useState(false);
  const previous = useRef<typeof outline>(undefined);
  const eventSeq = useRef(0);
  const toasted = useRef(false);

  const built = outline?.built ?? 0;
  const total = outline?.items.length ?? 0;
  const state = outline?.state;

  useEffect(() => {
    if (!outline) return;
    const prev = previous.current;
    previous.current = outline;
    if (!prev) return;
    const add: Event[] = [];
    if (outline.built > prev.built) {
      add.push({ id: nextEventId(eventSeq), text: format(lr.eventPage, { k: outline.built }) });
      add.push({ id: nextEventId(eventSeq), text: lr.eventSaved });
    }
    if (prev.stage !== 'review' && outline.stage === 'review') {
      add.push({ id: nextEventId(eventSeq), text: lr.eventReview });
    }
    if (prev.state !== 'built' && outline.state === 'built') {
      add.push({ id: nextEventId(eventSeq), text: lr.eventReviewed });
    }
    if (add.length > 0) setEvents((list) => [...add.reverse(), ...list].slice(0, 6));
  }, [outline, lr]);

  useEffect(() => {
    if (state !== 'built') {
      setHidden(false);
      return;
    }
    const left = (outline?.lastTurn?.at ?? 0) + 60_000 - Date.now();
    if (left <= 0) {
      setHidden(true);
      return;
    }
    const timer = window.setTimeout(() => setHidden(true), left);
    return () => window.clearTimeout(timer);
  }, [state, outline?.lastTurn?.at]);

  const runUndo = useCallback(async () => {
    const ok = await undo();
    if (ok) {
      window.location.assign(`${basePath()}/s/${encodeURIComponent(slideId)}/outline`);
    } else {
      toast.error(lr.undoFailed);
    }
  }, [undo, slideId, lr.undoFailed]);

  useEffect(() => {
    if (state !== 'built' || toasted.current) return;
    toasted.current = true;
    const key = `lr-build-toast:${slideId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {}
    toast.success(format(lr.done, { n: total }), {
      duration: 10_000,
      action: {
        label: lr.undo,
        onClick: () => void runUndo(),
      },
    });
  }, [state, total, slideId, lr, runUndo]);

  if (!outline || (state !== 'building' && state !== 'built')) return null;
  if (state === 'built' && hidden) return null;

  const team = teamState(outline, { running, waitingForAnswer, action });
  const pct = total > 0 ? Math.min(100, Math.round((built / total) * 100)) : 0;
  const status =
    state === 'built'
      ? format(lr.statusDone, { n: total })
      : waitingForAnswer
        ? lr.statusWaiting
        : action === 'paused'
          ? lr.statusPaused
          : action === 'interrupted'
            ? lr.statusStopped
            : outline.stage === 'review'
              ? lr.statusReview
              : format(lr.statusWorking, { k: Math.min(built + 1, total) });

  const helpers: {
    role: HelperRole;
    label: string;
    state: ReturnType<typeof teamState>['design'];
    sub: string | null;
    subMuted: boolean;
  }[] = [
    {
      role: 'research',
      label: lr.research,
      state: team.research,
      sub:
        outline.files.length > 0
          ? format(plural(outline.files.length, lr.readFiles), { n: outline.files.length })
          : lr.noFiles,
      subMuted: outline.files.length === 0,
    },
    { role: 'outline', label: lr.outline, state: team.outline, sub: null, subMuted: false },
    { role: 'design', label: lr.design, state: team.design, sub: null, subMuted: false },
    { role: 'review', label: lr.review, state: team.review, sub: null, subMuted: false },
  ];

  return (
    <div data-lr-build-team className="border-b border-border/60 px-4 py-3">
      {state === 'building' && action === 'interrupted' && (
        <div
          data-lr-build-interrupted
          className="mb-3 flex items-start gap-2.5 rounded-[10px] border border-border bg-card px-3 py-2.5"
        >
          <Mascot state="needs-you" size={28} />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold">
              {format(lr.interruptedTitle, { k: Math.min(built + 1, total) })}
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              {connected
                ? built > 0
                  ? format(lr.interruptedHint, { n: built })
                  : null
                : lr.interruptedNoAgent}
            </p>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="mt-2"
              onClick={() => void resume()}
            >
              {lr.continue}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2.5">
        <Mascot
          state={leadMascot(team.lead)}
          size={36}
          float={state === 'building' && !running && action !== 'interrupted'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-[13px] font-semibold">{status}</p>
            <span className="shrink-0 text-[11.5px] text-muted-foreground tabular-nums">
              {format(lr.progress, { k: built, n: total })}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[var(--lr-focus)] motion-safe:transition-[width] motion-safe:duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {state === 'building' &&
          action !== 'interrupted' &&
          (outline.paused ? (
            <Button type="button" variant="outline" size="xs" onClick={() => void resume()}>
              {lr.resume}
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="xs" onClick={() => void pause()}>
              {lr.pause}
            </Button>
          ))}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {helpers.map((helper) => (
          <div
            key={helper.role}
            data-lr-helper-tile={helper.role}
            className="flex flex-col items-center gap-0.5 text-center"
          >
            <HelperMascot role={helper.role} state={helperMascot(helper.state)} size={28} />
            <span
              className={cn(
                'text-[11px] leading-tight',
                helper.state === 'idle' || helper.state === 'none'
                  ? 'text-muted-foreground'
                  : 'text-foreground',
                helper.state === 'working' && 'font-semibold',
              )}
            >
              {helper.label}
            </span>
            {helper.sub && (
              <span
                className={cn(
                  'text-[10.5px] leading-tight text-muted-foreground',
                  helper.subMuted && 'opacity-70',
                )}
              >
                {helper.sub}
              </span>
            )}
          </div>
        ))}
      </div>

      {events.length > 0 && (
        <ul data-lr-build-events className="mt-3 space-y-0.5">
          {events.map((event) => (
            <li key={event.id} className="truncate text-[11px] text-muted-foreground">
              {event.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
