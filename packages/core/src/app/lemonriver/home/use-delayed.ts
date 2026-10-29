import { useEffect, useState } from 'react';

/** True once `active` has stayed true for `ms`, so quick loads never flash a skeleton. */
export function useDelayed(active: boolean, ms = 300): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return shown;
}
