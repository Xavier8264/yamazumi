import { layout } from '../model/layout';
import type { LayoutRect, LayoutResult } from '../model/layout';
import { PARKING } from '../model/types';
import type { ChartState } from '../model/types';
import { formatMinutes, textColorFor } from '../components/format';

// SPEC 12.1: the Canvas 2D renderer. It consumes LayoutResult (via
// ChartFrame) and paints. It must not reimplement any geometry: every block,
// tick, header and takt position comes from layout(). It is the single code
// path behind PNG, PDF, and video frames. No DOM rasterization.

export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface FrameRect extends LayoutRect {
  alpha?: number; // used by the animator for fade in/out; default 1
}

export interface LegendEntry {
  name: string;
  color: string;
}

export interface ChartFrame {
  viewport: { width: number; height: number };
  plot: LayoutResult['plot'];
  blocks: FrameRect[];
  bayHeaders: LayoutResult['bayHeaders'];
  axisTicks: LayoutResult['axisTicks'];
  taktY: number | null;
  taktLabel: string | null;
  legend: LegendEntry[];
}

const FONT_SMALL = '12px system-ui, sans-serif';
const FONT_BAY = '600 14px system-ui, sans-serif';
const COLOR_GRID = '#ECEFF1';
const COLOR_BASELINE = '#90A4AE';
const COLOR_MUTED = '#57606A';
const COLOR_TAKT = '#37474F';
const COLOR_TEXT = '#1F2328';
const BLOCK_STROKE = 'rgba(0, 0, 0, 0.25)';

// Legend entries for categories currently in use, in state.categories order.
export function usedLegendEntries(state: ChartState): LegendEntry[] {
  const used = new Set<string>();
  for (const b of state.blocks) {
    if (b.category !== null) used.add(b.category);
  }
  return state.categories
    .filter((c) => used.has(c.name))
    .map((c) => ({ name: c.name, color: c.color }));
}

export function frameFromState(
  state: ChartState,
  viewport: { width: number; height: number },
): ChartFrame {
  const r = layout(state, viewport);
  return {
    viewport: { width: viewport.width, height: viewport.height },
    plot: r.plot,
    blocks: r.blocks,
    bayHeaders: r.bayHeaders,
    axisTicks: r.axisTicks,
    taktY: r.taktY,
    taktLabel:
      state.taktMinutes === null ? null : 'Takt ' + formatMinutes(state.taktMinutes),
    legend: usedLegendEntries(state),
  };
}

// Draws one chart frame into an already-scaled context. Paint only.
export function drawFrame(
  ctx: Canvas2D,
  frame: ChartFrame,
  background: string | null = '#FFFFFF',
): void {
  const { plot } = frame;
  const plotBottom = plot.y + plot.h;

  if (background !== null) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, frame.viewport.width, frame.viewport.height);
  }

  // Axis ticks: gridlines and labels in plain minutes.
  ctx.font = FONT_SMALL;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of frame.axisTicks) {
    ctx.strokeStyle = t.minutes === 0 ? COLOR_BASELINE : COLOR_GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, t.y);
    ctx.lineTo(plot.x + plot.w, t.y);
    ctx.stroke();
    ctx.fillStyle = COLOR_MUTED;
    ctx.fillText(t.label, plot.x - 10, t.y);
  }

  // Blocks, bottom-anchored rects straight from layout().
  for (const b of frame.blocks) {
    const alpha = b.alpha ?? 1;
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = b.fill;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = BLOCK_STROKE;
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, Math.max(0, b.w - 1), Math.max(0, b.h - 1));
    if (b.labelFits) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x + 3, b.y, Math.max(0, b.w - 6), b.h);
      ctx.clip();
      ctx.font = FONT_SMALL;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = textColorFor(b.fill);
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
      ctx.restore();
      ctx.textAlign = 'right';
    }
    ctx.globalAlpha = 1;
  }

  // Dotted takt line spanning the plot, labeled at the right edge (SPEC 7).
  if (frame.taktY !== null && frame.taktY >= plot.y && frame.taktY <= plotBottom) {
    ctx.strokeStyle = COLOR_TAKT;
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, frame.taktY);
    ctx.lineTo(plot.x + plot.w, frame.taktY);
    ctx.stroke();
    ctx.setLineDash([]);
    if (frame.taktLabel !== null) {
      ctx.font = '600 ' + FONT_SMALL;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLOR_TAKT;
      ctx.fillText(frame.taktLabel, plot.x + plot.w + 8, frame.taktY);
    }
  }

  // Bay names in the top band, totals just above each stack.
  for (const h of frame.bayHeaders) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(h.x, 0, h.w, frame.viewport.height);
    ctx.clip();
    ctx.font = FONT_BAY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOR_TEXT;
    ctx.fillText(h.bay, h.x + h.w / 2, 8);
    const totalY = Math.min(Math.max(h.topY - 20, plot.y - 20), plotBottom - 20);
    ctx.font = FONT_SMALL;
    ctx.fillStyle = COLOR_MUTED;
    ctx.fillText(formatMinutes(h.totalMinutes), h.x + h.w / 2, totalY + 2);
    ctx.restore();
  }
}

// --- Legend band --------------------------------------------------------

interface LegendItemPos {
  x: number;
  y: number;
  entry: LegendEntry;
}

const LEGEND_ROW_H = 22;
const LEGEND_SWATCH = 12;
const LEGEND_PAD = 12;

function layoutLegend(
  ctx: Canvas2D,
  entries: LegendEntry[],
  maxWidth: number,
): { items: LegendItemPos[]; height: number } {
  if (entries.length === 0) return { items: [], height: 0 };
  ctx.font = FONT_SMALL;
  const items: LegendItemPos[] = [];
  let x = 0;
  let row = 0;
  for (const entry of entries) {
    const w = LEGEND_SWATCH + 6 + ctx.measureText(entry.name).width + 20;
    if (x > 0 && x + w > maxWidth) {
      x = 0;
      row++;
    }
    items.push({ x, y: row * LEGEND_ROW_H, entry });
    x += w;
  }
  return { items, height: (row + 1) * LEGEND_ROW_H + LEGEND_PAD };
}

export function drawLegend(
  ctx: Canvas2D,
  entries: LegendEntry[],
  x: number,
  y: number,
  maxWidth: number,
): number {
  const { items, height } = layoutLegend(ctx, entries, maxWidth);
  ctx.font = FONT_SMALL;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const item of items) {
    const cy = y + item.y + LEGEND_ROW_H / 2;
    ctx.fillStyle = item.entry.color;
    ctx.fillRect(x + item.x, cy - LEGEND_SWATCH / 2, LEGEND_SWATCH, LEGEND_SWATCH);
    ctx.strokeStyle = BLOCK_STROKE;
    ctx.lineWidth = 1;
    ctx.strokeRect(
      x + item.x + 0.5,
      cy - LEGEND_SWATCH / 2 + 0.5,
      LEGEND_SWATCH - 1,
      LEGEND_SWATCH - 1,
    );
    ctx.fillStyle = COLOR_TEXT;
    ctx.fillText(item.entry.name, x + item.x + LEGEND_SWATCH + 6, cy);
  }
  return height;
}

export function measureLegendHeight(
  ctx: Canvas2D,
  entries: LegendEntry[],
  maxWidth: number,
): number {
  return layoutLegend(ctx, entries, maxWidth).height;
}

// --- Parking band (for the Include parking lot export option) -----------

interface ChipPos {
  x: number;
  y: number;
  w: number;
  label: string;
}

const CHIP_H = 28;
const CHIP_GAP = 8;
const PARKING_HEADER_H = 24;

function layoutParking(
  ctx: Canvas2D,
  state: ChartState,
  maxWidth: number,
): { header: string; chips: ChipPos[]; height: number } {
  const items = state.blocks.filter((b) => b.bay === PARKING);
  if (items.length === 0) return { header: '', chips: [], height: 0 };
  const total = items.reduce((sum, b) => sum + b.minutes, 0);
  const header =
    'Parking Lot (' +
    items.length +
    (items.length === 1 ? ' item, ' : ' items, ') +
    formatMinutes(total) +
    ' min)';
  ctx.font = FONT_SMALL;
  const chips: ChipPos[] = [];
  let x = 0;
  let row = 0;
  for (const b of items) {
    const label = b.process + ' - ' + formatMinutes(b.minutes) + ' min';
    const w = ctx.measureText(label).width + 24;
    if (x > 0 && x + w > maxWidth) {
      x = 0;
      row++;
    }
    chips.push({ x, y: PARKING_HEADER_H + row * (CHIP_H + CHIP_GAP), w, label });
    x += w + CHIP_GAP;
  }
  const height = PARKING_HEADER_H + (row + 1) * (CHIP_H + CHIP_GAP) + 4;
  return { header, chips, height };
}

export function drawParking(
  ctx: Canvas2D,
  state: ChartState,
  x: number,
  y: number,
  maxWidth: number,
): number {
  const { header, chips, height } = layoutParking(ctx, state, maxWidth);
  if (chips.length === 0) return 0;
  ctx.font = 'italic ' + FONT_SMALL;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR_MUTED;
  ctx.fillText(header, x, y + PARKING_HEADER_H / 2);
  ctx.font = FONT_SMALL;
  for (const chip of chips) {
    const cx = x + chip.x;
    const cy = y + chip.y;
    ctx.fillStyle = '#ECEFF1';
    ctx.fillRect(cx, cy, chip.w, CHIP_H);
    ctx.strokeStyle = COLOR_BASELINE;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(cx + 0.5, cy + 0.5, chip.w - 1, CHIP_H - 1);
    ctx.setLineDash([]);
    ctx.fillStyle = COLOR_TAKT;
    ctx.fillText(chip.label, cx + 12, cy + CHIP_H / 2);
  }
  return height;
}

export function measureParkingHeight(
  ctx: Canvas2D,
  state: ChartState,
  maxWidth: number,
): number {
  return layoutParking(ctx, state, maxWidth).height;
}

// --- Still export rendering (PNG / PDF share this path) ------------------

export interface StillOptions {
  pixelRatio: number;
  includeParking: boolean;
}

export interface StillSize {
  width: number; // logical px
  height: number; // logical px
}

// Sizes the canvas to viewport height plus legend and optional parking
// bands, scales by pixelRatio, and draws everything. Returns logical size.
export function renderStill(
  canvas: AnyCanvas,
  state: ChartState,
  viewport: { width: number; height: number },
  opts: StillOptions,
): StillSize {
  const ctx = canvas.getContext('2d') as Canvas2D | null;
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const bandWidth = viewport.width - 24;
  const frame = frameFromState(state, viewport);
  const legendHeight = measureLegendHeight(ctx, frame.legend, bandWidth);
  const parkingHeight = opts.includeParking
    ? measureParkingHeight(ctx, state, bandWidth)
    : 0;
  const height = viewport.height + legendHeight + parkingHeight;

  canvas.width = Math.round(viewport.width * opts.pixelRatio);
  canvas.height = Math.round(height * opts.pixelRatio);
  ctx.setTransform(opts.pixelRatio, 0, 0, opts.pixelRatio, 0, 0);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, viewport.width, height);
  drawFrame(ctx, frame, null);
  let y = viewport.height;
  y += drawLegend(ctx, frame.legend, 12, y, bandWidth);
  if (opts.includeParking) {
    drawParking(ctx, state, 12, y, bandWidth);
  }
  return { width: viewport.width, height };
}
