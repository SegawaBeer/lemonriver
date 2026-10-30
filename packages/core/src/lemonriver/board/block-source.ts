import * as t from '@babel/types';
import { tryParse, walkJsx } from '../../editing/babel-walk.ts';

const MAX_CODE = 4000;
const MATCH_CHARS = 40;

function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The text a piece of JSX would render, as far as its own source says. Inline
 * elements join without a space between them, the way the browser renders them,
 * and a `<br>` takes one. Attributes are not text and are skipped.
 */
function sourceText(node: t.Node): string {
  const parts: string[] = [];
  const isBreak = (element: t.JSXElement) => {
    const name = element.openingElement.name;
    return t.isJSXIdentifier(name) && name.name === 'br';
  };
  const walk = (child: t.Node) => {
    if (t.isJSXText(child)) {
      parts.push(child.value);
      return;
    }
    if (t.isStringLiteral(child)) {
      parts.push(child.value);
      return;
    }
    if (t.isJSXElement(child)) {
      if (isBreak(child)) parts.push(' ');
      else for (const inner of child.children) walk(inner);
      return;
    }
    if (t.isJSXFragment(child)) {
      for (const inner of child.children) walk(inner);
      return;
    }
    if (t.isJSXExpressionContainer(child)) {
      if (t.isStringLiteral(child.expression)) parts.push(child.expression.value);
      else parts.push(' ');
    }
  };
  if (t.isJSXElement(node) && isBreak(node)) parts.push(' ');
  else if (t.isJSXElement(node) || t.isJSXFragment(node)) {
    for (const child of node.children) walk(child);
  } else walk(node);
  return squash(parts.join(''));
}

/**
 * The source of the JSX element a block was drawn from, found by the location
 * the renderer tagged it with. The block's text has to still match: a page the
 * user edited since, or one drawn by a component in another file, has no code
 * here to hand back.
 */
export function blockSourceInSource(source: string, loc: string, text: string): string | null {
  const [line, column] = loc.split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isInteger(line) || !Number.isInteger(column)) return null;

  const ast = tryParse(source);
  if (!ast) return null;

  let found: t.Node | null = null;
  walkJsx(ast, (node) => {
    if (found || !node.loc) return;
    const start = node.loc.start;
    if (start.line === line && start.column === column) found = node;
  });
  const node = found as t.Node | null;
  if (!node) return null;
  if (typeof node.start !== 'number' || typeof node.end !== 'number') return null;
  const code = source.slice(node.start, node.end);
  if (code.length > MAX_CODE) return null;

  const wanted = squash(text.replace(/(…|\.\.\.)\s*$/, '')).slice(0, MATCH_CHARS);
  if (!wanted) return null;
  return sourceText(node).startsWith(wanted) ? code : null;
}
