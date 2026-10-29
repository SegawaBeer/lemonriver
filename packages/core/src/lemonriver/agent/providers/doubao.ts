// TODO: 豆包办公 (Doubao Office) is not wired up yet. When it ships a command
// line or a local ACP endpoint, add it here the same way WorkBuddy is added and
// register it in ./index.ts.

export type DoubaoDetection = { supported: false; reason: 'not-supported' };

export function detectDoubao(): DoubaoDetection {
  return { supported: false, reason: 'not-supported' };
}
