import { Plus, Settings, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCreateDeck } from '@/lib/agent/use-agent';
import { isFeatureEnabled } from '../features';
import { useLrText } from '../text';
import { pageForPath } from '../theme/pages';
import { NavRow } from './nav-row';
import { useSlot } from './use-slot';

/** The new-deck button and the Settings and Trash rows, placed into the official sidebar. */
export function SidebarExtras() {
  const top = useSlot('data-lr-sidebar-top');
  const nav = useSlot('data-lr-sidebar-nav');
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const createDeck = useCreateDeck();
  const lr = useLrText();
  const page = pageForPath(pathname);

  return (
    <>
      {top &&
        import.meta.env.DEV &&
        createPortal(
          <Button size="lg" className="mt-2 w-full" onClick={() => void createDeck()}>
            <Plus />
            {lr.shell.newDeck}
          </Button>,
          top,
        )}
      {nav &&
        createPortal(
          <>
            {isFeatureEnabled('trash') && (
              <NavRow
                icon={<Trash2 className="size-4" strokeWidth={1.75} />}
                label={lr.shell.trash}
                current={page === 'trash'}
                onSelect={() => navigate('/trash', { replace: true })}
              />
            )}
            {isFeatureEnabled('settings') && (
              <NavRow
                icon={<Settings className="size-4" strokeWidth={1.75} />}
                label={lr.shell.settings}
                current={page === 'settings'}
                onSelect={() => navigate('/settings', { replace: true })}
              />
            )}
          </>,
          nav,
        )}
    </>
  );
}
