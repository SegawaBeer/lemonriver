import { describe, expect, it, vi } from 'vitest';
import {
  canRedo,
  canUndo,
  dropStep,
  emptyHistory,
  HISTORY_LIMIT,
  nextUndo,
  recordStep,
  redoStep,
  undoStep,
} from './history.ts';

const step = (name: string) => ({ undo: vi.fn(), redo: vi.fn(), name });

describe('history', () => {
  it('starts with nothing to undo or redo', () => {
    const history = emptyHistory();
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
    expect(nextUndo(history)).toBeNull();
  });

  it('hands the newest step to undo and moves it onto the redo stack', () => {
    const first = step('first');
    const second = step('second');
    const history = recordStep(recordStep(emptyHistory(), first), second);

    const taken = undoStep(history);
    expect(taken?.step).toBe(second);
    expect(canUndo(taken?.history ?? history)).toBe(true);
    expect(canRedo(taken?.history ?? history)).toBe(true);
    expect(nextUndo(taken?.history ?? history)).toBe(first);
  });

  it('walks forward again after an undo, newest first', () => {
    const first = step('first');
    const second = step('second');
    const recorded = recordStep(recordStep(emptyHistory(), first), second);
    const once = undoStep(recorded)?.history ?? recorded;
    const undone = undoStep(once)?.history ?? once;

    const redone = redoStep(undone);
    expect(redone?.step).toBe(first);
    const again = redoStep(redone?.history ?? undone);
    expect(again?.step).toBe(second);
    expect(canRedo(again?.history ?? undone)).toBe(false);
  });

  it('retires the redo stack when a new operation is recorded', () => {
    const history = recordStep(emptyHistory(), step('first'));
    const undone = undoStep(history)?.history ?? history;
    expect(canRedo(undone)).toBe(true);
    expect(canRedo(recordStep(undone, step('other')))).toBe(false);
  });

  it('keeps only the newest fifty steps', () => {
    let history = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT + 4; i++) history = recordStep(history, step(`${i}`));
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(nextUndo(history)).toBe(history.past[HISTORY_LIMIT - 1]);
  });

  it('drops a step that cannot be undone and reaches the one before it', () => {
    const first = step('first');
    const blocked = { undo: null, redo: vi.fn() };
    const history = recordStep(recordStep(emptyHistory(), first), blocked);
    const dropped = dropStep(history);
    expect(nextUndo(dropped)).toBe(first);
  });
});
