import type { ReactNode } from 'react';
import type { AgentActivity } from '@/lib/agent/use-agent';
import { Mascot, type MascotState } from '../brand/mascot';
import { useLrText } from '../text';

const PHASE_STATE: Record<AgentActivity['phase'], MascotState> = {
  thinking: 'thinking',
  tool: 'working',
  waiting: 'needs-you',
};

/** Lemon in the presence pill above the canvas: thinking, working, or waiting for you. */
export function PresenceLemon({ phase }: { phase: AgentActivity['phase'] }) {
  return <Mascot state={PHASE_STATE[phase]} size={20} className="-my-1 -ml-1" />;
}

/** Lemon at the top of an idle agent panel. */
export function PanelLemon() {
  return <Mascot state="idle" size={56} float className="mb-2" />;
}

export function WorkingLemon() {
  return <Mascot state="working" size={20} className="-my-1 mr-1 inline-block align-middle" />;
}

export function ErrorLemon() {
  return <Mascot state="needs-you" size={20} className="-my-1 mr-0.5 inline-block align-middle" />;
}

export function ResultLemon({ aborted }: { aborted: boolean }) {
  return (
    <Mascot
      state={aborted ? 'idle' : 'done'}
      size={18}
      className="-my-1 mr-1 inline-block align-middle"
    />
  );
}

/** The header of a question the agent asks: the design package's confirmation card. */
export function ConfirmWho() {
  const lr = useLrText();
  return (
    <div className="mb-2 flex items-center gap-2 px-1.5 text-[12.5px] font-semibold">
      <Mascot state="needs-you" size={36} />
      {lr.feedback.confirmWho}
    </div>
  );
}

/** Lemon beside an empty state in the editor's compact panels. */
export function EmptyLemon({ size = 56 }: { size?: number }) {
  return <Mascot state="idle" size={size} float />;
}

/** The comment-mode hint pill, with Lemon in front. */
export function HintLemon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Mascot state="idle" size={16} className="-my-1" />
      {children}
    </span>
  );
}
