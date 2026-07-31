import { COLUMN_PADDING, PRESENT_FRAME, layout } from '../model/layout';
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
//
// "What is on screen" means PRESENTATION mode, not the windowed editor: this
// renderer only ever produces pictures for a slide, and presentation mode is
// what the chart looks like when it goes on one. So the type sizes below are
// the `.presenting` rules, and every caller composes at PRESENT_FRAME.

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
// Each of these is one `.presenting` rule in index.css.
const FONT_TICK = '600 15px ' + FAMILY; /* .presenting .tick-label */
const FONT_BAY = '700 26px ' + FAMILY; /* .presenting .bay-name-static */
const FONT_TOTAL = '800 21px ' + FAMILY; /* .presenting .bay-total */
const FONT_TAKT = '700 14px ' + FAMILY; /* .presenting .takt-label */
const FONT_LEGEND = '600 17px ' + FAMILY; /* .presenting .legend-item */
const FONT_CHIP = '600 15px ' + FAMILY; /* export-only parking band */
// .presenting .block-label multiplies the height-derived size by this.
const BLOCK_TYPE_SCALE = 1.3;

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

// The page surface behind every picture of the chart. Exported so the video
// path paints the same background as a still (it is the app's own background:
// a frame on a white page would read as a different product).
export const PAGE_BACKGROUND = COLOR_BG;

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

// The alphabetic baseline for text the DOM positions by the top of its line
// box (a `top:` on an absolutely positioned label). Canvas's own 'top'
// baseline is the font's ascent line, which sits a few px above where the DOM
// puts the same glyphs; at 26px that is a visible shift between a screen
// capture and an export. These elements all use line-height: normal, so the
// DOM's baseline is exactly the line box top plus the font ascent.
function baselineForDomTop(ctx: Canvas2D, top: number, fontSize: number): number {
  const ascent = ctx.measureText('M').fontBoundingBoxAscent;
  return top + (Number.isFinite(ascent) ? ascent : fontSize * 0.92);
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
  ctx.textBaseline = 'alphabetic';
  // .tick-label sits at `top: t.y - 8` (SPEC 5: Chart.tsx).
  const tickBaseline = baselineForDomTop(ctx, -8, 15);
  for (const t of frame.axisTicks) {
    ctx.strokeStyle = t.minutes === 0 ? COLOR_BORDER : COLOR_GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, t.y);
    ctx.lineTo(plot.x + plot.w, t.y);
    ctx.stroke();
    ctx.fillStyle = COLOR_MUTED;
    ctx.fillText(t.label, plot.x - 10, t.y + tickBaseline);
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
      ctx.font = '700 ' + blockFontSize(b.h) * BLOCK_TYPE_SCALE + 'px ' + FAMILY;
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
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COLOR_TEXT;
    // .bay-header sits at `top: 8`, .bay-total at `top: totalY` (Chart.tsx).
    ctx.fillText(h.bay, h.x + h.w / 2, baselineForDomTop(ctx, 8, 26));
    const totalY = Math.min(Math.max(h.topY - 22, plot.y - 18), plotBottom - 22);
    ctx.font = FONT_TOTAL;
    ctx.fillText(
      formatMinutes(h.totalMinutes),
      h.x + h.w / 2,
      baselineForDomTop(ctx, totalY, 21),
    );
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

// The .legend strip: one flex row of items, wrapping, centered marks. These
// mirror `.legend` / `.legend-item` at the presentation type scale, because the
// band's height decides how much of PRESENT_FRAME is left for the chart -- get
// it wrong and the export's plot is a different height than the screen's.
const LEGEND_ROW_H = 22; /* .legend-item line box at 17px */
const LEGEND_ROW_GAP = 16; /* .legend gap (--bt-space-6) between wrapped rows */
const LEGEND_PAD_Y = 12; /* .presenting .legend block padding (--bt-space-5) */
const LEGEND_ITEM_GAP = 16; /* .legend gap (--bt-space-6) between items */
const LEGEND_MARK_GAP = 7; /* .legend-item gap */
const LEGEND_SWATCH = 13; /* .legend-swatch */
const LEGEND_RULE = 22; /* .legend-takt */

// Horizontal inset of the legend and parking bands: the .presenting .legend
// inline padding (--bt-space-9).
export const BAND_INSET = 28;

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
    const mark = entry.dashed === true ? LEGEND_RULE : LEGEND_SWATCH;
    const w = mark + LEGEND_MARK_GAP + ctx.measureText(entry.name).width + LEGEND_ITEM_GAP;
    if (x > 0 && x + w > maxWidth) {
      x = 0;
      row++;
    }
    items.push({ x, y: row * (LEGEND_ROW_H + LEGEND_ROW_GAP), entry });
    x += w;
  }
  const rows = row + 1;
  return {
    items,
    height: rows * LEGEND_ROW_H + (rows - 1) * LEGEND_ROW_GAP + LEGEND_PAD_Y * 2,
  };
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
    const cy = y + LEGEND_PAD_Y + item.y + LEGEND_ROW_H / 2;
    let mark: number;
    if (item.entry.dashed === true) {
      mark = LEGEND_RULE;
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
    ctx.fillText(item.entry.name, x + item.x + mark + LEGEND_MARK_GAP, cy);
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

const CHIP_H = 34;
const CHIP_GAP = 8;
const PARKING_HEADER_H = 28;
const FONT_PARKING_HEADER = '700 14px ' + FAMILY;

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
  ctx.font = FONT_PARKING_HEADER;
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
  frame?: { width: number; height: number }; // defaults to PRESENT_FRAME
}

export interface StillSize {
  width: number; // logical px
  height: number; // logical px
}

// Splits a frame into the chart viewport and the legend band below it, the way
// the .editor flex column splits presentation mode: the legend is `flex: none`
// and takes what it needs, the chart takes the rest. Shared with the video
// path so a still and a frame of the clip divide the picture identically.
export function splitFrame(
  ctx: Canvas2D,
  state: ChartState,
  frame: { width: number; height: number },
): { chartViewport: { width: number; height: number }; legendHeight: number } {
  const legendHeight = measureLegendHeight(
    ctx,
    legendEntriesFor(state),
    frame.width - BAND_INSET * 2,
  );
  return {
    chartViewport: { width: frame.width, height: frame.height - legendHeight },
    legendHeight,
  };
}

// Draws the presentation frame at `pixelRatio` output pixels per logical px.
// The picture is exactly the frame -- chart plus legend band, 16:9 -- so a PNG
// is a capture of presentation mode rather than a copy of whatever shape the
// editor window happened to be. Returns logical size.
//
// The parking band is the one thing appended BELOW the frame: presentation mode
// unmounts the tray, so it can never appear in a capture, and SPEC 12.2 has it
// off unless the user asks. Ticking the box grows the image rather than
// stealing height from the chart.
export function renderStill(
  canvas: AnyCanvas,
  state: ChartState,
  opts: StillOptions,
): StillSize {
  const ctx = canvas.getContext('2d') as Canvas2D | null;
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const frame = opts.frame ?? PRESENT_FRAME;
  const bandWidth = frame.width - BAND_INSET * 2;
  const { chartViewport, legendHeight } = splitFrame(ctx, state, frame);
  const chart = frameFromState(state, chartViewport);
  const parkingHeight = opts.includeParking
    ? measureParkingHeight(ctx, state, bandWidth)
    : 0;
  const height = frame.height + parkingHeight;

  canvas.width = Math.round(frame.width * opts.pixelRatio);
  canvas.height = Math.round(height * opts.pixelRatio);
  ctx.setTransform(opts.pixelRatio, 0, 0, opts.pixelRatio, 0, 0);

  ctx.fillStyle = PAGE_BACKGROUND;
  ctx.fillRect(0, 0, frame.width, height);
  drawFrame(ctx, chart, null);
  if (legendHeight > 0) {
    drawLegend(ctx, chart.legend, BAND_INSET, chartViewport.height, bandWidth);
  }
  if (opts.includeParking) {
    drawParking(ctx, state, BAND_INSET, frame.height, bandWidth);
  }
  return { width: frame.width, height };
}
