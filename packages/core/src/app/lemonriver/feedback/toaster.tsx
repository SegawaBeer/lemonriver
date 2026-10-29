import { useTheme } from 'next-themes';
import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { Mascot } from '../brand/mascot';

/** The official toaster, with Lemon in place of the status icons. */
export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  const theme: ToasterProps['theme'] = resolvedTheme === 'dark' ? 'dark' : 'light';

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <Mascot state="done" size={36} />,
        info: <Mascot state="idle" size={36} />,
        warning: <Mascot state="needs-you" size={36} />,
        error: <Mascot state="needs-you" size={36} />,
        loading: <Mascot state="working" size={36} />,
      }}
      style={
        {
          '--normal-bg': 'var(--lr-toast-bg)',
          '--normal-text': 'var(--lr-toast-text)',
          '--normal-border': 'transparent',
          '--border-radius': '16px',
          '--font-family': 'var(--lr-font-sans)',
        } as CSSProperties
      }
      {...props}
    />
  );
}
