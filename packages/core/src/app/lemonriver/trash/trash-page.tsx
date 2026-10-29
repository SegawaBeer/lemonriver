import { RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { format, plural, useLocale } from '@/lib/use-locale';
import { LemonEmpty } from '../feedback/lemon-empty';
import { TypedConfirmDialog } from '../home/dialogs';
import { daysLeft, relativeTime } from '../home/time';
import { useLrText } from '../text';
import { deleteForever, listTrash, restoreFromTrash, type TrashEntry } from './api';

export function TrashPage() {
  const t = useLocale();
  const lr = useLrText();
  const [entries, setEntries] = useState<TrashEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [purging, setPurging] = useState<TrashEntry | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const now = Date.now();

  const load = useCallback(async () => {
    try {
      setEntries(await listTrash());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (entry: TrashEntry) => {
    setBusy(entry.id);
    try {
      await restoreFromTrash(entry);
    } catch {
      setBusy(null);
      toast.error(lr.home.toastRestoreFailed);
    }
  };

  return (
    <div data-lr-trash>
      <header className="mb-6">
        <h1 className="font-heading text-[28px] font-bold leading-[34px] tracking-[-0.01em]">
          {lr.trash.title}
        </h1>
        <p className="lr-on-lime mt-0.5 text-[14px] text-muted-foreground">{lr.trash.subtitle}</p>
      </header>

      {failed ? (
        <LemonEmpty
          state="needs-you"
          title={lr.trash.loadFailed}
          actions={
            <Button variant="outline" onClick={() => void load()}>
              {t.common.tryAgain}
            </Button>
          }
        />
      ) : entries === null ? null : entries.length === 0 ? (
        <LemonEmpty title={lr.trash.emptyTitle}>{lr.trash.emptyHint}</LemonEmpty>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-[16px] border border-border bg-card shadow-[var(--lr-shadow-1)]">
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-lr-trash-entry={entry.slideId}
              className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3.5 first:border-t-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{entry.title}</p>
                <p className="text-[12px] text-muted-foreground">
                  {format(lr.trash.deletedWhen, {
                    when: relativeTime(entry.deletedAt, now, t.id),
                  })}
                  {' · '}
                  {format(plural(daysLeft(entry.expiresAt, now), lr.trash.daysLeft), {
                    n: daysLeft(entry.expiresAt, now),
                  })}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void restore(entry)}
              >
                <RotateCcw />
                {lr.trash.restore}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                className="text-destructive hover:text-destructive"
                onClick={() => setPurging(entry)}
              >
                <Trash2 />
                {lr.trash.deleteForever}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <TypedConfirmDialog
        open={purging !== null}
        name={purging?.title ?? ''}
        title={lr.trash.confirmTitle}
        hint={format(lr.trash.confirmHint, { name: purging?.title ?? '' })}
        label={lr.trash.confirmLabel}
        action={lr.trash.deleteForever}
        onOpenChange={(open) => !open && setPurging(null)}
        onConfirm={async () => {
          if (!purging) return;
          try {
            await deleteForever(purging.id);
            toast.success(format(lr.trash.toastPurged, { name: purging.title }));
            setPurging(null);
            await load();
          } catch {
            toast.error(lr.trash.toastPurgeFailed);
          }
        }}
      />
    </div>
  );
}
