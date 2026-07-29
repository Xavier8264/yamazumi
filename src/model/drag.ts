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
