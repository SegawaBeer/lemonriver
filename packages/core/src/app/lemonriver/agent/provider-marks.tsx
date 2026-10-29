import type { SVGProps } from 'react';
import type { AgentProviderId } from '../../../agent/types';

// Our own marks, not the vendors' app icons: a coloured circle with the
// product's initial, so nothing is copied out of their bundles.
const MARKS: Partial<Record<AgentProviderId, { letter: string; fill: string }>> = {
  workbuddy: { letter: 'W', fill: '#1F8A5B' },
  dumate: { letter: 'D', fill: '#3357CE' },
};

export function ExtraProviderLogo({
  provider,
  ...props
}: { provider: AgentProviderId } & SVGProps<SVGSVGElement>) {
  const mark = MARKS[provider] ?? { letter: '?', fill: '#6B7280' };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="12" fill={mark.fill} />
      <text
        x="12"
        y="16.4"
        textAnchor="middle"
        fontSize="13.5"
        fontWeight="700"
        fill="#ffffff"
        fontFamily="-apple-system, BlinkMacSystemFont, Inter, sans-serif"
      >
        {mark.letter}
      </text>
    </svg>
  );
}
