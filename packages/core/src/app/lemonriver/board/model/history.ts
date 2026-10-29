/**
 * Undo and redo for the board. Each step remembers only an operation and its
 * opposite; a step whose `undo` is null can still be recorded (a page deleted
 * from a deck whose source could not be read back) but cannot be reverted.
 */
export type HistoryStep = {
  undo: (() => void | Promise<void>) | null;
  redo: () => void | Promise<void>;
};

export type History = { past: HistoryStep[]; future: HistoryStep[] };

export const HISTORY_LIMIT = 50;

export const emptyHistory = (): History => ({ past: [], future: [] });

export const canUndo = (history: History) => history.past.length > 0;
export const canRedo = (history: History) => history.future.length > 0;

/** The step the undo button would take next, so its tooltip can say why not. */
export const nextUndo = (history: History): HistoryStep | null =>
  history.past[history.past.length - 1] ?? null;

/** A new operation retires the redo stack: the future it led to no longer exists. */
export function recordStep(history: History, step: HistoryStep, limit = HISTORY_LIMIT): History {
  const past = [...history.past, step];
  return { past: past.slice(Math.max(0, past.length - limit)), future: [] };
}

export function undoStep(history: History): { history: History; step: HistoryStep } | null {
  const step = history.past[history.past.length - 1];
  if (!step) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [step, ...history.future] },
    step,
  };
}

export function redoStep(history: History): { history: History; step: HistoryStep } | null {
  const [step, ...future] = history.future;
  if (!step) return null;
  return { history: { past: [...history.past, step], future }, step };
}

/**
 * Drops the newest step without running it, for a step that cannot be undone.
 * The rest of the stack stays, so the next undo reaches an earlier operation.
 */
export function dropStep(history: History): History {
  return { past: history.past.slice(0, -1), future: history.future };
}
