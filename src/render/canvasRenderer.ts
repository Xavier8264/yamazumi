import { COLUMN_PADDING, layout } from '../model/layout';
import type { LayoutRect, LayoutResult } from '../model/layout';
import { PARKING } from '../model/types';
import type { ChartState } from '../model/types';
import { blockFontSize, formatMinutes, textColorFor } from '../components/format';

// SPEC 12.1: the Canvas 2D renderer. It consumes LayoutResult (via
// ChartFrame) and paints. It must not reimplement any geometry: every block,
// tick, header and takt position comes from layout(). It is the single code
// path behind PNG, PDF, and video frames. No DOM rasterization.
//
// Colors and type here mirror index.css exactly, because SPEC 5 requires an
// export to look like what is on screen. Change one, change the other.

export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface FrameRect extends LayoutRect {
  alpha?: number; // used by the animator for fade in/out; default 1
}

export interface LegendEntry {
  name: string;
  color: string;
  dashed?: boolean; // the takt entry draws a rule, not a swatch
}

export interface ChartFrame {
  viewport: { width: number; height: number };
  pxPerMinute: number; // only used to label an over-axis column
  plot: LayoutResult['plot'];
  blocks: FrameRect[];
  bayHeaders: LayoutResult['bayHeaders'];
  axisTicks: LayoutResult['axisTicks'];
  taktY: number | null;
  taktLabel: string | null;
  legend: LegendEntry[];
}

const FAMILY =
  '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
const FONT_TICK = '600 12px ' + FAMILY;
const FONT_BAY = '700 17px ' + FAMILY;
const FONT_TOTAL = '800 14px ' + FAMILY;
const FONT_TAKT = '700 12px ' + FAMILY;
const FONT_LEGEND = '600 13px ' + FAMILY;
const FONT_CHIP = '600 13px ' + FAMILY;

// Bay Tracker tokens. The two rgba() surfaces are pre-composited over the
// page background so the canvas needs no alpha bookkeeping for them.
const COLOR_BG = '#11161C'; /* --bt-bg */
const COLOR_GRID = '#1D2227'; /* rgba(255,255,255,.05) over --bt-bg */
const COLOR_COLUMN = '#161B21'; /* rgba(255,255,255,.02) over --bt-bg */
const COLOR_BORDER = '#33414F'; /* --bt-border */
const COLOR_MUTED = '#9FB0C0'; /* --bt-muted */
const COLOR_TEXT = '#F2F6FA'; /* --bt-text */
const COLOR_TAKT = '#E6A417'; /* --bt-warn */
const COLOR_CHIP = '#1B2027'; /* rgba(255,255,255,.04) over --bt-bg */
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

// What the legend strip actually shows: the categories in use plus the takt
// rule, matching src/components/Legend.tsx.
export function legendEntriesFor(state: ChartState): LegendEntry[] {
  const entries = usedLegendEntries(state);
  if (state.taktMinutes !== null) {
    entries.push({
      name: 'Takt ' + formatMinutes(state.taktMinutes) + ' min',
      color: COLOR_TAKT,
      dashed: true,
    });
  }
  return entries;
}

export function frameFromState(
  state: ChartState,
  viewport: { width: number; height: number },
): ChartFrame {
  const r = layout(state, viewport);
  return {
    viewport: { width: viewport.width, height: viewport.height },
    pxPerMinute: r.pxPerMinute,
    plot: r.plot,
    blocks: r.blocks,
    bayHeaders: r.bayHeaders,
    axisTicks: r.axisTicks,
    taktY: r.taktY,
    taktLabel:
      state.taktMinutes === null ? null : 'Takt ' + formatMinutes(state.taktMinutes),
    legend: legendEntriesFor(state),
  };
}

// Canvas has no text-overflow, so long process names are truncated the way
// the DOM ellipsizes them.
function fitText(ctx: Canvas2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 0 && ctx.measureText(out + '...').width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out.length > 0 ? out + '...' : '';
}

// Draws one chart frame into an already-scaled context. Paint only.
export function drawFrame(
  ctx: Canvas2D,
  frame: ChartFrame,
  background: string | null = COLOR_BG,
): void {
  const { plot } = frame;
  const plotBottom = plot.y + plot.h;

  if (background !== null) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, frame.viewport.width, frame.viewport.height);
  }

  // Axis ticks: gridlines and labels in plain minutes.
  ctx.font = FONT_TICK;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of frame.axisTicks) {
    ctx.strokeStyle = t.minutes === 0 ? COLOR_BORDER : COLOR_GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, t.y);
    ctx.lineTo(plot.x + plot.w, t.y);
    ctx.stroke();
    ctx.fillStyle = COLOR_MUTED;
    ctx.fillText(t.label, plot.x - 10, t.y);
  }

  // The faint column field, with the 2px rule the DOM draws at its foot.
  for (const h of frame.bayHeaders) {
    const x = h.x + COLUMN_PADDING;
    const w = Math.max(0, h.w - COLUMN_PADDING * 2);
    ctx.fillStyle = COLOR_COLUMN;
    ctx.fillRect(x, plot.y, w, plot.h);
    ctx.fillStyle = COLOR_BORDER;
    ctx.fillRect(x, plotBottom - 2, w, 2);
  }

  // Blocks, bottom-anchored rects straight from layout(). Clipped to the plot
  // so an overflowing column stops at the top edge, exactly as .bay-column's
  // overflow:hidden does on screen.
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y, plot.w, plot.h);
  ctx.clip();
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
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.clip();
      ctx.font = '700 ' + blockFontSize(b.h) + 'px ' + FAMILY;
      ctx.fillStyle = textColorFor(b.fill);
      ctx.textBaseline = 'middle';
      // Name left, minutes right: the same row the DOM renders.
      const minutes = formatMinutes(b.minutes);
      const minutesWidth = ctx.measureText(minutes).width;
      const cy = b.y + b.h / 2;
      ctx.textAlign = 'right';
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillText(minutes, b.x + b.w - 9, cy);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'left';
      ctx.fillText(
        fitText(ctx, b.label, b.w - 18 - minutesWidth - 8),
        b.x + 9,
        cy,
      );
      ctx.restore();
      ctx.textAlign = 'right';
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Bay names in the top band, totals just above each stack. SPEC 7: the
  // total is never recolored when a column exceeds takt.
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
    const totalY = Math.min(Math.max(h.topY - 22, plot.y - 18), plotBottom - 22);
    ctx.font = FONT_TOTAL;
    ctx.fillText(formatMinutes(h.totalMinutes), h.x + h.w / 2, totalY + 2);
    ctx.restore();
  }

  // SPEC 6: a column past the axis is clipped, but never silently -- the same
  // marker the editor shows, minus the click target.
  for (const h of frame.bayHeaders) {
    if (h.topY >= plot.y - 0.5 || frame.pxPerMinute <= 0) continue;
    const over = (plot.y - h.topY) / frame.pxPerMinute;
    const label = '^ +' + formatMinutes(over) + ' min';
    ctx.font = FONT_TAKT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width + 16;
    const cx = h.x + h.w / 2;
    const cy = plot.y + 14;
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(cx - w / 2, cy - 10, w, 20);
    ctx.strokeStyle = COLOR_TAKT;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - w / 2 + 0.5, cy - 9.5, w - 1, 19);
    ctx.fillStyle = COLOR_TAKT;
    ctx.fillText(label, cx, cy);
  }

  // Dashed takt line spanning the plot, labeled at the right edge (SPEC 7).
  // Drawn last so it reads across every column instead of only the gutters.
  if (frame.taktY !== null && frame.taktY >= plot.y && frame.taktY <= plotBottom) {
    ctx.strokeStyle = COLOR_TAKT;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(plot.x, frame.taktY);
    ctx.lineTo(plot.x + plot.w, frame.taktY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (frame.taktLabel !== null) {
      ctx.font = FONT_TAKT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLOR_TAKT;
      ctx.fillText(frame.taktLabel, plot.x + plot.w + 8, frame.taktY);
    }
  }
}

// --- Legend band --------------------------------------------------------

interface LegendItemPos {
  x: number;
  y: number;
  entry: LegendEntry;
}

const LEGEND_ROW_H = 22;
const LEGEND_SWATCH = 13;
const LEGEND_PAD = 12;

function layoutLegend(
  ctx: Canvas2D,
  entries: LegendEntry[],
  maxWidth: number,
): { items: LegendItemPos[]; height: number } {
  if (entries.length === 0) return { items: [], height: 0 };
  ctx.font = FONT_LEGEND;
  const items: LegendItemPos[] = [];
  let x = 0;
  let row = 0;
  for (const entry of entries) {
    const mark = entry.dashed === true ? 22 : LEGEND_SWATCH;
    const w = mark + 7 + ctx.measureText(entry.name).width + 16;
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
  ctx.font = FONT_LEGEND;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const item of items) {
    const cy = y + item.y + LEGEND_ROW_H / 2;
    let mark: number;
    if (item.entry.dashed === true) {
      mark = 22;
      ctx.strokeStyle = item.entry.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x + item.x, cy);
      ctx.lineTo(x + item.x + mark, cy);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      mark = LEGEND_SWATCH;
      ctx.fillStyle = item.entry.color;
      ctx.fillRect(x + item.x, cy - mark / 2, mark, mark);
    }
    ctx.fillStyle = COLOR_MUTED;
    ctx.fillText(item.entry.name, x + item.x + mark + 7, cy);
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

const CHIP_H = 32;
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
    'PARKING LOT (' +
    items.length +
    (items.length === 1 ? ' item, ' : ' items, ') +
    formatMinutes(total) +
    ' min)';
  ctx.font = FONT_CHIP;
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
  ctx.font = '700 12px ' + FAMILY;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR_MUTED;
  ctx.fillText(header, x, y + PARKING_HEADER_H / 2);
  ctx.font = FONT_CHIP;
  for (const chip of chips) {
    const cx = x + chip.x;
    const cy = y + chip.y;
    // Dashed and muted, never proportional: SPEC 8's separate language.
    ctx.fillStyle = COLOR_CHIP;
    ctx.fillRect(cx, cy, chip.w, CHIP_H);
    ctx.strokeStyle = COLOR_BORDER;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(cx + 0.5, cy + 0.5, chip.w - 1, CHIP_H - 1);
    ctx.setLineDash([]);
    ctx.fillStyle = COLOR_TEXT;
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

  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, viewport.width, height);
  drawFrame(ctx, frame, null);
  let y = viewport.height;
  y += drawLegend(ctx, frame.legend, 12, y, bandWidth);
  if (opts.includeParking) {
    drawParking(ctx, state, 12, y, bandWidth);
  }
  return { width: viewport.width, height };
}
