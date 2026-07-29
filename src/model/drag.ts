import type { Block } from './types';

// Pure drag-and-drop array math (SPEC 9.3). Within a bay, array index 0 is
// the block at the baseline. Columns render with flex-direction:
// column-reverse so DOM order matches array order.

export function blocksInBay(blocks: readonly Block[], bay: string): Block[] {
  return blocks.filter((b) => b.bay === bay);
}

// Move the block at bay-relative index `from` to bay-relative index `to`,
// leaving blocks of other bays in their original array slots. Returns the
// input array unchanged for no-op or out-of-range moves.
export function reorderWithinBay(
  blocks: Block[],
  bay: string,
  from: number,
  to: number,
): Block[] {
  const items = blocksInBay(blocks, bay);
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return blocks;
  }
  const reordered = [...items];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  let next = 0;
  return blocks.map((b) => (b.bay === bay ? reordered[next++] : b));
}

// Moves a block into `toBay` at bay-relative index `toIndex`, where toIndex
// is the insert position in the destination list AFTER the block has been
// removed from wherever it was. `toBay` may be PARKING.
//
// Blocks of other bays keep their array slots: only the moved block changes
// position, so CSV row order stays as stable as it can be.
export function moveBlockTo(
  blocks: Block[],
  id: string,
  toBay: string,
  toIndex: number,
): Block[] {
  const block = blocks.find((b) => b.id === id);
  if (!block) return blocks;

  if (block.bay === toBay) {
    const items = blocksInBay(blocks, toBay);
    const from = items.findIndex((b) => b.id === id);
    const to = Math.max(0, Math.min(toIndex, items.length - 1));
    return reorderWithinBay(blocks, toBay, from, to);
  }

  const removed = blocks.filter((b) => b.id !== id);
  const targetSlots: number[] = [];
  removed.forEach((b, i) => {
    if (b.bay === toBay) targetSlots.push(i);
  });
  const clamped = Math.max(0, Math.min(toIndex, targetSlots.length));

  let insertAt: number;
  if (clamped < targetSlots.length) insertAt = targetSlots[clamped];
  else if (targetSlots.length > 0) insertAt = targetSlots[targetSlots.length - 1] + 1;
  else insertAt = removed.length;

  const next = [...removed];
  next.splice(insertAt, 0, { ...block, bay: toBay });
  return next;
}

// A bay column renders column-reverse, so a HIGHER array index sits HIGHER on
// screen and the sign of every midpoint test flips. The parking tray is a
// plain horizontal list and does not flip. This is the off-by-one trap called
// out in SPEC 9.3; keeping it in one pure function is what makes it testable.
export type StackOrientation = 'bottom-stack' | 'horizontal';

export function dropIndexFor(
  overIndex: number,
  activeCenter: number,
  overMid: number,
  orientation: StackOrientation,
): number {
  const past =
    orientation === 'bottom-stack' ? activeCenter < overMid : activeCenter > overMid;
  return past ? overIndex + 1 : overIndex;
}
