import type { BlockKind } from '../blocks/classify.ts';
import type { Placement } from './changes.ts';
import type { Restructure } from './restructure.ts';

/** A page as the prompt names it: where it sits now, and what the card calls it. */
export type PromptPage = { key: string; n: number; title: string };

export type ApplyPromptInput = {
  slideId: string;
  pages: PromptPage[];
  changes: Placement[];
  restructures: Restructure[];
};

const KIND_WORD: Record<BlockKind, string> = {
  title: 'title',
  point: 'point',
  text: 'paragraph',
  image: 'image',
  chart: 'chart',
  quote: 'quote',
  number: 'number',
};

const OPENING = (slideId: string) =>
  `Rearrange the deck slides/${slideId}/index.tsx as listed below. Change only what is listed: keep every other page, the wording, the styles and the speaker notes as they are.`;

const CLOSING =
  "Keep the deck's speaker notes array aligned with the pages after any split or merge. When you are done, reply with one short sentence saying what changed.";

/** `the chart "Revenue by quarter"`, or just the kind when it has no words. */
function blockRef(kind: BlockKind, text: string): string {
  return text ? `the ${KIND_WORD[kind]} "${text}"` : `the ${KIND_WORD[kind]}`;
}

function joined(refs: string[]): string {
  if (refs.length <= 1) return refs[0] ?? '';
  return `${refs.slice(0, -1).join(', ')} and ${refs[refs.length - 1]}`;
}

/**
 * The whole change list as one message to the agent. Every line names the page
 * and the block it is about, so nothing depends on where the user was looking.
 */
export function applyPrompt({ slideId, pages, changes, restructures }: ApplyPromptInput): string {
  const byKey = new Map(pages.map((page) => [page.key, page]));
  const pageRef = (key: string): string | null => {
    const page = byKey.get(key);
    if (!page) return null;
    return page.title ? `page ${page.n} "${page.title}"` : `page ${page.n}`;
  };

  const lines: string[] = [OPENING(slideId)];

  for (const item of changes) {
    const from = pageRef(item.origin.page);
    if (!from) continue;
    const block = blockRef(item.block.kind, item.block.text);

    if (item.to === 'parked') {
      lines.push(`Remove ${block} from ${from}.`);
      continue;
    }

    const to = pageRef(item.to.page);
    if (!to) continue;

    if (item.fromParking) {
      const before = item.to.beforeInfo;
      const where =
        item.to.before && before ? `before ${blockRef(before.kind, before.text)}` : 'at the end';
      lines.push(
        `Add this block to ${to}, ${where}. Its code, taken from the deck before it was set aside:`,
      );
      if (item.code) lines.push('', '```tsx', item.code, '```');
      continue;
    }

    const before = item.to.beforeInfo;
    // A record saved before the board kept the target block has no words for
    // it; the agent then only learns the page and appends.
    const tail =
      item.to.before === null
        ? ', at the end'
        : before
          ? `, before ${blockRef(before.kind, before.text)}`
          : '';
    lines.push(`Move ${block} from ${from} to ${to}${tail}.`);
  }

  for (const entry of restructures) {
    if (entry.kind === 'split') {
      const page = pageRef(entry.page);
      if (!page) continue;
      const refs = entry.blocks.map((_, at) => {
        const info = entry.blockInfo?.[at];
        return blockRef(info?.kind ?? 'text', info?.text ?? '');
      });
      if (refs.length === 0) continue;
      lines.push(`Split ${page}: move ${joined(refs)} onto a new page right after it.`);
      continue;
    }

    const [first, second] = entry.pages;
    const keep = byKey.get(first);
    const fold = byKey.get(second);
    if (!keep || !fold) continue;
    lines.push(
      `Merge page ${fold.n}${fold.title ? ` "${fold.title}"` : ''} into page ${keep.n}${keep.title ? ` "${keep.title}"` : ''}: put the content of page ${fold.n} at the end of page ${keep.n} and remove page ${fold.n}.`,
    );
  }

  lines.push(CLOSING);
  return lines.join('\n');
}
