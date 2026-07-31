import { describe, expect, it } from 'vitest';
import { PRESENT_FRAME } from '../model/layout';
import { PAGE_BACKGROUND, splitFrame } from './canvasRenderer';
import { buildAnimation, renderAnimationFrame } from './interpolate';
import type { Block, ChartState } from '../model/types';

// SPEC 13: a frame of the clip is a picture of the chart, so it has to be the
// same picture a PNG is -- same surface, same composition, whatever resolution
// it is being encoded at.

function block(id: string, bay: string, minutes: number, category: string | null): Block {
  return { id, bay, process: 'P ' + id, minutes, category };
}

function chartState(blocks: Block[]): ChartState {
  return {
    bays: ['Bay 1', 'Bay 2', 'Bay 3'],
    blocks,
    categories: [
      { name: 'VA', color: '#2E7D32' },
      { name: 'NVA', color: '#F9A825' },
    ],
    taktMinutes: 60,
    axisMaxMinutes: 120,
    axisIntervalMinutes: 30,
  };
}

const BEFORE = chartState([
  block('a', 'Bay 1', 45, 'VA'),
  block('b', 'Bay 1', 30, 'NVA'),
  block('c', 'Bay 2', 20, 'VA'),
]);
const AFTER = chartState([
  block('a', 'Bay 2', 45, 'VA'),
  block('b', 'Bay 1', 55, 'NVA'),
  block('d', 'Bay 3', 25, null),
]);

function measureCtx(): CanvasRenderingContext2D {
  return document.createElement('canvas').getContext('2d')!;
}

function animAt(resolution: { width: number; height: number }) {
  return buildAnimation(BEFORE, AFTER, resolution, measureCtx());
}

describe('animation frames', () => {
  it('composes at the presentation frame, split like a still', () => {
    const anim = animAt({ width: 1920, height: 1080 });
    expect(anim.frame).toEqual(PRESENT_FRAME);
    expect(splitFrame(measureCtx(), AFTER, PRESENT_FRAME)).toEqual({
      chartViewport: anim.chartViewport,
      legendHeight: anim.legendHeight,
    });
  });

  it('resolution changes pixel density, not the picture', () => {
    const hd = animAt({ width: 1920, height: 1080 });
    const uhd = animAt({ width: 3840, height: 2160 });
    expect(uhd.frame).toEqual(hd.frame);
    expect(uhd.chartViewport).toEqual(hd.chartViewport);
    expect(uhd.setup.afterLayout).toEqual(hd.setup.afterLayout);
  });

  // The bug this pins down: the video path used to paint its own white page.
  it('paints the page background, the same surface a still does', () => {
    const anim = animAt({ width: 960, height: 540 });
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext('2d')!;
    renderAnimationFrame(ctx, anim, 0.5, 'easeInOutCubic');
    const [red, green, blue] = ctx.getImageData(2, 2, 1, 1).data;
    const expected = [
      parseInt(PAGE_BACKGROUND.slice(1, 3), 16),
      parseInt(PAGE_BACKGROUND.slice(3, 5), 16),
      parseInt(PAGE_BACKGROUND.slice(5, 7), 16),
    ];
    expect([red, green, blue]).toEqual(expected);
  });

  // Same picture at two densities: sampling the same relative point in both
  // has to land on the same thing.
  it('draws the same frame into a small canvas as into a large one', () => {
    const anim = animAt({ width: 1920, height: 1080 });
    const sample = (targetWidth: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = Math.round((targetWidth * 9) / 16);
      const ctx = canvas.getContext('2d')!;
      renderAnimationFrame(ctx, anim, 1, 'linear', targetWidth);
      // 20% across, 85% down: inside Bay 1's stack at t=1.
      const x = Math.round(canvas.width * 0.2);
      const y = Math.round(canvas.height * 0.85);
      return Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
    };
    // '#F9A825' -> rgb(249, 168, 37), block 'b' in Bay 1.
    expect(sample(960)).toEqual([249, 168, 37]);
    expect(sample(1920)).toEqual(sample(960));
  });
});
