import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from '@/lib/use-locale';
import { useRestartServer } from '@/lib/use-restart-server';
import { useLrText } from '../text';
import {
  promptsOnPage,
  readSnooze,
  saveSnooze,
  shouldPrompt,
  UPDATE_CHECK_INTERVAL_MS,
  type UpdateCheck,
} from './prompt';

const TOAST_ID = 'lemonriver-update';

export function UpdatePrompt() {
  const { pathname } = useLocation();
  const lr = useLrText();
  const { canRestart, restartServer } = useRestartServer();
  const phase = useRef<'idle' | 'busy' | 'done'>('idle');
  const settled = useRef<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!promptsOnPage(pathname)) {
      toast.dismiss(TOAST_ID);
      return;
    }

    let cancelled = false;

    function snooze(latest: string) {
      saveSnooze(localStorage, latest, Date.now());
      toast.dismiss(TOAST_ID);
    }

    async function runUpdate(latest: string) {
      if (phase.current === 'busy') return;
      phase.current = 'busy';
      toast.loading(lr.update.updating, { id: TOAST_ID, duration: Infinity });

      let ok = false;
      try {
        const res = await fetch('/__update-package', { method: 'POST' });
        ok = res.ok;
      } catch {
        ok = false;
      }

      if (!ok) {
        phase.current = 'idle';
        if (cancelled) return;
        toast.error(lr.update.failed, {
          id: TOAST_ID,
          duration: Infinity,
          description: lr.update.failedHint,
          action: { label: lr.update.retry, onClick: () => void runUpdate(latest) },
          cancel: { label: lr.update.later, onClick: () => snooze(latest) },
        });
        return;
      }

      phase.current = 'done';
      settled.current = latest;
      if (cancelled) return;
      toast.success(format(lr.update.updated, { version: latest }), {
        id: TOAST_ID,
        duration: Infinity,
        description: canRestart ? lr.update.updatedHint : lr.update.updatedManual,
        action: canRestart
          ? { label: lr.update.restart, onClick: () => void restartServer() }
          : undefined,
      });
    }

    function showPrompt(check: UpdateCheck) {
      const latest = check.latest as string;
      toast.warning(format(lr.update.title, { version: latest }), {
        id: TOAST_ID,
        duration: Infinity,
        description: format(lr.update.hint, { current: check.current }),
        action: { label: lr.update.now, onClick: () => void runUpdate(latest) },
        cancel: { label: lr.update.later, onClick: () => snooze(latest) },
      });
    }

    async function check() {
      let data: UpdateCheck | null = null;
      try {
        const res = await fetch('/__update-check');
        if (!res.ok) return;
        data = (await res.json()) as UpdateCheck;
      } catch {
        return;
      }
      if (cancelled || !shouldPrompt(data, readSnooze(localStorage), Date.now())) return;
      if (phase.current === 'busy') return;
      if (phase.current === 'done' && settled.current === data.latest) return;
      showPrompt(data);
    }

    void check();
    const timer = setInterval(() => void check(), UPDATE_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname, lr, canRestart, restartServer]);

  return null;
}
