import { parse as babelParse } from '@babel/parser';
import { describe, expect, it } from 'vitest';
import { insertBlankPageInDefaultExportInSource, insertNotesElementInSource } from './page-insert';

describe('insertBlankPageInDefaultExportInSource', () => {
  const multiline = `import type { Page } from '@lemonriver/core';
const A = () => null;
const B = () => null;
const C = () => null;

export default [
  A,
  B,
  C,
] satisfies Page[];
`;

  it('adds the new page at the requested position', () => {
    const out = insertBlankPageInDefaultExportInSource(multiline, 1);
    expect(out).toContain('export default [\n  A,\n  NewPage1,\n  B,\n  C,\n] satisfies Page[];');
  });

  it('can prepend and append', () => {
    expect(insertBlankPageInDefaultExportInSource(multiline, 0)).toContain(
      'export default [\n  NewPage1,\n  A,\n  B,\n  C,\n] satisfies Page[];',
    );
    expect(insertBlankPageInDefaultExportInSource(multiline, 3)).toContain(
      'export default [\n  A,\n  B,\n  C,\n  NewPage1,\n] satisfies Page[];',
    );
  });

  it('declares the page above the export, with no blank-line pile-up', () => {
    const out = insertBlankPageInDefaultExportInSource(multiline, 0) ?? '';
    expect(out).toContain('const NewPage1 = () => (');
    expect(out).toContain("background: '#ffffff'");
    expect(out).not.toContain('\n\n\nexport default');
  });

  it('does not copy any existing page', () => {
    const out = insertBlankPageInDefaultExportInSource(multiline, 2) ?? '';
    const array = out.slice(out.indexOf('export default ['));
    expect(array.match(/\bA\b/g)).toHaveLength(1);
    expect(array.match(/\bB\b/g)).toHaveLength(1);
    expect(array.match(/\bC\b/g)).toHaveLength(1);
  });

  it('picks a name that is not already taken', () => {
    const taken = `const NewPage1 = () => null;\nconst A = () => null;\nexport default [A];\n`;
    const out = insertBlankPageInDefaultExportInSource(taken, 1) ?? '';
    expect(out).toContain('const NewPage2 = () => (');
    expect(out).toContain('export default [A, NewPage2];');
  });

  it('handles an inline array', () => {
    const inline = `const A = () => null;\nexport default [A];\n`;
    expect(insertBlankPageInDefaultExportInSource(inline, 1)).toContain(
      'export default [A, NewPage1];',
    );
  });

  it('returns null past the end of the deck or when the export is not an array', () => {
    expect(insertBlankPageInDefaultExportInSource(multiline, -1)).toBeNull();
    expect(insertBlankPageInDefaultExportInSource(multiline, 4)).toBeNull();
    expect(insertBlankPageInDefaultExportInSource('export default A;\n', 0)).toBeNull();
  });

  it('produces source that still parses', () => {
    const out = insertBlankPageInDefaultExportInSource(multiline, 1) ?? '';
    expect(() =>
      babelParse(out, { sourceType: 'module', plugins: ['typescript', 'jsx'] }),
    ).not.toThrow();
  });
});

describe('insertNotesElementInSource', () => {
  it('returns the source unchanged when there is no notes export', () => {
    const source = 'export default [A, B];\n';
    expect(insertNotesElementInSource(source, 0)).toBe(source);
  });

  it('keeps the notes aligned with the pages after an insert', () => {
    const source = `export const notes = [\n  'a',\n  'b',\n];\nexport default [A, B];\n`;
    const out = insertNotesElementInSource(source, 1) ?? '';
    expect(out).toContain("'a',\n  undefined,\n  'b',");
  });

  it('returns null on a negative index', () => {
    expect(
      insertNotesElementInSource(`export const notes = ['a'];\nexport default [A];\n`, -1),
    ).toBeNull();
  });
});
