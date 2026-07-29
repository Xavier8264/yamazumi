import { PARKING } from './types';
import type { Block } from './types';

export function bayTotal(blocks: readonly Block[], bay: string): number {
  let total = 0;
  for (const b of blocks) {
    if (b.bay === bay) total += b.minutes;
  }
  return total;
}

// Tallest bay total across the given bays. Parking lot blocks are never
// counted because PARKING is not a bay and must not appear in `bays`.
export function tallestBayTotal(blocks: readonly Block[], bays: readonly string[]): number {
  let max = 0;
  for (const bay of bays) {
    const t = bayTotal(blocks, bay);
    if (t > max) max = t;
  }
  return max;
}

export function parkingBlocks(blocks: readonly Block[]): Block[] {
  return blocks.filter((b) => b.bay === PARKING);
}
