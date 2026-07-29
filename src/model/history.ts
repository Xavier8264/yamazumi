import type { ChartState } from './types';

// SPEC 9.4: snapshot-based undo. A full ChartState copy is pushed onto a
// stack capped at 50 entries. Pure and immutable so the reducer can hold it
// in state; no DOM, no React.

export const HISTORY_LIMIT = 50;

export interface History {
  past: ChartState[];
  future: ChartState[];
}

export const emptyHistory: History = { past: [], future: [] };

// Records `present` as an undo point. Any redo branch is discarded, which is
// the standard rule: a fresh edit invalidates what was undone.
export function push(history: History, present: ChartState): History {
  const past = [...history.past, present];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, future: [] };
}

// Drops the newest undo point without restoring it. Used when an interaction
// that pre-emptively snapshotted (a drag) turns out to have changed nothing.
export function drop(history: History): History {
  if (history.past.length === 0) return history;
  return { ...history, past: history.past.slice(0, -1) };
}

export function canUndo(history: History): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History): boolean {
  return history.future.length > 0;
}

export interface Step {
  history: History;
  present: ChartState;
}

export function undo(history: History, present: ChartState): Step | null {
  if (history.past.length === 0) return null;
  const previous = history.past[history.past.length - 1];
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [present, ...history.future].slice(0, HISTORY_LIMIT),
    },
    present: previous,
  };
}

export function redo(history: History, present: ChartState): Step | null {
  if (history.future.length === 0) return null;
  const next = history.future[0];
  return {
    history: {
      past: [...history.past, present].slice(-HISTORY_LIMIT),
      future: history.future.slice(1),
    },
    present: next,
  };
}
