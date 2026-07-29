import { describe, expect, it } from 'vitest';
import { dropIndexFor, moveBlockTo, reorderWithinBay } from './drag';
import { PARKING } from './types';
import type { Block } from './types';

function block(id: string, bay: string): Block {
  return { id, bay, process: 'P ' + id, minutes: 10, category: null };
}

function inBay(blocks: Block[], bay: string): string[] {
  return blocks.filter((b) => b.bay === bay).map((b) => b.id);
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

// SPEC 9.3: drag between columns, and to and from the parking lot. toIndex is
// always a position in the destination list with the dragged block already
// removed.
describe('moveBlockTo (cross-container index math)', () => {
  it('drops into the middle of another bay at the given index', () => {
    const blocks = [
      block('A', 'Bay 1'),
      block('X', 'Bay 2'),
      block('Y', 'Bay 2'),
      block('Z', 'Bay 2'),
    ];
    const result = moveBlockTo(blocks, 'A', 'Bay 2', 1);
    expect(inBay(result, 'Bay 2')).toEqual(['X', 'A', 'Y', 'Z']);
    expect(inBay(result, 'Bay 1')).toEqual([]);
  });

  it('index 0 lands on the baseline of the destination column', () => {
    const blocks = [block('A', 'Bay 1'), block('X', 'Bay 2'), block('Y', 'Bay 2')];
    expect(inBay(moveBlockTo(blocks, 'A', 'Bay 2', 0), 'Bay 2')).toEqual([
      'A',
      'X',
      'Y',
    ]);
  });

  it('an index past the end lands on top of the destination column', () => {
    const blocks = [block('A', 'Bay 1'), block('X', 'Bay 2'), block('Y', 'Bay 2')];
    expect(inBay(moveBlockTo(blocks, 'A', 'Bay 2', 2), 'Bay 2')).toEqual([
      'X',
      'Y',
      'A',
    ]);
    expect(inBay(moveBlockTo(blocks, 'A', 'Bay 2', 99), 'Bay 2')).toEqual([
      'X',
      'Y',
      'A',
    ]);
  });

  it('moves into and back out of the parking lot', () => {
    const blocks = [block('A', 'Bay 1'), block('B', 'Bay 1')];
    const parked = moveBlockTo(blocks, 'A', PARKING, 0);
    expect(inBay(parked, PARKING)).toEqual(['A']);
    expect(inBay(parked, 'Bay 1')).toEqual(['B']);

    const returned = moveBlockTo(parked, 'A', 'Bay 1', 1);
    expect(inBay(returned, 'Bay 1')).toEqual(['B', 'A']);
    expect(inBay(returned, PARKING)).toEqual([]);
  });

  it('drops into an empty bay', () => {
    const blocks = [block('A', 'Bay 1')];
    const result = moveBlockTo(blocks, 'A', 'Bay 2', 0);
    expect(inBay(result, 'Bay 2')).toEqual(['A']);
    expect(inBay(result, 'Bay 1')).toEqual([]);
  });

  it('leaves other bays untouched', () => {
    const blocks = [
      block('A', 'Bay 1'),
      block('X', 'Bay 2'),
      block('P', PARKING),
      block('B', 'Bay 1'),
    ];
    const result = moveBlockTo(blocks, 'A', 'Bay 2', 1);
    expect(inBay(result, 'Bay 2')).toEqual(['X', 'A']);
    expect(inBay(result, PARKING)).toEqual(['P']);
    expect(inBay(result, 'Bay 1')).toEqual(['B']);
  });

  it('a same-bay move matches reorderWithinBay exactly', () => {
    const blocks = [block('A', 'Bay 1'), block('B', 'Bay 1'), block('C', 'Bay 1')];
    expect(moveBlockTo(blocks, 'A', 'Bay 1', 2)).toEqual(
      reorderWithinBay(blocks, 'Bay 1', 0, 2),
    );
  });

  it('returns the input array for an unknown id', () => {
    const blocks = [block('A', 'Bay 1')];
    expect(moveBlockTo(blocks, 'nope', 'Bay 2', 0)).toBe(blocks);
  });
});

// The off-by-one trap SPEC 9.3 warns about: bay columns are column-reverse,
// so a higher array index sits HIGHER on screen and the midpoint test flips.
describe('dropIndexFor (column-reverse inversion)', () => {
  it('bottom-stack: dragging ABOVE the midpoint inserts after', () => {
    // Screen y decreases upward, so activeCenter < overMid means "higher".
    expect(dropIndexFor(2, 100, 200, 'bottom-stack')).toBe(3);
  });

  it('bottom-stack: dragging BELOW the midpoint inserts before', () => {
    expect(dropIndexFor(2, 300, 200, 'bottom-stack')).toBe(2);
  });

  it('horizontal: dragging PAST the midpoint inserts after', () => {
    expect(dropIndexFor(1, 300, 200, 'horizontal')).toBe(2);
  });

  it('horizontal: dragging BEFORE the midpoint inserts before', () => {
    expect(dropIndexFor(1, 100, 200, 'horizontal')).toBe(1);
  });

  it('the two orientations disagree on identical geometry', () => {
    expect(dropIndexFor(1, 100, 200, 'bottom-stack')).not.toBe(
      dropIndexFor(1, 100, 200, 'horizontal'),
    );
  });
});
