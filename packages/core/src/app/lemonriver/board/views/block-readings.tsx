import { useCallback, useState } from 'react';
import type { DesignSystem } from '../../../lib/design';
import type { Page } from '../../../lib/sdk';
import { pageReadOf } from '../blocks/cache';
import { CARD_H, CARD_W } from '../layout';
import { PagePreview } from '../page-node';

/** How many pages are drawn off screen at a time; the rest follow as these finish. */
const PER_PASS = 12;

/**
 * The list and the timeline show how long each page takes to say, and that
 * number comes from what is on the page. Cards do the reading by themselves, so
 * either view mounts off-screen copies of the pages nobody has read yet. Once a
 * page has been read the board remembers it for as long as the deck is loaded.
 */
export function BlockReadings({ pages, design }: { pages: Page[]; design?: DesignSystem }) {
  const [, bump] = useState(0);
  const onRead = useCallback(() => bump((n) => n + 1), []);

  const missing = pages
    .flatMap((page, index) => (pageReadOf(page) ? [] : [index]))
    .slice(0, PER_PASS);
  if (missing.length === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-[-20000px]"
      style={{ width: CARD_W, height: CARD_H }}
    >
      {missing.map((index) => (
        <div key={index} style={{ width: CARD_W, height: CARD_H }}>
          <PagePreview
            page={pages[index]}
            index={index}
            total={pages.length}
            design={design}
            scale={0.25}
            onRead={onRead}
          />
        </div>
      ))}
    </div>
  );
}
