import { LABEL_LINE_HEIGHT, PRESENT_FRAME, layout } from '../model/layout';
import type { LayoutRect, LayoutResult } from '../model/layout';
import type { ChartState } from '../model/types';
import type { Canvas2D, ChartFrame, FrameRect, LegendEntry } from './canvasRenderer';
import {
  BAND_INSET,
  PAGE_BACKGROUND,
  drawFrame,
  drawLegend,
  legendEntriesFor,
  splitFrame,
} from './canvasRenderer';
import { formatMinutes } from '../components/format';

// SPEC 13.2: blocks are matched by id; layout() runs on both states with the
// same viewport; rects, fills, and the takt line lerp per frame. Axis
// settings, categories, and colors come from the after file.

export type EasingName = 'easeInOutCubic' | 'easeInOutQuad' | 'linear';

export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2),
};

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function channel(hex: string, i: number): number {
  return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
}

export function lerpColor(a: string, b: string, t: number): string {
  if (!a.startsWith('#') || !b.startsWith('#') || a.length !== 7 || b.length !== 7) {
    return t < 0.5 ? a : b;
  }
  const parts = [0, 1, 2].map((i) =>
    Math.round(lerp(channel(a, i), channel(b, i), t))
      .toString(16)
      .toUpperCase()
      .padStart(2, '0'),
  );
  return '#' + parts.join('');
}

// --- Matching ------------------------------------------------------------

export interface MatchedBlock {
  id: string;
  from: LayoutRect;
  to: LayoutRect;
}

export interface BlockMatch {
  matched: MatchedBlock[];
  added: LayoutRect[]; // present in after only
  removed: LayoutRect[]; // present in before only
}

export function matchBlocks(before: LayoutResult, after: LayoutResult): BlockMatch {
  const beforeById = new Map(before.blocks.map((b) => [b.id, b]));
  const afterIds = new Set(after.blocks.map((b) => b.id));
  const matched: MatchedBlock[] = [];
  const added: LayoutRect[] = [];
  for (const to of after.blocks) {
    const from = beforeById.get(to.id);
    if (from) matched.push({ id: to.id, from, to });
    else added.push(to);
  }
  const removed = before.blocks.filter((b) => !afterIds.has(b.id));
  return { matched, added, removed };
}

const RECT_EPS = 0.01;

function blockChanged(m: MatchedBlock): boolean {
  return (
    Math.abs(m.from.x - m.to.x) > RECT_EPS ||
    Math.abs(m.from.y - m.to.y) > RECT_EPS ||
    Math.abs(m.from.w - m.to.w) > RECT_EPS ||
    Math.abs(m.from.h - m.to.h) > RECT_EPS ||
    m.from.fill !== m.to.fill
  );
}

export interface MatchSummary {
  moved: number;
  added: number;
  removed: number;
}

export function summarizeMatch(match: BlockMatch): MatchSummary {
  return {
    moved: match.matched.filter(blockChanged).length,
    added: match.added.length,
    removed: match.removed.length,
  };
}

// SPEC 13.1: e.g. '12 blocks moved, 3 added, 1 removed'.
export function summaryText(s: MatchSummary): string {
  return (
    s.moved + (s.moved === 1 ? ' block' : ' blocks') + ' moved, ' +
    s.added + ' added, ' + s.removed + ' removed'
  );
}

// Warn when the two files disagree on category colors (SPEC 13.2).
export function categoryWarnings(
  beforeState: ChartState,
  afterState: ChartState,
): string[] {
  const warnings: string[] = [];
  const beforeByName = new Map(beforeState.categories.map((c) => [c.name, c.color]));
  for (const c of afterState.categories) {
    const beforeColor = beforeByName.get(c.name);
    if (beforeColor !== undefined && beforeColor.toUpperCase() !== c.color.toUpperCase()) {
      warnings.push(
        '[!] Category "' + c.name +
          '" has different colors in the two files; using the after color.',
      );
    }
  }
  if (
    beforeState.taktMinutes !== null &&
    afterState.taktMinutes !== null &&
    beforeState.taktMinutes !== afterState.taktMinutes
  ) {
    warnings.push(
      '[!] Takt differs between files (' + beforeState.taktMinutes + ' -> ' +
        afterState.taktMinutes + '); the takt line animates between them.',
    );
  }
  return warnings;
}

// --- Frame interpolation -------------------------------------------------

export interface AnimationSetup {
  viewport: { width: number; height: number };
  beforeState: ChartState;
  afterState: ChartState;
  beforeLayout: LayoutResult;
  afterLayout: LayoutResult;
  match: BlockMatch;
}

export function buildSetup(
  beforeState: ChartState,
  afterState: ChartState,
  viewport: { width: number; height: number },
): AnimationSetup {
  const beforeLayout = layout(beforeState, viewport);
  const afterLayout = layout(afterState, viewport);
  return {
    viewport,
    beforeState,
    afterState,
    beforeLayout,
    afterLayout,
    match: matchBlocks(beforeLayout, afterLayout),
  };
}

// Fade and scale about the rect center; used for added and removed blocks.
function scaledRect(rect: LayoutRect, scale: number, alpha: number): FrameRect {
  const w = rect.w * scale;
  const h = rect.h * scale;
  return {
    ...rect,
    x: rect.x + (rect.w - w) / 2,
    y: rect.y + (rect.h - h) / 2,
    w,
    h,
    labelFits: rect.labelFits && h >= LABEL_LINE_HEIGHT,
    alpha,
  };
}

export function frameAt(
  setup: AnimationSetup,
  t: number,
  easing: EasingName,
): ChartFrame {
  const clamped = Math.min(1, Math.max(0, t));
  const e = EASINGS[easing](clamped);

  const blocks: FrameRect[] = [];
  for (const m of setup.match.matched) {
    const h = lerp(m.from.h, m.to.h, e);
    blocks.push({
      id: m.id,
      x: lerp(m.from.x, m.to.x, e),
      y: lerp(m.from.y, m.to.y, e),
      w: lerp(m.from.w, m.to.w, e),
      h,
      fill: lerpColor(m.from.fill, m.to.fill, e),
      label: e < 0.5 ? m.from.label : m.to.label,
      minutes: lerp(m.from.minutes, m.to.minutes, e),
      labelFits: h >= LABEL_LINE_HEIGHT,
      alpha: 1,
    });
  }
  for (const r of setup.match.removed) blocks.push(scaledRect(r, 1 - e, 1 - e));
  for (const r of setup.match.added) blocks.push(scaledRect(r, e, e));

  // The frame chrome (axis, plot, ticks) comes from the after file so the
  // frame is stable (SPEC 13.2).
  const after = setup.afterLayout;

  // The takt line lerps between the two files' values; a no-op when they
  // match. If only one file has a takt, that line holds steady.
  const beforeY = setup.beforeLayout.taktY;
  const afterY = after.taktY;
  const taktY =
    beforeY !== null && afterY !== null ? lerp(beforeY, afterY, e) : (afterY ?? beforeY);

  const beforeTakt = setup.beforeState.taktMinutes;
  const afterTakt = setup.afterState.taktMinutes;
  let taktLabel: string | null = null;
  if (beforeTakt !== null && afterTakt !== null) {
    taktLabel = 'Takt ' + formatMinutes(lerp(beforeTakt, afterTakt, e));
  } else if (afterTakt !== null) {
    taktLabel = 'Takt ' + formatMinutes(afterTakt);
  } else if (beforeTakt !== null) {
    taktLabel = 'Takt ' + formatMinutes(beforeTakt);
  }

  // Headers from the after file, with totals and stack tops lerped for bays
  // present in both so the numbers do not jump at t=0.
  const beforeHeaders = new Map(setup.beforeLayout.bayHeaders.map((h) => [h.bay, h]));
  const bayHeaders = after.bayHeaders.map((h) => {
    const b = beforeHeaders.get(h.bay);
    if (!b) return h;
    return {
      ...h,
      totalMinutes: lerp(b.totalMinutes, h.totalMinutes, e),
      topY: lerp(b.topY, h.topY, e),
    };
  });

  return {
    viewport: setup.viewport,
    // Scale comes from the after file, like the axis it belongs to (SPEC 13.2).
    pxPerMinute: after.pxPerMinute,
    plot: after.plot,
    blocks,
    bayHeaders,
    axisTicks: after.axisTicks,
    taktY,
    taktLabel,
    legend: legendEntriesFor(setup.afterState),
  };
}

// --- Full video frame (chart + legend band) ------------------------------

export interface Animation {
  resolution: { width: number; height: number }; // output pixels
  frame: { width: number; height: number }; // logical composition (16:9)
  chartViewport: { width: number; height: number };
  legend: LegendEntry[];
  legendHeight: number;
  setup: AnimationSetup;
}

// The clip is composed at PRESENT_FRAME and split into chart plus legend band
// exactly as a still is, so a frame of the MP4 is the PNG. `resolution` only
// decides how many pixels that picture is rasterized into: 1080p and 2160p are
// the same composition at different densities, not two different-looking
// charts, which is what happens when type sizes are absolute and the canvas
// grows underneath them.
export function buildAnimation(
  beforeState: ChartState,
  afterState: ChartState,
  resolution: { width: number; height: number },
  measureCtx: Canvas2D,
  frame: { width: number; height: number } = PRESENT_FRAME,
): Animation {
  const { chartViewport, legendHeight } = splitFrame(measureCtx, afterState, frame);
  return {
    resolution,
    frame,
    chartViewport,
    legendHeight,
    legend: legendEntriesFor(afterState),
    setup: buildSetup(beforeState, afterState, chartViewport),
  };
}

// Draws one complete video frame. Composition is in frame coordinates; the
// transform maps it onto however many pixels the target canvas is wide, so the
// same call feeds the half-size preview player and the full-resolution encoder.
export function renderAnimationFrame(
  ctx: Canvas2D,
  anim: Animation,
  t: number,
  easing: EasingName,
  targetWidth: number = anim.resolution.width,
): void {
  const scale = targetWidth / anim.frame.width;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = PAGE_BACKGROUND;
  ctx.fillRect(0, 0, anim.frame.width, anim.frame.height);
  drawFrame(ctx, frameAt(anim.setup, t, easing), null);
  if (anim.legend.length > 0) {
    drawLegend(
      ctx,
      anim.legend,
      BAND_INSET,
      anim.chartViewport.height,
      anim.frame.width - BAND_INSET * 2,
    );
  }
}
