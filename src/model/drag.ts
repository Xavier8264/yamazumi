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

// Where a hover lands the dragged block: the bay it joins and the slot it will
// occupy there, ready to hand to moveBlockTo.
//
// The slot is always the index the HOVERED block occupies in its own bay. That
// is the same number the sorting strategy uses to draw the ghost (dnd-kit's
// overIndex), so the drop and the preview cannot disagree. This is the whole
// point of the function: the ghost is a promise, and SPEC 9.3 requires the drop
// position to be visible before release. Any second opinion here -- a midpoint
// test against the dragged rect, say -- makes the block jump on release,
// because the two opinions are computed from different geometry.
//
// It also means the column-reverse inversion never needs a sign flip. dnd-kit
// reports the block under the pointer; asking for its index is orientation
// free, which is what defuses the off-by-one trap SPEC 9.3 warns about.
//
// `overBay` is the bay when the pointer is over a bay column ITSELF rather than
// a block in it -- the empty space above a stack -- where the only sensible
// answer is "on top". Otherwise pass null.
//
// Hovering the dragged block itself returns its own slot, which moveBlockTo
// treats as a no-op: the block stays where the preview already put it.
export function dropTargetFor(
  blocks: readonly Block[],
  activeId: string,
  overId: string,
  overBay: string | null,
): { bay: string; index: number } | null {
  if (overBay !== null) {
    const items = blocks.filter((b) => b.bay === overBay && b.id !== activeId);
    return { bay: overBay, index: items.length };
  }

  const over = blocks.find((b) => b.id === overId);
  if (!over) return null;
  const items = blocksInBay(blocks, over.bay);
  return { bay: over.bay, index: items.findIndex((b) => b.id === overId) };
}
