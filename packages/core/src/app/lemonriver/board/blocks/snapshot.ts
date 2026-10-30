import type { SnapBox, SnapNode } from './classify.ts';

const MAX_ELEMENTS = 2000;

function directText(el: Element): string {
  let text = '';
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) text += child.nodeValue ?? '';
  }
  return text;
}

/**
 * Copies the page's DOM into plain objects in canvas units. Runs in the browser
 * only: every figure comes from layout, so nothing here can be tested off-DOM.
 */
export function snapshotPage(canvas: HTMLElement, scale: number): SnapNode | null {
  if (!(scale > 0)) return null;
  const origin = canvas.getBoundingClientRect();
  let count = 0;

  const visit = (el: Element): SnapNode | { tooLarge: true } | null => {
    count += 1;
    if (count > MAX_ELEMENTS) return { tooLarge: true };

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return null;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const box: SnapBox = {
      x: (rect.left - origin.left) / scale,
      y: (rect.top - origin.top) / scale,
      w: rect.width / scale,
      h: rect.height / scale,
    };

    const children: SnapNode[] = [];
    for (const child of el.children) {
      const copied = visit(child);
      if (copied && 'tooLarge' in copied) return copied;
      if (copied) children.push(copied);
    }

    return {
      tag: el.tagName.toLowerCase(),
      text: directText(el),
      fontSize: Number.parseFloat(style.fontSize) || 0,
      fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
      box,
      loc: el.getAttribute('data-slide-loc'),
      placeholder: el.hasAttribute('data-slide-placeholder'),
      step: el.hasAttribute('data-osd-step'),
      children,
    };
  };

  const root = visit(canvas);
  if (!root || 'tooLarge' in root) return null;
  return root;
}
