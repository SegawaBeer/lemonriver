import * as t from '@babel/types';
import { tryParse, walkAll, walkJsx } from '../../editing/babel-walk.ts';

const MAX_CODE = 4000;
const MATCH_CHARS = 40;

function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The text a piece of JSX would render, as far as its own source says. */
function sourceText(node: t.Node): string {
  const parts: string[] = [];
  walkAll(node, (child) => {
    if (t.isJSXText(child)) parts.push(child.value);
    else if (t.isStringLiteral(child)) parts.push(child.value);
  });
  return squash(parts.join(' '));
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
