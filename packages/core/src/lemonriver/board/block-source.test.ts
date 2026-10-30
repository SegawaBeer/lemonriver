import { describe, expect, it } from 'vitest';
import { blockSourceInSource } from './block-source.ts';

const SOURCE = `export default [
  <section>
    <h1>Alpha page one</h1>
    <p>Opening content</p>
    <img src="/chart.png" />
  </section>,
];
`;

describe('blockSourceInSource', () => {
  it('returns the source of the element the block was drawn from', () => {
    expect(blockSourceInSource(SOURCE, '3:4', 'Alpha page one')).toBe('<h1>Alpha page one</h1>');
  });

  it('returns the outer element with everything inside it', () => {
    expect(blockSourceInSource(SOURCE, '4:4', 'Opening content')).toBe('<p>Opening content</p>');
  });

  it('returns null when no element starts at that location', () => {
    expect(blockSourceInSource(SOURCE, '9:4', 'Alpha page one')).toBeNull();
    expect(blockSourceInSource(SOURCE, 'nonsense', 'Alpha page one')).toBeNull();
  });

  it('returns null when the text no longer matches the source', () => {
    expect(blockSourceInSource(SOURCE, '3:4', 'Beta page one')).toBeNull();
    expect(blockSourceInSource(SOURCE, '3:4', '')).toBeNull();
  });

  it('ignores a trailing ellipsis on the block text', () => {
    expect(blockSourceInSource(SOURCE, '3:4', 'Alpha page one…')).toBe('<h1>Alpha page one</h1>');
  });

  it('matches a paragraph whose words sit inside inline elements', () => {
    const source = `export default [
  <section>
    <p>How we get from $28.6M to <strong>$40.0M ARR</strong>, and who does what.</p>
  </section>,
];
`;
    const text = 'How we get from $28.6M to $40.0M ARR, and who does what.';
    expect(blockSourceInSource(source, '3:4', text)).toBe(
      '<p>How we get from $28.6M to <strong>$40.0M ARR</strong>, and who does what.</p>',
    );
  });

  it('reads a line break as a space between words', () => {
    const source = `export default [
  <section>
    <h1>The FY27<br/>operating<br/>plan.</h1>
  </section>,
];
`;
    expect(blockSourceInSource(source, '3:4', 'The FY27 operating plan.')).toBe(
      '<h1>The FY27<br/>operating<br/>plan.</h1>',
    );
  });

  it('matches on the first 40 characters only', () => {
    const source = `export default [
  <section>
    <p>${'word '.repeat(30)}</p>
  </section>,
];
`;
    const text = `${'word '.repeat(30).trim().slice(0, 20)}…`;
    expect(blockSourceInSource(source, '3:4', text)).not.toBeNull();
  });

  it('returns null when the element is longer than 4000 characters', () => {
    const source = `export default [
  <section>
    <p>${'x'.repeat(4200)}</p>
  </section>,
];
`;
    expect(blockSourceInSource(source, '3:4', 'x'.repeat(40))).toBeNull();
  });
});
