import { describe, expect, it } from 'vitest';
import { layout } from '../model/layout';
import { PARKING } from '../model/types';
import type { Block, ChartState } from '../model/types';
import {
  EASINGS,
  buildSetup,
  categoryWarnings,
  frameAt,
  lerpColor,
  matchBlocks,
  summarizeMatch,
  summaryText,
} from './interpolate';

const VIEWPORT = { width: 1000, height: 700 };

function state(blocks: Block[], overrides: Partial<ChartState> = {}): ChartState {
  return {
    bays: ['Bay 1', 'Bay 2'],
    blocks,
    categories: [
      { name: 'VA', color: '#2E7D32' },
      { name: 'NVA', color: '#F9A825' },
    ],
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
): Block {
  return { id, bay, process: 'P ' + id, minutes, category };
}

describe('easings', () => {
  it('all easings pin 0 and 1', () => {
    for (const ease of Object.values(EASINGS)) {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
    }
  });

  it('easeInOutCubic matches the closed form', () => {
    expect(EASINGS.easeInOutCubic(0.25)).toBeCloseTo(0.0625, 9);
    expect(EASINGS.easeInOutCubic(0.5)).toBeCloseTo(0.5, 9);
    expect(EASINGS.easeInOutCubic(0.75)).toBeCloseTo(0.9375, 9);
  });
});

describe('lerpColor', () => {
  it('interpolates channels and pins the endpoints', () => {
    expect(lerpColor('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(lerpColor('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(lerpColor('#000000', '#FFFFFF', 1)).toBe('#FFFFFF');
    expect(lerpColor('#2E7D32', '#2E7D32', 0.37)).toBe('#2E7D32');
  });
});

describe('matchBlocks', () => {
  it('splits blocks into matched, added, and removed by id', () => {
    const before = layout(
      state([block('m1', 'Bay 1', 30), block('r1', 'Bay 2', 20)]),
      VIEWPORT,
    );
    const after = layout(
      state([block('m1', 'Bay 2', 60), block('a1', 'Bay 1', 15)]),
      VIEWPORT,
    );
    const match = matchBlocks(before, after);
    expect(match.matched.map((m) => m.id)).toEqual(['m1']);
    expect(match.added.map((b) => b.id)).toEqual(['a1']);
    expect(match.removed.map((b) => b.id)).toEqual(['r1']);
  });

  it('a block moved to the parking lot counts as removed', () => {
    const before = layout(state([block('p1', 'Bay 1', 30)]), VIEWPORT);
    const after = layout(state([block('p1', PARKING, 30)]), VIEWPORT);
    const match = matchBlocks(before, after);
    expect(match.matched).toEqual([]);
    expect(match.removed.map((b) => b.id)).toEqual(['p1']);
  });

  it('summarize counts moved only for blocks that actually changed', () => {
    const before = layout(
      state([block('same', 'Bay 1', 30), block('moves', 'Bay 2', 20)]),
      VIEWPORT,
    );
    const after = layout(
      state([
        block('same', 'Bay 1', 30),
        block('moves', 'Bay 2', 45),
        block('new', 'Bay 1', 10),
      ]),
      VIEWPORT,
    );
    const summary = summarizeMatch(matchBlocks(before, after));
    expect(summary).toEqual({ moved: 1, added: 1, removed: 0 });
    expect(summaryText(summary)).toBe('1 block moved, 1 added, 0 removed');
  });
});

describe('frameAt interpolation', () => {
  const beforeState = state([block('m1', 'Bay 1', 30), block('r1', 'Bay 2', 20)]);
  const afterState = state([block('m1', 'Bay 2', 60), block('a1', 'Bay 1', 15)]);
  const setup = buildSetup(beforeState, afterState, VIEWPORT);
  const from = setup.match.matched[0].from;
  const to = setup.match.matched[0].to;

  it('t=0 reproduces the before rects exactly', () => {
    const frame = frameAt(setup, 0, 'easeInOutCubic');
    const m1 = frame.blocks.find((b) => b.id === 'm1')!;
    expect(m1.x).toBe(from.x);
    expect(m1.y).toBe(from.y);
    expect(m1.w).toBe(from.w);
    expect(m1.h).toBe(from.h);
    const r1 = frame.blocks.find((b) => b.id === 'r1')!;
    expect(r1.alpha).toBe(1);
    expect(r1.w).toBe(setup.match.removed[0].w);
    const a1 = frame.blocks.find((b) => b.id === 'a1')!;
    expect(a1.alpha).toBe(0);
    expect(a1.w).toBe(0);
  });

  it('t=1 reproduces the after rects exactly', () => {
    const frame = frameAt(setup, 1, 'easeInOutCubic');
    const m1 = frame.blocks.find((b) => b.id === 'm1')!;
    expect(m1.x).toBe(to.x);
    expect(m1.y).toBe(to.y);
    expect(m1.w).toBe(to.w);
    expect(m1.h).toBe(to.h);
    const a1 = frame.blocks.find((b) => b.id === 'a1')!;
    expect(a1.alpha).toBe(1);
    expect(a1.w).toBe(setup.match.added[0].w);
    const r1 = frame.blocks.find((b) => b.id === 'r1')!;
    expect(r1.alpha).toBe(0);
    expect(r1.w).toBe(0);
  });

  it('t=0.5 with linear easing hits the exact midpoint', () => {
    const frame = frameAt(setup, 0.5, 'linear');
    const m1 = frame.blocks.find((b) => b.id === 'm1')!;
    expect(m1.x).toBeCloseTo((from.x + to.x) / 2, 9);
    expect(m1.y).toBeCloseTo((from.y + to.y) / 2, 9);
    expect(m1.w).toBeCloseTo((from.w + to.w) / 2, 9);
    expect(m1.h).toBeCloseTo((from.h + to.h) / 2, 9);
    const a1 = frame.blocks.find((b) => b.id === 'a1')!;
    expect(a1.alpha).toBeCloseTo(0.5, 9);
    expect(a1.w).toBeCloseTo(setup.match.added[0].w / 2, 9);
  });

  it('the frame chrome comes from the after file', () => {
    const beforeSmall = state([block('m1', 'Bay 1', 10)], { axisMaxMinutes: 60 });
    const afterBig = state([block('m1', 'Bay 1', 10)], { axisMaxMinutes: 120 });
    const s = buildSetup(beforeSmall, afterBig, VIEWPORT);
    const frame = frameAt(s, 0, 'linear');
    expect(frame.axisTicks).toEqual(s.afterLayout.axisTicks);
    expect(frame.plot).toEqual(s.afterLayout.plot);
  });

  it('the takt line lerps between the two files', () => {
    const beforeTakt = state([], { taktMinutes: 60 });
    const afterTakt = state([], { taktMinutes: 90 });
    const s = buildSetup(beforeTakt, afterTakt, VIEWPORT);
    const frame = frameAt(s, 0.5, 'linear');
    expect(frame.taktY).toBeCloseTo(
      (s.beforeLayout.taktY! + s.afterLayout.taktY!) / 2,
      9,
    );
    expect(frameAt(s, 0, 'linear').taktY).toBe(s.beforeLayout.taktY);
    expect(frameAt(s, 1, 'linear').taktY).toBe(s.afterLayout.taktY);
  });

  it('a takt present in only one file holds steady', () => {
    const withTakt = state([], { taktMinutes: 60 });
    const without = state([], { taktMinutes: null });
    const s = buildSetup(without, withTakt, VIEWPORT);
    expect(frameAt(s, 0, 'linear').taktY).toBe(s.afterLayout.taktY);
    expect(frameAt(s, 1, 'linear').taktY).toBe(s.afterLayout.taktY);
  });
});

describe('categoryWarnings', () => {
  it('warns when the files disagree on a category color', () => {
    const before = state([], {
      categories: [{ name: 'VA', color: '#2E7D32' }],
    });
    const after = state([], {
      categories: [{ name: 'VA', color: '#C62828' }],
    });
    const warnings = categoryWarnings(before, after);
    expect(warnings.some((w) => w.includes('VA'))).toBe(true);
  });

  it('stays quiet when they agree', () => {
    const s = state([]);
    expect(categoryWarnings(s, s)).toEqual([]);
  });
});
