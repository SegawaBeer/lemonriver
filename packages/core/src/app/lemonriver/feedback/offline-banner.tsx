import { useEffect, useState } from 'react';
import { Mascot } from '../brand/mascot';
import { useLrText } from '../text';

function useDevServerConnected(): boolean {
  const [connected, setConnected] = useState(true);
  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    hot.on('vite:ws:connect', onConnect);
    hot.on('vite:ws:disconnect', onDisconnect);
    return () => {
      hot.off('vite:ws:connect', onConnect);
      hot.off('vite:ws:disconnect', onDisconnect);
    };
  }, []);
  return connected;
}

/** Shown while the dev server is gone; Vite reloads the page once it is back. */
export function OfflineBanner() {
  const connected = useDevServerConnected();
  const lr = useLrText();
  if (connected) return null;
  return (
    <div
      role="status"
      data-lr-offline
      className="lr-rise fixed top-3 left-1/2 z-[60] flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-[12px] border px-4 py-2.5 text-[13.5px] text-foreground shadow-floating"
      style={{
        background: 'color-mix(in srgb, var(--lr-warning) 14%, var(--lr-surface))',
        borderColor: 'color-mix(in srgb, var(--lr-warning) 35%, var(--lr-border))',
      }}
    >
      <Mascot state="needs-you" size={36} />
      <span>{lr.shell.offline}</span>
    </div>
  );
}
