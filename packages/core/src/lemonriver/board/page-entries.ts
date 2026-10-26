import { parse as babelParse } from '@babel/parser';
import type { Expression, Node } from '@babel/types';

/**
 * The deck's page array as written, one entry per page, with whitespace
 * collapsed so reformatting the file keeps every entry the same. `null` when
 * the array cannot be read one entry per page: a spread stands for any number
 * of pages, and a default export that is not an array literal hides them.
 */
export function defaultExportEntriesInSource(source: string): string[] | null {
  let body: Node[];
  try {
    body = babelParse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      errorRecovery: true,
    }).program.body;
  } catch {
    return null;
  }
  for (const node of body) {
    if (node.type !== 'ExportDefaultDeclaration') continue;
    let inner = node.declaration as Expression;
    while (inner.type === 'TSAsExpression' || inner.type === 'TSSatisfiesExpression') {
      inner = inner.expression;
    }
    if (inner.type !== 'ArrayExpression') return null;
    const entries: string[] = [];
    for (const element of inner.elements) {
      if (!element || element.type === 'SpreadElement') return null;
      if (element.start == null || element.end == null) return null;
      entries.push(source.slice(element.start, element.end).replace(/\s+/g, ' '));
    }
    return entries;
  }
  return null;
}
