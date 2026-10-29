export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** What the browser can hand the agent as a reference file. */
export const FILE_EXTENSIONS = [
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'xls',
  'pptx',
  'ppt',
  'csv',
  'txt',
  'md',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
] as const;

const OFFICE_LOCKED_EXTENSIONS = new Set(['docx', 'xlsx', 'pptx']);
// Encrypted Office files are OLE2 containers; the normal ones are zip archives.
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];
// A PDF with this in its header carries an encryption dictionary.
const PDF_ENCRYPT = '/Encrypt';

export type FileVerdict = 'ok' | 'too-large' | 'locked' | 'unsupported';

export type FileFacts = { name: string; size: number; head: Uint8Array };

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

function startsWith(head: Uint8Array, bytes: number[]): boolean {
  if (head.length < bytes.length) return false;
  return bytes.every((byte, i) => head[i] === byte);
}

function containsText(head: Uint8Array, text: string): boolean {
  const needle = Array.from(text, (char) => char.charCodeAt(0));
  if (head.length < needle.length) return false;
  for (let start = 0; start <= head.length - needle.length; start++) {
    if (needle.every((byte, i) => head[start + i] === byte)) return true;
  }
  return false;
}

export function checkFile({ name, size, head }: FileFacts): FileVerdict {
  if (size > MAX_FILE_BYTES) return 'too-large';
  const ext = extensionOf(name);
  if (!(FILE_EXTENSIONS as readonly string[]).includes(ext)) return 'unsupported';
  if (ext === 'pdf' && containsText(head.slice(0, 1024), PDF_ENCRYPT)) return 'locked';
  if (OFFICE_LOCKED_EXTENSIONS.has(ext) && startsWith(head, OLE2_MAGIC)) return 'locked';
  return 'ok';
}

/** Reads only the bytes a verdict needs, so a 300 MB file is not loaded to reject it. */
export async function checkFileObject(file: File): Promise<FileVerdict> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  return checkFile({ name: file.name, size: file.size, head });
}

export function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}
