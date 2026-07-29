import { describe, expect, it } from 'vitest';
import { reorderWithinBay } from './drag';
import type { Block } from './types';

function block(id: string, bay: string): Block {
  return { id, bay, process: 'P ' + id, minutes: 10, category: null };
}

// SPEC 9.3: columns are bottom-anchored and render column-reverse so DOM
// order matches array order. These tests pin the index math the drag
// handlers rely on: bay-relative indices map 1:1 onto array order.
describe('reorderWithinBay (SPEC 9.3 index math)', () => {
  it('dragging index 0 to index 2 produces [B, C, A], not the reverse', () => {
    const blocks = [block('A', 'Bay 1'), block('B', 'Bay 1'), block('C', 'Bay 1')];
    const result = reorderWithinBay(blocks, 'Bay 1', 0, 2);
    expect(result.map((b) => b.id)).toEqual(['B', 'C', 'A']);
  });

  it('dragging index 2 to index 0 produces [C, A, B]', () => {
    const blocks = [block('A', 'Bay 1'), block('B', 'Bay 1'), block('C', 'Bay 1')];
    const result = reorderWithinBay(blocks, 'Bay 1', 2, 0);
    expect(result.map((b) => b.id)).toEqual(['C', 'A', 'B']);
  });

  it('dragging index 0 to index 1 swaps neighbors', () => {
    const blocks = [block('A', 'Bay 1'), block('B', 'Bay 1'), block('C', 'Bay 1')];
    const result = reorderWithinBay(blocks, 'Bay 1', 0, 1);
    expect(result.map((b) => b.id)).toEqual(['B', 'A', 'C']);
  });

  it('leaves blocks of other bays in their original array slots', () => {
    const blocks = [
      block('A', 'Bay 1'),
      block('X', 'Bay 2'),
      block('B', 'Bay 1'),
      block('Y', 'Bay 2'),
      block('C', 'Bay 1'),
    ];
    const result = reorderWithinBay(blocks, 'Bay 1', 0, 2);
    expect(result.map((b) => b.id)).toEqual(['B', 'X', 'C', 'Y', 'A']);
  });

  it('returns the same array reference for no-op and out-of-range moves', () => {
    const blocks = [block('A', 'Bay 1'), block('B', 'Bay 1')];
    expect(reorderWithinBay(blocks, 'Bay 1', 0, 0)).toBe(blocks);
    expect(reorderWithinBay(blocks, 'Bay 1', 0, 5)).toBe(blocks);
    expect(reorderWithinBay(blocks, 'Bay 1', -1, 1)).toBe(blocks);
  });
});
