import { toast } from 'sonner';
import { format } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { ProviderLogo } from '../../components/agent/provider-logo';
import { useLrText } from '../text';
import { type AgentProviderRow, useAgentProviders } from './use-providers';

export function AgentProvidersSection() {
  const lr = useLrText();
  const { catalog, saving, setEnabled } = useAgentProviders();
  if (!catalog) return null;

  const on = new Set(catalog.enabled);

  async function toggle(row: AgentProviderRow) {
    const ok = await setEnabled(row.id, !on.has(row.id));
    if (!ok) toast.error(lr.agents.saveFailed);
  }

  function hint(row: AgentProviderRow): string {
    if (!row.detected) return lr.agents.missingHint;
    if (row.connectable) return lr.agents.detected;
    if (row.reason === 'desktop-only') return lr.agents.dumateReason;
    return lr.agents.missingHint;
  }

  return (
    <section
      data-lr-agent-providers
      className="mt-5 rounded-[16px] border border-border bg-card px-6 py-5 shadow-[var(--lr-shadow-1)]"
    >
      <h2 className="text-[16px] font-semibold">{lr.agents.title}</h2>
      <p className="mt-1 mb-2 text-[14px] text-muted-foreground">{lr.agents.hint}</p>

      <ul className="divide-y divide-border border-t border-border">
        {catalog.providers.map((row) => {
          const checked = row.builtin || on.has(row.id);
          const locked = row.builtin || !row.detected || !row.connectable;
          return (
            <li key={row.id} data-lr-agent-row={row.id} className="flex items-center gap-3 py-3">
              <ProviderLogo provider={row.id} className="size-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">
                  {row.name}
                  {row.builtin && (
                    <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                      {lr.agents.alwaysOn}
                    </span>
                  )}
                </p>
                <p data-lr-agent-state={row.id} className="text-[12px] text-muted-foreground">
                  {hint(row)}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                data-lr-agent-switch={row.id}
                aria-checked={checked}
                aria-label={format(lr.agents.unlock, { name: row.name })}
                aria-disabled={locked}
                disabled={locked || saving === row.id}
                onClick={() => void toggle(row)}
                className={cn(
                  'lr-switch shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  locked && 'cursor-not-allowed opacity-45',
                )}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
