import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useLrText } from '../text';
import {
  canRedo,
  canUndo,
  dropStep,
  emptyHistory,
  type History,
  type HistoryStep,
  nextUndo,
  recordStep,
  redoStep,
  undoStep,
} from './model/history';

/**
 * Undo and redo over the board's operations. Each step is a pair of closures
 * that replay the operation and its opposite; the stack itself is plain data.
 */
export function useHistory(slideId: string) {
  const [history, setHistory] = useState<History>(emptyHistory);
  const historyRef = useRef(history);
  historyRef.current = history;
  const busy = useRef(false);
  const lr = useLrText();

  // A different deck starts with nothing to undo: a step recorded against the
  // previous deck would run its writes against this one.
  useEffect(() => {
    if (!slideId) return;
    const cleared = emptyHistory();
    historyRef.current = cleared;
    setHistory(cleared);
  }, [slideId]);

  const record = useCallback((step: HistoryStep) => {
    const next = recordStep(historyRef.current, step);
    historyRef.current = next;
    setHistory(next);
  }, []);

  const run = useCallback(
    async (direction: 'undo' | 'redo') => {
      if (busy.current) return false;
      const current = historyRef.current;
      const taken = direction === 'undo' ? undoStep(current) : redoStep(current);
      if (!taken) return false;

      if (direction === 'undo' && !taken.step.undo) {
        // The step cannot be taken back; drop it so the next press reaches a
        // step that can be, and say why.
        const dropped = dropStep(current);
        historyRef.current = dropped;
        setHistory(dropped);
        toast.error(lr.board.undoUnavailable);
        return false;
      }

      busy.current = true;
      historyRef.current = taken.history;
      setHistory(taken.history);
      try {
        await (direction === 'undo' ? taken.step.undo?.() : taken.step.redo());
        return true;
      } finally {
        busy.current = false;
      }
    },
    [lr.board.undoUnavailable],
  );

  const undo = useCallback(() => run('undo'), [run]);
  const redo = useCallback(() => run('redo'), [run]);
  const newest = nextUndo(history);

  return {
    record,
    undo,
    redo,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    /** True when the newest step removed a page that cannot be put back. */
    undoBlocked: newest !== null && newest.undo === null,
  };
}
