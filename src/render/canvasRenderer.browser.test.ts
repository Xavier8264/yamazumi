import { describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { PRESENT_FRAME, layout } from '../model/layout';
import {
  BAND_INSET,
  legendEntriesFor,
  renderStill,
  splitFrame,
  usedLegendEntries,
} from './canvasRenderer';
import Legend from '../components/Legend';
import { PARKING } from '../model/types';
import type { ChartState } from '../model/types';
import '../index.css';

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

// A small stand-in for PRESENT_FRAME, same 16:9 shape. Tests that only care
// about the frame contract use it so they are not allocating 5760x3240.
const FRAME = { width: 800, height: 450 };

describe('renderStill: output dimensions', () => {
  it('composes the presentation frame, not the editor window shape', () => {
    const canvas = document.createElement('canvas');
    const size = renderStill(canvas, state({ taktMinutes: null }), {
      pixelRatio: 1,
      includeParking: false,
    });
    expect(size).toEqual(PRESENT_FRAME);
    expect(canvas.width).toBe(PRESENT_FRAME.width);
    expect(canvas.height).toBe(PRESENT_FRAME.height);
    // 16:9, which is the whole point: it is what a slide and an MP4 are.
    expect(size.width / size.height).toBeCloseTo(16 / 9, 9);
  });

  it('renders at the requested pixel ratio', () => {
    const canvas = document.createElement('canvas');
    for (const pixelRatio of [1, 2, 3]) {
      renderStill(canvas, state({ taktMinutes: null }), {
        pixelRatio,
        includeParking: false,
        frame: FRAME,
      });
      expect(canvas.width).toBe(FRAME.width * pixelRatio);
      expect(canvas.height).toBe(FRAME.height * pixelRatio);
    }
  });

  // The legend is part of the picture, exactly as the strip is part of a
  // presentation-mode screen: it takes its height out of the chart's, and the
  // image stays 16:9. Growing the image instead would make the export a
  // different shape than the screen it is supposed to reproduce.
  it('fits the legend band inside the frame', () => {
    const canvas = document.createElement('canvas');
    const withUse = state({
      blocks: [
        { id: 'a', bay: 'Bay 1', process: 'Weld', minutes: 30, category: 'Value-Add' },
      ],
    });
    const size = renderStill(canvas, withUse, {
      pixelRatio: 1,
      includeParking: false,
      frame: FRAME,
    });
    expect(size).toEqual(FRAME);
    expect(canvas.height).toBe(FRAME.height);

    const ctx = canvas.getContext('2d')!;
    const split = splitFrame(ctx, withUse, FRAME);
    expect(split.legendHeight).toBeGreaterThan(0);
    expect(split.chartViewport.height + split.legendHeight).toBe(FRAME.height);
  });

  it('gives the chart the whole frame when there is nothing to legend', () => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const bare = state({
      taktMinutes: null,
      blocks: [{ id: 'a', bay: 'Bay 1', process: 'Weld', minutes: 30, category: null }],
    });
    expect(usedLegendEntries(bare)).toEqual([]);
    expect(splitFrame(ctx, bare, FRAME)).toEqual({
      chartViewport: FRAME,
      legendHeight: 0,
    });
  });

  it('legends the takt rule even when no category is in use', () => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const taktOnly = state({
      taktMinutes: 60,
      blocks: [{ id: 'a', bay: 'Bay 1', process: 'Weld', minutes: 30, category: null }],
    });
    expect(legendEntriesFor(taktOnly)).toEqual([
      { name: 'Takt 60 min', color: '#E6A417', dashed: true },
    ]);
    expect(splitFrame(ctx, taktOnly, FRAME).legendHeight).toBeGreaterThan(0);
  });

  // The one band that is allowed to change the shape of the image: the tray is
  // unmounted in presentation mode, so it cannot be part of the frame.
  it('appends a parking band below the frame only when requested', () => {
    const canvas = document.createElement('canvas');
    const withParking = state({
      blocks: [
        { id: 'p', bay: PARKING, process: 'Touchup', minutes: 15, category: null },
      ],
    });
    renderStill(canvas, withParking, {
      pixelRatio: 1,
      includeParking: false,
      frame: FRAME,
    });
    expect(canvas.height).toBe(FRAME.height);
    const size = renderStill(canvas, withParking, {
      pixelRatio: 1,
      includeParking: true,
      frame: FRAME,
    });
    expect(size.height).toBeGreaterThan(FRAME.height);
    expect(canvas.height).toBe(size.height);
    expect(size.width).toBe(FRAME.width);
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
    renderStill(canvas, s, { pixelRatio: ratio, includeParking: false, frame: FRAME });

    const ctx = canvas.getContext('2d')!;
    // Geometry comes from layout() run on the chart's share of the frame, which
    // is what renderStill draws.
    const r = layout(s, splitFrame(ctx, s, FRAME).chartViewport);
    const rect = r.blocks[0];
    // Sample 25% into the block: the exact center is covered by the white
    // process-name label, and the top edge by the takt line.
    const cx = Math.round((rect.x + rect.w / 4) * ratio);
    const cy = Math.round((rect.y + rect.h / 4) * ratio);
    const [red, green, blue] = ctx.getImageData(cx, cy, 1, 1).data;
    // '#C62828' -> rgb(198, 40, 40)
    expect([red, green, blue]).toEqual([198, 40, 40]);
  });

  // SPEC 5: an export has to look like the screen, and the screen is the Bay
  // Tracker dark surface (--bt-bg #11161C).
  it('paints the page background outside the plot', () => {
    const canvas = document.createElement('canvas');
    renderStill(canvas, state(), { pixelRatio: 1, includeParking: false, frame: FRAME });
    const ctx = canvas.getContext('2d')!;
    const [red, green, blue] = ctx.getImageData(2, 2, 1, 1).data;
    expect([red, green, blue]).toEqual([0x11, 0x16, 0x1c]);
  });
});

// The promise in SPEC 5, checked against the actual DOM: presentation mode and
// an export split PRESENT_FRAME the same way. If the legend band metrics in
// canvasRenderer drift from the .presenting .legend rules in index.css, the
// export's plot is a different height than the screen's and every block in the
// picture is the wrong size.
describe('the screen and an export agree on the legend band', () => {
  it('measures the same band height as the presentation-mode strip', async () => {
    const chart = state({
      blocks: [
        { id: 'a', bay: 'Bay 1', process: 'Weld', minutes: 30, category: 'Value-Add' },
      ],
    });

    const host = document.createElement('div');
    host.className = 'editor presenting';
    const stage = document.createElement('div');
    stage.className = 'present-stage';
    stage.style.width = PRESENT_FRAME.width + 'px';
    stage.style.height = PRESENT_FRAME.height + 'px';
    host.appendChild(stage);
    document.body.appendChild(host);

    const root = createRoot(stage);
    try {
      root.render(createElement(Legend, { chart }));
      const strip = await vi.waitUntil(() => stage.querySelector('.legend'));
      const onScreen = (strip as HTMLElement).getBoundingClientRect().height;

      const ctx = document.createElement('canvas').getContext('2d')!;
      const inExport = splitFrame(ctx, chart, PRESENT_FRAME).legendHeight;

      // Within a couple of px: the canvas has no line-box half-leading to
      // measure, so it approximates it with a constant.
      expect(inExport).toBeGreaterThan(0);
      expect(Math.abs(inExport - onScreen)).toBeLessThanOrEqual(4);
      // The inset the canvas draws the band at is the strip's own padding.
      expect(getComputedStyle(strip as HTMLElement).paddingLeft).toBe(
        BAND_INSET + 'px',
      );
    } finally {
      root.unmount();
      host.remove();
    }
  });
});
