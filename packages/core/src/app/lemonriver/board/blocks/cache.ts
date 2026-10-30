import type { Block, WholeReason } from './classify.ts';

export type PageRead = { blocks: Block[] } | { whole: WholeReason };

/**
 * What each page was read to contain. Keyed by the page component itself, so a
 * reloaded deck module starts empty without anything having to clear it.
 */
const reads = new WeakMap<object, PageRead>();

export function rememberPageRead(page: object, read: PageRead): void {
  reads.set(page, read);
}

export function pageReadOf(page: object): PageRead | undefined {
  return reads.get(page);
}

/** Whether two reads describe the same blocks, regardless of their boxes. */
export function sameRead(a: PageRead | undefined, b: PageRead): boolean {
  if (!a) return false;
  if ('whole' in a || 'whole' in b) return 'whole' in a && 'whole' in b && a.whole === b.whole;
  if (a.blocks.length !== b.blocks.length) return false;
  return a.blocks.every((block, index) => {
    const other = b.blocks[index];
    return block.id === other.id && block.kind === other.kind && block.text === other.text;
  });
}
