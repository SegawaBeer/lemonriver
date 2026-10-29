import { describe, expect, it } from 'vitest';
import { checkFile, extensionOf, formatSize, MAX_FILE_BYTES } from './files';

const bytes = (values: number[], fill = 16): Uint8Array => {
  const head = new Uint8Array(fill).fill(0x50);
  head.set(values);
  return head;
};

const pdf = (text = '') => {
  const head = new Uint8Array(1024);
  head.set(new TextEncoder().encode(`%PDF-1.7\n${text}`));
  return head;
};

describe('checkFile', () => {
  it('accepts an ordinary file of a supported kind', () => {
    expect(checkFile({ name: 'notes.pdf', size: 1024, head: pdf() })).toBe('ok');
    expect(checkFile({ name: 'sheet.xlsx', size: 2048, head: bytes([0x50, 0x4b, 3, 4]) })).toBe(
      'ok',
    );
    expect(checkFile({ name: 'Assumptions.MD', size: 10, head: bytes([]) })).toBe('ok');
  });

  it('rejects anything over 25 MB', () => {
    expect(checkFile({ name: 'big.pdf', size: MAX_FILE_BYTES + 1, head: pdf() })).toBe('too-large');
    expect(checkFile({ name: 'exact.pdf', size: MAX_FILE_BYTES, head: pdf() })).toBe('ok');
  });

  it('rejects kinds it cannot hand over', () => {
    expect(checkFile({ name: 'movie.mp4', size: 100, head: bytes([]) })).toBe('unsupported');
    expect(checkFile({ name: 'noext', size: 100, head: bytes([]) })).toBe('unsupported');
  });

  it('catches a password-protected PDF', () => {
    expect(checkFile({ name: 'locked.pdf', size: 100, head: pdf('/Encrypt 5 0 R') })).toBe(
      'locked',
    );
  });

  it('ignores /Encrypt past the first kilobyte', () => {
    const head = new Uint8Array(4096).fill(0x20);
    head.set(new TextEncoder().encode('/Encrypt'), 2048);
    expect(checkFile({ name: 'late.pdf', size: 4096, head })).toBe('ok');
  });

  it('catches an encrypted Office document by its OLE2 header', () => {
    expect(
      checkFile({ name: 'locked.docx', size: 100, head: bytes([0xd0, 0xcf, 0x11, 0xe0]) }),
    ).toBe('locked');
    expect(
      checkFile({ name: 'locked.pptx', size: 100, head: bytes([0xd0, 0xcf, 0x11, 0xe0]) }),
    ).toBe('locked');
    expect(
      checkFile({ name: 'locked.xlsx', size: 100, head: bytes([0xd0, 0xcf, 0x11, 0xe0]) }),
    ).toBe('locked');
  });

  it('leaves the old binary Office formats alone', () => {
    expect(checkFile({ name: 'old.doc', size: 100, head: bytes([0xd0, 0xcf, 0x11, 0xe0]) })).toBe(
      'ok',
    );
  });
});

describe('helpers', () => {
  it('reads the extension case-insensitively', () => {
    expect(extensionOf('a/b/Report.PDF')).toBe('pdf');
    expect(extensionOf('no-dot')).toBe('');
  });

  it('shows sizes the way the card needs them', () => {
    expect(formatSize(30 * 1024 * 1024)).toBe('30 MB');
    expect(formatSize(26.5 * 1024 * 1024)).toBe('27 MB');
    expect(formatSize(1.4 * 1024 * 1024)).toBe('1.4 MB');
  });
});
