/** A page's DOM copied into plain objects, in canvas units. */
export type SnapBox = { x: number; y: number; w: number; h: number };
export type SnapNode = {
  tag: string;
  text: string;
  fontSize: number;
  fontWeight: number;
  box: SnapBox;
  loc: string | null;
  placeholder: boolean;
  step: boolean;
  children: SnapNode[];
};

export type BlockKind = 'title' | 'point' | 'text' | 'image' | 'chart' | 'quote' | 'number';
export type Block = {
  id: string;
  kind: BlockKind;
  text: string;
  loc: string | null;
  box: SnapBox;
};
export type WholeReason = 'steps' | 'empty' | 'tooMany' | 'tooLarge';

const TEXT_MAX = 80;
const MAX_BLOCKS = 40;
const ROW_TOLERANCE = 24;

function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function clip(text: string): string {
  return squash(text).slice(0, TEXT_MAX);
}

const NUMBER_RE = /^[+\-−]?[$€£¥]?\d[\d.,]*\s?(M|K|B|万|亿|[xX])?$/;

function ownKind(node: SnapNode): BlockKind | null {
  const tag = node.tag.toLowerCase();
  if (tag === 'img' || node.placeholder) return 'image';
  if ((tag === 'svg' || tag === 'canvas') && node.box.w >= 200 && node.box.h >= 120) return 'chart';
  if (tag === 'blockquote' || tag === 'q') return 'quote';
  if (tag === 'li') return 'point';
  if (!node.text) return null;
  if (tag === 'h1' || tag === 'h2' || tag === 'h3' || node.fontSize >= 56) return 'title';
  if (node.fontSize >= 48 && NUMBER_RE.test(squash(node.text))) return 'number';
  return null;
}

function hasStep(node: SnapNode): boolean {
  return node.step || node.children.some(hasStep);
}

type Collected = { kind: BlockKind; text: string; loc: string | null; box: SnapBox };

function collect(node: SnapNode, out: Collected[]): void {
  const kind = ownKind(node);
  if (kind) {
    out.push({ kind, text: clip(node.text || node.tag), loc: node.loc, box: node.box });
    return;
  }
  // An element that is only its own text is a paragraph of its own; the text
  // nodes inside it were already joined when the tree was copied.
  if (node.text) {
    out.push({ kind: 'text', text: clip(node.text), loc: node.loc, box: node.box });
    return;
  }
  for (const child of node.children) collect(child, out);
}

function inReadingOrder(blocks: Collected[]): Collected[] {
  return [...blocks].sort((a, b) => {
    const sameRow = Math.abs(a.box.y - b.box.y) < ROW_TOLERANCE;
    if (sameRow) return a.box.x - b.box.x;
    return a.box.y - b.box.y;
  });
}

function withIds(blocks: Collected[]): Block[] {
  const seen = new Map<string, number>();
  return blocks.map((block, index) => {
    let id: string;
    if (block.loc) {
      const n = (seen.get(block.loc) ?? 0) + 1;
      seen.set(block.loc, n);
      id = n === 1 ? block.loc : `${block.loc}#${n}`;
    } else {
      id = `n${index}`;
    }
    return { id, kind: block.kind, text: block.text, loc: block.loc, box: block.box };
  });
}

export function readBlocks(tree: SnapNode | null): { blocks: Block[] } | { whole: WholeReason } {
  if (!tree) return { whole: 'tooLarge' };
  if (hasStep(tree)) return { whole: 'steps' };

  const collected: Collected[] = [];
  collect(tree, collected);
  if (collected.length === 0) return { whole: 'empty' };
  if (collected.length > MAX_BLOCKS) return { whole: 'tooMany' };

  return { blocks: withIds(inReadingOrder(collected)) };
}
