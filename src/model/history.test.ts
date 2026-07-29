import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  drop,
  emptyHistory,
  push,
  redo,
  undo,
} from './history';
import { newChartState } from './defaults';
import type { ChartState } from './types';

// Snapshots are distinguished by axisMaxMinutes so the assertions read as a
// sequence of numbers rather than whole chart objects.
function at(n: number): ChartState {
  return { ...newChartState(), axisMaxMinutes: n };
}

describe('history (SPEC 9.4)', () => {
  it('undo restores the previous snapshot and redo returns to it', () => {
    let h = push(emptyHistory, at(1));
    h = push(h, at(2));
    const back = undo(h, at(3));
    expect(back?.present.axisMaxMinutes).toBe(2);

    const forward = redo(back!.history, back!.present);
    expect(forward?.present.axisMaxMinutes).toBe(3);
  });

  it('walks all the way back and all the way forward', () => {
    let h = push(emptyHistory, at(1));
    h = push(h, at(2));
    let present = at(3);

    const seen: number[] = [];
    for (;;) {
      const step = undo(h, present);
      if (!step) break;
      h = step.history;
      present = step.present;
      seen.push(present.axisMaxMinutes);
    }
    expect(seen).toEqual([2, 1]);

    const forward: number[] = [];
    for (;;) {
      const step = redo(h, present);
      if (!step) break;
      h = step.history;
      present = step.present;
      forward.push(present.axisMaxMinutes);
    }
    expect(forward).toEqual([2, 3]);
  });

  it('caps the stack at 50 entries, discarding the oldest', () => {
    let h = emptyHistory;
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = push(h, at(i));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0].axisMaxMinutes).toBe(21);
    expect(h.past[HISTORY_LIMIT - 1].axisMaxMinutes).toBe(HISTORY_LIMIT + 20);
  });

  it('a fresh edit discards the redo branch', () => {
    let h = push(emptyHistory, at(1));
    const back = undo(h, at(2))!;
    expect(canRedo(back.history)).toBe(true);
    h = push(back.history, at(9));
    expect(canRedo(h)).toBe(false);
  });

  it('drop removes the newest undo point without restoring it', () => {
    let h = push(emptyHistory, at(1));
    h = push(h, at(2));
    h = drop(h);
    expect(h.past.map((s) => s.axisMaxMinutes)).toEqual([1]);
    expect(drop(emptyHistory)).toBe(emptyHistory);
  });

  it('reports what is available', () => {
    expect(canUndo(emptyHistory)).toBe(false);
    expect(canRedo(emptyHistory)).toBe(false);
    expect(undo(emptyHistory, at(1))).toBeNull();
    expect(redo(emptyHistory, at(1))).toBeNull();
    expect(canUndo(push(emptyHistory, at(1)))).toBe(true);
  });
});
