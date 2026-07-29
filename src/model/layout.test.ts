import { describe, expect, it } from 'vitest';
import { LABEL_LINE_HEIGHT, layout } from './layout';
import { PARKING } from './types';
import type { ChartState } from './types';
import { UNCATEGORIZED_COLOR } from './palette';

const VIEWPORT = { width: 1000, height: 700 };

function baseState(overrides: Partial<ChartState> = {}): ChartState {
  return {
    bays: ['Bay 1', 'Bay 2'],
    blocks: [],
    categories: [{ name: 'Value-Add', color: '#2E7D32' }],
    taktMinutes: null,
    axisMaxMinutes: 120,
    axisIntervalMinutes: 30,
    ...overrides,
  };
}

function block(
  id: string,
  bay: string,
  minutes: number,
  category: string | null = null,
) {
  return { id, bay, process: 'P ' + id, minutes, category };
}

describe('layout: scale', () => {
  it('pxPerMinute is plot.h / axisMaxMinutes', () => {
    const r = layout(baseState(), VIEWPORT);
    expect(r.pxPerMinute).toBe(r.plot.h / 120);
  });

  it('a 2x block is exactly 2x tall (proportionality, no clamping)', () => {
    const state = baseState({
      blocks: [block('a', 'Bay 1', 20), block('b', 'Bay 2', 40)],
    });
    const r = layout(state, VIEWPORT);
    const a = r.blocks.find((x) => x.id === 'a')!;
    const b = r.blocks.find((x) => x.id === 'b')!;
    expect(b.h).toBeCloseTo(a.h * 2, 9);
    expect(a.h).toBe(20 * r.pxPerMinute);
  });

  it('has no minimum height: a tiny block gets a tiny rect', () => {
    const state = baseState({ blocks: [block('a', 'Bay 1', 0.01)] });
    const r = layout(state, VIEWPORT);
    expect(r.blocks[0].h).toBe(0.01 * r.pxPerMinute);
  });
});

describe('layout: stacking', () => {
  it('index 0 in a bay touches the baseline (bottom anchored)', () => {
    const state = baseState({ blocks: [block('a', 'Bay 1', 30)] });
    const r = layout(state, VIEWPORT);
    const a = r.blocks[0];
    expect(a.y + a.h).toBeCloseTo(r.plot.y + r.plot.h, 9);
  });

  it('blocks stack cumulatively: each sits on top of the previous', () => {
    const state = baseState({
      blocks: [block('a', 'Bay 1', 30), block('b', 'Bay 1', 15), block('c', 'Bay 1', 45)],
    });
    const r = layout(state, VIEWPORT);
    const [a, b, c] = r.blocks;
    const bottom = r.plot.y + r.plot.h;
    expect(a.y + a.h).toBeCloseTo(bottom, 9);
    expect(b.y + b.h).toBeCloseTo(a.y, 9);
    expect(c.y + c.h).toBeCloseTo(b.y, 9);
  });

  it('within-bay stacking follows array order across interleaved bays', () => {
    const state = baseState({
      blocks: [
        block('a1', 'Bay 1', 10),
        block('b1', 'Bay 2', 20),
        block('a2', 'Bay 1', 10),
      ],
    });
    const r = layout(state, VIEWPORT);
    const a1 = r.blocks.find((x) => x.id === 'a1')!;
    const a2 = r.blocks.find((x) => x.id === 'a2')!;
    expect(a2.y + a2.h).toBeCloseTo(a1.y, 9);
  });
});

describe('layout: parking lot exclusion', () => {
  it('parking blocks are not in blocks and not in totals', () => {
    const state = baseState({
      blocks: [block('a', 'Bay 1', 30), block('p', PARKING, 500)],
    });
    const r = layout(state, VIEWPORT);
    expect(r.blocks.map((x) => x.id)).toEqual(['a']);
    expect(r.bayHeaders.map((h) => h.totalMinutes)).toEqual([30, 0]);
    expect(r.overflowBays).toEqual([]);
  });
});

describe('layout: totals and headers', () => {
  it('bay totals match the sum of their blocks', () => {
    const state = baseState({
      blocks: [
        block('a', 'Bay 1', 12.5),
        block('b', 'Bay 1', 7.25),
        block('c', 'Bay 2', 40),
      ],
    });
    const r = layout(state, VIEWPORT);
    expect(r.bayHeaders[0].totalMinutes).toBeCloseTo(19.75, 9);
    expect(r.bayHeaders[1].totalMinutes).toBe(40);
  });

  it('topY is the top of the tallest stack; empty bay topY is the baseline', () => {
    const state = baseState({
      blocks: [block('a', 'Bay 1', 60)],
    });
    const r = layout(state, VIEWPORT);
    const bottom = r.plot.y + r.plot.h;
    expect(r.bayHeaders[0].topY).toBeCloseTo(bottom - 60 * r.pxPerMinute, 9);
    expect(r.bayHeaders[1].totalMinutes).toBe(0);
    expect(r.bayHeaders[1].topY).toBeCloseTo(bottom, 9);
  });

  it('columns divide the plot width evenly in bay order', () => {
    const r = layout(baseState(), VIEWPORT);
    expect(r.bayHeaders).toHaveLength(2);
    expect(r.bayHeaders[0].x).toBe(r.plot.x);
    expect(r.bayHeaders[0].w).toBeCloseTo(r.plot.w / 2, 9);
    expect(r.bayHeaders[1].x).toBeCloseTo(r.plot.x + r.plot.w / 2, 9);
  });
});

describe('layout: axis ticks', () => {
  it('places a tick every interval from 0 to axisMaxMinutes', () => {
    const r = layout(baseState(), VIEWPORT);
    expect(r.axisTicks.map((t) => t.minutes)).toEqual([0, 30, 60, 90, 120]);
    const bottom = r.plot.y + r.plot.h;
    for (const t of r.axisTicks) {
      expect(t.y).toBeCloseTo(bottom - t.minutes * r.pxPerMinute, 9);
    }
  });

  it('labels are plain minutes, never h:mm', () => {
    const r = layout(baseState({ axisMaxMinutes: 90 }), VIEWPORT);
    expect(r.axisTicks.map((t) => t.label)).toEqual(['0', '30', '60', '90']);
  });

  it('handles a non-default interval', () => {
    const r = layout(
      baseState({ axisMaxMinutes: 45, axisIntervalMinutes: 15 }),
      VIEWPORT,
    );
    expect(r.axisTicks.map((t) => t.minutes)).toEqual([0, 15, 30, 45]);
  });
});

describe('layout: takt line', () => {
  it('taktY sits at the takt time on the scale', () => {
    const r = layout(baseState({ taktMinutes: 60 }), VIEWPORT);
    const bottom = r.plot.y + r.plot.h;
    expect(r.taktY).toBeCloseTo(bottom - 60 * r.pxPerMinute, 9);
  });

  it('taktY is null when there is no takt', () => {
    const r = layout(baseState({ taktMinutes: null }), VIEWPORT);
    expect(r.taktY).toBeNull();
  });
});

describe('layout: overflow', () => {
  it('lists bays whose total exceeds axisMaxMinutes', () => {
    const state = baseState({
      blocks: [block('a', 'Bay 1', 130), block('b', 'Bay 2', 120)],
    });
    const r = layout(state, VIEWPORT);
    expect(r.overflowBays).toEqual(['Bay 1']);
  });

  it('a total exactly at axisMaxMinutes does not overflow', () => {
    const state = baseState({ blocks: [block('a', 'Bay 1', 120)] });
    const r = layout(state, VIEWPORT);
    expect(r.overflowBays).toEqual([]);
  });
});

describe('layout: labels and fills', () => {
  it('labelFits is false when the block is shorter than the label line height', () => {
    // plot.h = 700 - 48 - 28 = 624; pxPerMinute = 624 / 120 = 5.2
    const state = baseState({
      blocks: [block('small', 'Bay 1', 2), block('big', 'Bay 1', 10)],
    });
    const r = layout(state, VIEWPORT);
    const small = r.blocks.find((x) => x.id === 'small')!;
    const big = r.blocks.find((x) => x.id === 'big')!;
    expect(small.h).toBeLessThan(LABEL_LINE_HEIGHT);
    expect(small.labelFits).toBe(false);
    expect(big.h).toBeGreaterThanOrEqual(LABEL_LINE_HEIGHT);
    expect(big.labelFits).toBe(true);
  });

  it('fill comes from the category; uncategorized is neutral gray', () => {
    const state = baseState({
      blocks: [block('a', 'Bay 1', 30, 'Value-Add'), block('b', 'Bay 1', 30, null)],
    });
    const r = layout(state, VIEWPORT);
    expect(r.blocks[0].fill).toBe('#2E7D32');
    expect(r.blocks[1].fill).toBe(UNCATEGORIZED_COLOR);
  });

  it('an unknown category name falls back to neutral gray', () => {
    const state = baseState({ blocks: [block('a', 'Bay 1', 30, 'Ghost')] });
    const r = layout(state, VIEWPORT);
    expect(r.blocks[0].fill).toBe(UNCATEGORIZED_COLOR);
  });
});
