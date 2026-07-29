import { describe, expect, it } from 'vitest';
import { layout } from '../model/layout';
import { renderStill, usedLegendEntries } from './canvasRenderer';
import { PARKING } from '../model/types';
import type { ChartState } from '../model/types';

function state(overrides: Partial<ChartState> = {}): ChartState {
  return {
    bays: ['Bay 1', 'Bay 2'],
    blocks: [],
    categories: [{ name: 'Value-Add', color: '#C62828' }],
    taktMinutes: 60,
    axisMaxMinutes: 120,
    axisIntervalMinutes: 30,
    ...overrides,
  };
}

const VIEWPORT = { width: 800, height: 600 };

describe('renderStill: output dimensions', () => {
  it('renders at exactly 3x pixel ratio with no legend and no parking', () => {
    const canvas = document.createElement('canvas');
    const size = renderStill(canvas, state(), VIEWPORT, {
      pixelRatio: 3,
      includeParking: false,
    });
    expect(canvas.width).toBe(800 * 3);
    expect(canvas.height).toBe(600 * 3);
    expect(size).toEqual({ width: 800, height: 600 });
  });

  it('adds a legend band only when a category is in use', () => {
    const canvas = document.createElement('canvas');
    const withUse = state({
      blocks: [
        { id: 'a', bay: 'Bay 1', process: 'Weld', minutes: 30, category: 'Value-Add' },
      ],
    });
    renderStill(canvas, withUse, VIEWPORT, { pixelRatio: 3, includeParking: false });
    expect(canvas.height).toBeGreaterThan(600 * 3);

    const unused = state({
      blocks: [{ id: 'a', bay: 'Bay 1', process: 'Weld', minutes: 30, category: null }],
    });
    renderStill(canvas, unused, VIEWPORT, { pixelRatio: 3, includeParking: false });
    expect(canvas.height).toBe(600 * 3);
    expect(usedLegendEntries(unused)).toEqual([]);
  });

  it('adds a parking band only when requested and non-empty', () => {
    const canvas = document.createElement('canvas');
    const withParking = state({
      blocks: [
        { id: 'p', bay: PARKING, process: 'Touchup', minutes: 15, category: null },
      ],
    });
    renderStill(canvas, withParking, VIEWPORT, { pixelRatio: 2, includeParking: false });
    const withoutBand = canvas.height;
    renderStill(canvas, withParking, VIEWPORT, { pixelRatio: 2, includeParking: true });
    expect(canvas.height).toBeGreaterThan(withoutBand);
  });

  it('respects other pixel ratios', () => {
    const canvas = document.createElement('canvas');
    renderStill(canvas, state(), VIEWPORT, { pixelRatio: 1, includeParking: false });
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });
});

describe('renderStill: paints layout() geometry', () => {
  it('fills a block with its category color at the layout() position', () => {
    const s = state({
      blocks: [
        { id: 'a', bay: 'Bay 1', process: 'Weld', minutes: 60, category: 'Value-Add' },
      ],
    });
    const canvas = document.createElement('canvas');
    const ratio = 2;
    renderStill(canvas, s, VIEWPORT, { pixelRatio: ratio, includeParking: false });

    const r = layout(s, VIEWPORT);
    const rect = r.blocks[0];
    // Sample 25% into the block: the exact center is covered by the white
    // process-name label, and the top edge by the takt line.
    const cx = Math.round((rect.x + rect.w / 4) * ratio);
    const cy = Math.round((rect.y + rect.h / 4) * ratio);
    const ctx = canvas.getContext('2d')!;
    const [red, green, blue] = ctx.getImageData(cx, cy, 1, 1).data;
    // '#C62828' -> rgb(198, 40, 40)
    expect([red, green, blue]).toEqual([198, 40, 40]);
  });

  it('paints the background white outside the plot', () => {
    const canvas = document.createElement('canvas');
    renderStill(canvas, state(), VIEWPORT, { pixelRatio: 1, includeParking: false });
    const ctx = canvas.getContext('2d')!;
    const [red, green, blue] = ctx.getImageData(2, 2, 1, 1).data;
    expect([red, green, blue]).toEqual([255, 255, 255]);
  });
});
