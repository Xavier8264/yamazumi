import type { ChartState } from './types';
import { UNCATEGORIZED_COLOR } from './palette';

// SPEC section 5: the single implementation of the chart's geometry.
// Pure: no DOM, no React, no canvas, no window. Renderers only paint.

export interface LayoutRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number; // screen coords, top-left origin
  fill: string;
  label: string;
  minutes: number;
  labelFits: boolean; // false when h is too small to draw the label
}

export interface LayoutResult {
  pxPerMinute: number;
  plot: { x: number; y: number; w: number; h: number };
  blocks: LayoutRect[];
  bayHeaders: { bay: string; x: number; w: number; totalMinutes: number; topY: number }[];
  axisTicks: { y: number; minutes: number; label: string }[];
  taktY: number | null;
  overflowBays: string[]; // bays whose total exceeds axisMaxMinutes
}

// Geometry constants. Renderers may read these for typography but must not
// duplicate any positional math.
export const LABEL_LINE_HEIGHT = 16;
export const MARGIN = { left: 56, right: 64, top: 48, bottom: 28 };
export const COLUMN_PADDING = 12;

// The canonical presentation frame: 16:9, the one viewport every picture of
// the chart is composed at. Presentation mode (SPEC 12.3) renders this exact
// box and scales it to fit the window; PNG, PDF, and every video frame compose
// at it too and only differ in pixel density. That is what makes a Win+Shift+S
// capture, an exported PNG, and an MP4 frame the same image regardless of
// window size, browser zoom, Windows display scaling, or export resolution.
export const PRESENT_FRAME = { width: 1920, height: 1080 };

const EPSILON = 1e-9;

export function layout(
  state: ChartState,
  viewport: { width: number; height: number },
): LayoutResult {
  const plot = {
    x: MARGIN.left,
    y: MARGIN.top,
    w: Math.max(0, viewport.width - MARGIN.left - MARGIN.right),
    h: Math.max(0, viewport.height - MARGIN.top - MARGIN.bottom),
  };
  const pxPerMinute = state.axisMaxMinutes > 0 ? plot.h / state.axisMaxMinutes : 0;
  const plotBottom = plot.y + plot.h;

  const colorByCategory = new Map<string, string>();
  for (const c of state.categories) colorByCategory.set(c.name, c.color);

  const columnWidth = state.bays.length > 0 ? plot.w / state.bays.length : plot.w;
  const blocks: LayoutRect[] = [];
  const bayHeaders: LayoutResult['bayHeaders'] = [];
  const overflowBays: string[] = [];

  state.bays.forEach((bay, i) => {
    const columnX = plot.x + i * columnWidth;
    const blockX = columnX + COLUMN_PADDING;
    const blockW = Math.max(0, columnWidth - COLUMN_PADDING * 2);
    let cumulativeMinutes = 0;

    for (const b of state.blocks) {
      if (b.bay !== bay) continue; // parking lot blocks never match a bay
      const h = b.minutes * pxPerMinute; // exact; no minimum, no clamping
      const y = plotBottom - cumulativeMinutes * pxPerMinute - h;
      blocks.push({
        id: b.id,
        x: blockX,
        y,
        w: blockW,
        h,
        fill:
          b.category !== null
            ? (colorByCategory.get(b.category) ?? UNCATEGORIZED_COLOR)
            : UNCATEGORIZED_COLOR,
        label: b.process,
        minutes: b.minutes,
        labelFits: h >= LABEL_LINE_HEIGHT,
      });
      cumulativeMinutes += b.minutes;
    }

    bayHeaders.push({
      bay,
      x: columnX,
      w: columnWidth,
      totalMinutes: cumulativeMinutes,
      topY: plotBottom - cumulativeMinutes * pxPerMinute,
    });
    if (cumulativeMinutes > state.axisMaxMinutes + EPSILON) overflowBays.push(bay);
  });

  const axisTicks: LayoutResult['axisTicks'] = [];
  const interval = state.axisIntervalMinutes > 0 ? state.axisIntervalMinutes : 30;
  for (let i = 0; i * interval <= state.axisMaxMinutes + EPSILON; i++) {
    const minutes = i * interval;
    axisTicks.push({
      y: plotBottom - minutes * pxPerMinute,
      minutes,
      label: String(minutes), // plain minutes, never h:mm
    });
  }

  const taktY =
    state.taktMinutes === null ? null : plotBottom - state.taktMinutes * pxPerMinute;

  return { pxPerMinute, plot, blocks, bayHeaders, axisTicks, taktY, overflowBays };
}
