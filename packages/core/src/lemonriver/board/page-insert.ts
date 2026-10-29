import { parse as babelParse } from '@babel/parser';

type ArrayElementRange = { start: number; end: number };

function findDefaultExportArray(source: string): {
  elements: ArrayElementRange[];
  arrayStart: number;
  arrayEnd: number;
  statementStart: number;
} | null {
  let ast: unknown;
  try {
    ast = babelParse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      errorRecovery: true,
    });
  } catch {
    return null;
  }
  const body = (ast as { program?: { body?: Array<Record<string, unknown>> } }).program?.body ?? [];
  for (const node of body) {
    if (node.type !== 'ExportDefaultDeclaration') continue;
    let inner = node.declaration as Record<string, unknown> | undefined;
    while (inner && (inner.type === 'TSAsExpression' || inner.type === 'TSSatisfiesExpression')) {
      inner = inner.expression as Record<string, unknown> | undefined;
    }
    if (inner?.type !== 'ArrayExpression') return null;
    const arrayStart = inner.start as number;
    const arrayEnd = inner.end as number;
    const rawElements = (inner.elements as Array<Record<string, unknown> | null>) ?? [];
    const elements: ArrayElementRange[] = [];
    for (const el of rawElements) {
      if (!el || typeof el.start !== 'number' || typeof el.end !== 'number') return null;
      elements.push({ start: el.start as number, end: el.end as number });
    }
    return { elements, arrayStart, arrayEnd, statementStart: node.start as number };
  }
  return null;
}

type NotesArrayInfo = {
  arrayStart: number;
  arrayEnd: number;
  elementTexts: string[];
};

function findNotesArray(source: string): NotesArrayInfo | null | 'invalid' {
  let ast: unknown;
  try {
    ast = babelParse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      errorRecovery: true,
    });
  } catch {
    return 'invalid';
  }
  const body = (ast as { program?: { body?: Array<Record<string, unknown>> } }).program?.body ?? [];
  for (const stmt of body) {
    if (stmt.type !== 'ExportNamedDeclaration') continue;
    const decl = stmt.declaration as Record<string, unknown> | undefined;
    if (decl?.type !== 'VariableDeclaration') continue;
    const declarations = (decl.declarations as Array<Record<string, unknown>> | undefined) ?? [];
    for (const d of declarations) {
      const id = d.id as Record<string, unknown> | undefined;
      if (id?.type !== 'Identifier' || id.name !== 'notes') continue;
      const init = d.init as Record<string, unknown> | undefined;
      if (init?.type !== 'ArrayExpression') return 'invalid';
      const arrayStart = init.start as number | undefined;
      const arrayEnd = init.end as number | undefined;
      if (typeof arrayStart !== 'number' || typeof arrayEnd !== 'number') return 'invalid';
      const rawElements = (init.elements as Array<Record<string, unknown> | null>) ?? [];
      const elementTexts: string[] = [];
      for (const el of rawElements) {
        if (el === null) {
          elementTexts.push('undefined');
          continue;
        }
        if (el.type === 'SpreadElement') return 'invalid';
        const start = el.start as number | undefined;
        const end = el.end as number | undefined;
        if (typeof start !== 'number' || typeof end !== 'number') return 'invalid';
        elementTexts.push(source.slice(start, end));
      }
      return { arrayStart, arrayEnd, elementTexts };
    }
  }
  return null;
}

function rebuildNotesArray(
  source: string,
  arrayStart: number,
  arrayEnd: number,
  elements: string[],
): string {
  const trimmed = elements.slice();
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === 'undefined') {
    trimmed.pop();
  }
  const replacement =
    trimmed.length === 0 ? '[]' : `[\n${trimmed.map((s) => `  ${s},`).join('\n')}\n]`;
  if (replacement === source.slice(arrayStart, arrayEnd)) return source;
  return source.slice(0, arrayStart) + replacement + source.slice(arrayEnd);
}

function chooseInsertSeparator(prefix: string, existingSeparators: string[]): string {
  const sample = existingSeparators.find((s) => s.includes(','));
  if (sample) return sample;
  if (prefix.includes('\n')) {
    const m = prefix.match(/\n([ \t]*)$/);
    const indent = m ? m[1] : '  ';
    return `,\n${indent}`;
  }
  return ', ';
}

/** Separator slots for an array that gained an element at `index`. */
function separatorsAroundInsert(
  separators: string[],
  index: number,
  count: number,
  insertSep: string,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < count - 1; i++) {
    if (i === index) out.push(insertSep);
    else if (i === index - 1) out.push(separators[index - 1] ?? insertSep);
    else out.push(separators[i > index ? i - 1 : i] ?? insertSep);
  }
  return out;
}

/** Rebuild `[...]` with `text` sitting at `index`, reusing the author's separators. */
function insertIntoDefaultExportArray(
  source: string,
  found: { elements: ArrayElementRange[]; arrayStart: number; arrayEnd: number },
  index: number,
  text: string,
): string {
  const { elements, arrayStart, arrayEnd } = found;
  const n = elements.length;
  const prefix = source.slice(arrayStart, elements[0].start);
  const suffix = source.slice(elements[n - 1].end, arrayEnd);
  const separators: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    separators.push(source.slice(elements[i].end, elements[i + 1].start));
  }
  const texts = elements.map((el) => source.slice(el.start, el.end));
  texts.splice(index, 0, text);

  const insertSep = chooseInsertSeparator(prefix, separators);
  const seps = separatorsAroundInsert(separators, index, texts.length, insertSep);

  let rebuilt = prefix + texts[0];
  for (let i = 1; i < texts.length; i++) rebuilt += seps[i - 1] + texts[i];
  rebuilt += suffix;

  return source.slice(0, arrayStart) + rebuilt + source.slice(arrayEnd);
}

function chooseBlankPageName(source: string): string {
  const used = new Set(source.match(/[A-Za-z_$][\w$]*/g) ?? []);
  for (let i = 1; ; i++) {
    const name = `NewPage${i}`;
    if (!used.has(name)) return name;
  }
}

/**
 * Insert a brand-new blank page at `index`, declaring its component above the
 * default export and adding it to the array. Unlike duplication, nothing is
 * copied: the page is an empty full-bleed surface for the author to build on.
 *
 * Returns `null` when the default export isn't an array literal or `index` is
 * past the end of the deck.
 */
export function insertBlankPageInDefaultExportInSource(
  source: string,
  index: number,
): string | null {
  const found = findDefaultExportArray(source);
  if (!found) return null;
  const n = found.elements.length;
  if (!Number.isInteger(index) || index < 0 || index > n) return null;

  const name = chooseBlankPageName(source);
  const withArray = insertIntoDefaultExportArray(source, found, index, name);
  // The array rewrite only touches positions after `statementStart`, so the
  // declaration can still be spliced in at the export it belongs to.
  const before = withArray.slice(0, found.statementStart);
  const gap = before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const declaration = `const ${name} = () => (\n  <div style={{ width: '100%', height: '100%', background: '#ffffff' }} />\n);\n`;

  return before + declaration + gap + withArray.slice(found.statementStart);
}

/**
 * Put a page back where it was, as the source text it was removed as. Undoing a
 * deletion needs nothing else: removing a page only takes its entry out of the
 * array, so the component it names is still declared above.
 */
export function insertPageEntryInDefaultExportInSource(
  source: string,
  index: number,
  entry: string,
): string | null {
  const found = findDefaultExportArray(source);
  if (!found) return null;
  const n = found.elements.length;
  if (!Number.isInteger(index) || index < 0 || index > n) return null;
  if (!entry.trim()) return null;
  if (n === 0) {
    return `${source.slice(0, found.arrayStart)}[\n  ${entry},\n]${source.slice(found.arrayEnd)}`;
  }
  return insertIntoDefaultExportArray(source, found, index, entry);
}

/**
 * Insert an empty note slot at `index` so `notes` stays aligned with the pages
 * after a page is inserted. Trailing empty slots are dropped again by
 * {@link rebuildNotesArray}, which is correct: an absent note is `undefined`.
 */
export function insertNotesElementInSource(source: string, index: number): string | null {
  if (!Number.isInteger(index) || index < 0) return null;
  const found = findNotesArray(source);
  if (found === 'invalid') return null;
  if (found === null) return source;

  const { arrayStart, arrayEnd, elementTexts } = found;
  if (index > elementTexts.length) return source;
  const next = elementTexts.slice();
  next.splice(index, 0, 'undefined');
  return rebuildNotesArray(source, arrayStart, arrayEnd, next);
}
