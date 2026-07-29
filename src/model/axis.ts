import type { Block } from './types';
import { tallestBayTotal } from './totals';

// Small epsilon so a product that should be an exact multiple does not get
// pushed up a whole interval by floating point noise.
export function roundUpToMultiple(value: number, multiple: number): number {
  return Math.ceil(value / multiple - 1e-9) * multiple;
}

export interface AxisFitInput {
  blocks: readonly Block[];
  bays: readonly string[];
  taktMinutes: number | null;
  axisIntervalMinutes: number;
}

// SPEC section 6:
// roundUpToMultiple(max(tallestBayTotal, taktMinutes ?? 0) * 1.15, interval)
// with a floor of interval * 2. Parking lot is excluded via tallestBayTotal.
export function computeAxisMax(input: AxisFitInput): number {
  const interval = input.axisIntervalMinutes;
  const tallest = tallestBayTotal(input.blocks, input.bays);
  const target = Math.max(tallest, input.taktMinutes ?? 0) * 1.15;
  return Math.max(roundUpToMultiple(target, interval), interval * 2);
}
