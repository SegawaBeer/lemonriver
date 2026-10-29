import { useCallback, useEffect, useState } from 'react';
import { refreshStatus } from '@/lib/agent/use-agent';
import type { AgentProviderId } from '../../../agent/types';

export type AgentProviderRow = {
  id: AgentProviderId;
  name: string;
  builtin: boolean;
  detected: boolean;
  connectable: boolean;
  reason: string | null;
};

type Catalog = { enabled: string[]; providers: AgentProviderRow[] };

export function useAgentProviders() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/__lr/agent-providers');
      if (!res.ok) return;
      setCatalog((await res.json()) as Catalog);
    } catch {}
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    void load();
  }, [load]);

  const setEnabled = useCallback(
    async (id: string, on: boolean): Promise<boolean> => {
      if (!catalog) return false;
      const next = on
        ? [...catalog.enabled.filter((x) => x !== id), id]
        : catalog.enabled.filter((x) => x !== id);
      setSaving(id);
      try {
        const res = await fetch('/__lr/agent-providers', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: next }),
        });
        if (!res.ok) return false;
        const body = (await res.json()) as { enabled: string[] };
        setCatalog({ ...catalog, enabled: body.enabled });
        void refreshStatus();
        return true;
      } catch {
        return false;
      } finally {
        setSaving(null);
      }
    },
    [catalog],
  );

  return { catalog, saving, setEnabled, reload: load };
}
