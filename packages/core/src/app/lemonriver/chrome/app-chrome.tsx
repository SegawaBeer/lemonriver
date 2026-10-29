import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from '@/lib/use-locale';
import { OfflineBanner } from '../feedback/offline-banner';
import { takePendingToast } from '../feedback/pending-toast';
import { Toaster } from '../feedback/toaster';
import { useLrText } from '../text';
import { applyReduceMotion, useReduceMotionSetting } from '../theme/motion';
import { isBrandPage, pageForPath, SPLASH_ID } from '../theme/pages';
import {
  changingDecksHere,
  DECKS_CHANGED_EVENT,
  latestEntryFor,
  listTrash,
  restoreFromTrash,
} from '../trash/api';
import { UpdatePrompt } from '../update/update-prompt';
import { SidebarExtras } from './sidebar-extras';

const UNDO_MS = 5000;

function usePageMarker() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.documentElement.toggleAttribute('data-lr-brand', isBrandPage(pageForPath(pathname)));
  }, [pathname]);
}

function useSplashOut() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute('data-lr-splash')) return;
    const splash = document.getElementById(SPLASH_ID);
    splash?.setAttribute('data-leaving', '');
    const timer = setTimeout(() => root.removeAttribute('data-lr-splash'), 240);
    return () => clearTimeout(timer);
  }, []);
}

function useDecksChangedReload() {
  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const onChange = () => {
      if (!changingDecksHere()) window.location.reload();
    };
    hot.on(DECKS_CHANGED_EVENT, onChange);
    return () => hot.off(DECKS_CHANGED_EVENT, onChange);
  }, []);
}

function usePendingToast() {
  const lr = useLrText();
  // biome-ignore lint/correctness/useExhaustiveDependencies: shows once per page load
  useEffect(() => {
    const pending = takePendingToast();
    if (!pending) return;
    if (pending.kind === 'restored') {
      toast.success(format(lr.home.toastRestored, { name: pending.name }));
      return;
    }
    toast.success(format(lr.home.toastTrashed, { name: pending.name }), {
      duration: UNDO_MS,
      action: {
        label: lr.home.undo,
        onClick: async () => {
          try {
            const entry = latestEntryFor(await listTrash(), pending.slideId);
            if (!entry) throw new Error('trash entry not found');
            await restoreFromTrash(entry);
          } catch {
            toast.error(lr.home.toastRestoreFailed);
          }
        },
      },
    });
  }, []);
}

/** Everything LemonRiver adds around the routes. Sits where the official toaster was. */
export function AppChrome() {
  const reduceMotion = useReduceMotionSetting();
  usePageMarker();
  useSplashOut();
  useDecksChangedReload();
  usePendingToast();

  useEffect(() => {
    applyReduceMotion(reduceMotion);
  }, [reduceMotion]);

  return (
    <>
      <Toaster />
      {import.meta.env.DEV && <OfflineBanner />}
      <SidebarExtras />
      <UpdatePrompt />
    </>
  );
}
