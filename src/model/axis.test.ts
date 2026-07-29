import { describe, expect, it } from 'vitest';
import { computeAxisMax, roundUpToMultiple } from './axis';
import { PARKING } from './types';
import type { Block } from './types';

function block(bay: string, minutes: number): Block {
  return { id: 'x' + Math.random(), bay, process: 'p', minutes, category: null };
}

describe('roundUpToMultiple', () => {
  it('rounds up to the next multiple', () => {
    expect(roundUpToMultiple(115, 30)).toBe(120);
    expect(roundUpToMultiple(91, 30)).toBe(120);
  });

  it('keeps an exact multiple as-is, including near-miss float noise', () => {
    expect(roundUpToMultiple(90, 30)).toBe(90);
    expect(roundUpToMultiple(69.00000000000001, 30)).toBe(90);
  });
});

describe('computeAxisMax (SPEC 6 fit)', () => {
  it('without takt: tallest bay * 1.15 rounded up to the interval', () => {
    const result = computeAxisMax({
      blocks: [block('Bay 1', 60), block('Bay 1', 40), block('Bay 2', 20)],
      bays: ['Bay 1', 'Bay 2'],
      taktMinutes: null,
      axisIntervalMinutes: 30,
    });
    // tallest 100 -> 115 -> 120
    expect(result).toBe(120);
  });

  it('with takt: the takt wins when it is taller than every bay', () => {
    const result = computeAxisMax({
      blocks: [block('Bay 1', 10)],
      bays: ['Bay 1'],
      taktMinutes: 100,
      axisIntervalMinutes: 30,
    });
    expect(result).toBe(120);
  });

  it('with takt shorter than the tallest bay, the bay wins', () => {
    const result = computeAxisMax({
      blocks: [block('Bay 1', 200)],
      bays: ['Bay 1'],
      taktMinutes: 60,
      axisIntervalMinutes: 30,
    });
    // 200 * 1.15 = 230 -> 240
    expect(result).toBe(240);
  });

  it('floors at interval * 2 for an empty chart', () => {
    const result = computeAxisMax({
      blocks: [],
      bays: ['Bay 1'],
      taktMinutes: null,
      axisIntervalMinutes: 30,
    });
    expect(result).toBe(60);
  });

  it('floors at interval * 2 when content is tiny', () => {
    const result = computeAxisMax({
      blocks: [block('Bay 1', 5)],
      bays: ['Bay 1'],
      taktMinutes: null,
      axisIntervalMinutes: 15,
    });
    // 5 * 1.15 = 5.75 -> 15, floored to 30
    expect(result).toBe(30);
  });

  it('excludes the parking lot from the fit', () => {
    const result = computeAxisMax({
      blocks: [block('Bay 1', 10), block(PARKING, 900)],
      bays: ['Bay 1'],
      taktMinutes: null,
      axisIntervalMinutes: 30,
    });
    expect(result).toBe(60);
  });
});
