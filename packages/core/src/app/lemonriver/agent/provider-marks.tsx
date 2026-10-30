import { useState } from 'react';
import type { AgentProviderId } from '../../../agent/types';
import { cn } from '../../lib/utils';

// These products pick their own app icon on the machine they are installed on,
// so the panel shows the real one and falls back to our initial in a circle
// when the app is missing. The image is never bundled with us; the dev server
// reads it off the installed app and caches it under node_modules.
const MARKS: Partial<Record<AgentProviderId, { letter: string; fill: string }>> = {
  workbuddy: { letter: 'W', fill: '#1F8A5B' },
  dumate: { letter: 'D', fill: '#3357CE' },
};

export function ExtraProviderLogo({
  provider,
  className,
}: {
  provider: AgentProviderId;
  className?: string;
}) {
  const [unavailable, setUnavailable] = useState(false);
  const mark = MARKS[provider];

  if (mark && !unavailable) {
    return (
      <img
        src={`/__lr/agent-providers/${provider}/icon`}
        alt=""
        aria-hidden="true"
        className={cn('rounded-[3px] object-contain', className)}
        onError={() => setUnavailable(true)}
      />
    );
  }

  const fallback = mark ?? { letter: '?', fill: '#6B7280' };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="12" fill={fallback.fill} />
      <text
        x="12"
        y="16.4"
        textAnchor="middle"
        fontSize="13.5"
        fontWeight="700"
        fill="#ffffff"
        fontFamily="-apple-system, BlinkMacSystemFont, Inter, sans-serif"
      >
        {fallback.letter}
      </text>
    </svg>
  );
}
