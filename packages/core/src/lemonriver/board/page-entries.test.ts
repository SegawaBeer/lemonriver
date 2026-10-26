import { describe, expect, it } from 'vitest';
import { defaultExportEntriesInSource } from './page-entries.ts';

describe('defaultExportEntriesInSource', () => {
  it('reads one entry per page', () => {
    const source = `const A = () => null;\nexport default [A, B, () => <C x={1} />] satisfies Page[];\n`;
    expect(defaultExportEntriesInSource(source)).toEqual(['A', 'B', '() => <C x={1} />']);
  });

  it('keeps an entry the same however it is wrapped', () => {
    const tight = 'export default [() => <Plate image={a} />];';
    const loose = 'export default [\n  () => (\n    <Plate\n      image={a}\n    />\n  ),\n];';
    expect(defaultExportEntriesInSource(loose)?.[0]).toBe('() => ( <Plate image={a} /> )');
    expect(defaultExportEntriesInSource(tight)?.[0]).toBe('() => <Plate image={a} />');
  });

  it('gives up on a spread, which stands for an unknown number of pages', () => {
    expect(defaultExportEntriesInSource('export default [A, ...more, B];')).toBeNull();
  });

  it('gives up when the default export is not an array literal', () => {
    expect(defaultExportEntriesInSource('export default pages;')).toBeNull();
    expect(defaultExportEntriesInSource('const x = 1;')).toBeNull();
  });
});
