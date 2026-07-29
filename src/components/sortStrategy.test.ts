import { describe, expect, it } from 'vitest';
import { bottomStackSortingStrategy } from './sortStrategy';

// A bottom-anchored stack with the baseline at y = 300:
// index 0 (bottom): top 200, height 100
// index 1 (middle): top 150, height 50
// index 2 (top):    top 100, height 50
const rects = [
  { top: 200, left: 0, width: 100, height: 100, bottom: 300, right: 100 },
  { top: 150, left: 0, width: 100, height: 50, bottom: 200, right: 100 },
  { top: 100, left: 0, width: 100, height: 50, bottom: 150, right: 100 },
];

function transformFor(index: number, activeIndex: number, overIndex: number) {
  return bottomStackSortingStrategy({
    activeIndex,
    activeNodeRect: rects[activeIndex],
    index,
    rects,
    overIndex,
  });
}

describe('bottomStackSortingStrategy (column-reverse displacement)', () => {
  it('dragging the bottom block up displaces passed blocks DOWN', () => {
    // Active index 0 moving to index 2: blocks 1 and 2 must slide down by
    // the active height (+100), not up.
    expect(transformFor(1, 0, 2)?.y).toBe(100);
    expect(transformFor(2, 0, 2)?.y).toBe(100);
  });

  it('the active block previews at the over slot when moving up', () => {
    // New top for the active block equals the current top of the over rect.
    expect(transformFor(0, 0, 2)?.y).toBe(rects[2].top - rects[0].top); // -100
  });

  it('dragging the top block down displaces passed blocks UP', () => {
    expect(transformFor(0, 2, 0)?.y).toBe(-50);
    expect(transformFor(1, 2, 0)?.y).toBe(-50);
  });

  it('the active block previews bottom-aligned with the over rect when moving down', () => {
    expect(transformFor(2, 2, 0)?.y).toBe(rects[0].bottom - rects[2].bottom); // +150
  });

  it('blocks outside the passed range do not move', () => {
    expect(transformFor(2, 0, 1)?.y).toBe(0);
  });
});
