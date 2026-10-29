import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAgentStatus, useCreateDeck } from '@/lib/agent/use-agent';
import { Mascot } from '../brand/mascot';
import { isFeatureEnabled } from '../features';
import { useLrText } from '../text';
import { saveBrief } from './brief';

/** "Say it in one sentence": opens the guided flow, or creates a deck and tells the agent. */
export function BriefCard() {
  const lr = useLrText();
  const navigate = useNavigate();
  const createDeck = useCreateDeck();
  const { connected, loading } = useAgentStatus();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const needsAgent = !loading && !connected;

  const submit = async () => {
    const brief = text.trim();
    if (!brief || busy) return;
    if (isFeatureEnabled('outline')) {
      navigate('/new', { state: { brief } });
      return;
    }
    setBusy(true);
    saveBrief(brief);
    await createDeck();
    setBusy(false);
  };

  return (
    <div className="mb-8">
      <form
        data-lr-brief
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex items-center gap-4 rounded-[16px] border border-border bg-card px-5 py-4 shadow-[var(--lr-shadow-1)]"
      >
        <Mascot state={text.trim() ? 'thinking' : 'idle'} size={64} float />
        <label className="sr-only" htmlFor="lr-brief">
          {lr.home.briefLabel}
        </label>
        <input
          id="lr-brief"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={lr.home.briefPlaceholder}
          maxLength={400}
          className="min-w-0 flex-1 bg-transparent text-[18px] text-foreground outline-none placeholder:text-[var(--lr-text-3)]"
        />
        <Button type="submit" disabled={!text.trim() || busy}>
          {lr.home.briefStart}
          <ArrowRight />
        </Button>
      </form>
      {needsAgent && (
        <p className="mt-2 flex items-center gap-2 px-1 text-[13px] text-muted-foreground lr-on-lime">
          <Mascot state="needs-you" size={24} />
          {lr.home.briefNeedsAgent}
        </p>
      )}
    </div>
  );
}
