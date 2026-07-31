# Yamazumi Chart Tool - Specification

This file is the single source of truth for this project. Every build session reads
this file in full before writing code. If an instruction in a prompt conflicts with
this file, ask before proceeding.

---

## 1. What this is

A browser-based yamazumi chart editor. A yamazumi chart is a stacked bar chart used
in lean manufacturing: each column is a workstation (a "bay"), each stacked block is
a process step, and block height is proportional to the time that step takes. The
chart is used to see how work is balanced across stations relative to takt time.

The tool is a **visual editor for a CSV file**. It has no backend, no accounts, no
database, and no file history. The user opens a CSV, rearranges it visually, and
exports a CSV.

**Overriding design priority: simple and intuitive enough that someone who has never
seen the tool can look at it and understand how it works.** When a decision is close,
pick the simpler option.

---

## 2. Deployment

- Standalone GitHub repository.
- Vite + React + TypeScript.
- Deployed to Cloudflare Pages, served at `jordanprunty.com/yamazumi` via a
  Cloudflare Worker reverse proxy.
- **`base: '/yamazumi/'` must be set in `vite.config.ts` from the first commit.**
- React Router with `basename="/yamazumi"`.
- Routes:
  - `/` - the editor
  - `/animate` - the transition animator (lazy-loaded, see section 12)

The `/animate` route is lazy-loaded so its video dependencies never enter the
editor's bundle.

---

## 3. Data model

```ts
export const PARKING = 'Parking Lot';

export interface Block {
  id: string;              // stable, unique within a chart
  bay: string;             // a name from ChartState.bays, or PARKING
  process: string;
  minutes: number;         // > 0, decimals allowed
  category: string | null; // null = uncategorized
}

export interface Category {
  name: string;
  color: string;           // hex, e.g. '#2E7D32'
}

export interface ChartState {
  bays: string[];              // ordered left to right. Does NOT include PARKING.
  blocks: Block[];             // see ordering rule below
  categories: Category[];      // order defines legend order
  taktMinutes: number | null;
  axisMaxMinutes: number;
  axisIntervalMinutes: number; // default 30
}
```

**Ordering rule:** within a given `bay`, the order of blocks in the `blocks` array is
the bottom-to-top sequence in that column. Index 0 in a bay is the block sitting on
the baseline at time 0. This ordering is the only source of truth for sequence.
There is no separate order field anywhere, including in the CSV.

**Parking lot:** blocks with `bay === PARKING`. It is not a bay. It never appears in
`ChartState.bays`, never gets a column, and is excluded from all time and takt math.

---

## 4. CSV format

This is the file format. It is durable. Getting it right matters more than anything
else in the project, because changing it later invalidates every file a user saved.

### 4.1 Example

```
# Yamazumi chart
takt_minutes,60
axis_max_minutes,120
axis_interval,30
bays,Bay 1,Bay 2,Bay 3,Bay 4
category,Value-Add,#2E7D32
category,Non-Value-Add,#F9A825
category,Waste,#C62828

id,bay,process,minutes,category
b01,Bay 1,Weld frame,45,Value-Add
b02,Bay 1,Install harness,30,Non-Value-Add
b03,Bay 2,Torque fasteners,20,Value-Add
b04,Parking Lot,Paint touchup,15,
```

### 4.2 Structure

Two sections. A settings section, then a data table.

**Section boundary rule:** the data table begins at the first row whose first cell is
`id` (case-insensitive, trimmed). Everything before that row is settings. Do not rely
on blank lines to find the boundary, because users add and delete blank rows in Excel.

Rows whose first cell begins with `#` are comments and are ignored on parse. Write one
`# Yamazumi chart` comment on the first line of every export.

**Settings keys:**

| Key | Value | Notes |
|---|---|---|
| `takt_minutes` | number or blank | blank means no takt line |
| `axis_max_minutes` | number | top of the y axis |
| `axis_interval` | number | tick spacing, default 30 |
| `bays` | one bay name per remaining cell | ordered left to right; makes empty bays representable |
| `category` | name, then hex color | repeatable, one row per category, order defines legend order |

Unknown settings keys are ignored on parse and dropped on export.

**Data table columns:** `id,bay,process,minutes,category` in that order.

### 4.3 Parse rules

- Use a real CSV library (Papaparse) in both directions. Never `split(',')`.
  Process names will contain commas.
- Row order within the file defines sequence within a bay.
- Blank `id`: generate one. This lets a user hand-add a row in Excel.
- Duplicate `id`: keep the first, regenerate for the rest, warn.
- `bay` not in the `bays` setting and not `Parking Lot`: append it to `bays`.
- `category` not in the settings: add it with the next unused palette color.
- Blank `category`: `null`.
- `minutes` not a positive number: **reject the file** with an error naming the row
  number and the offending value. Do not silently coerce. Do not accept `1:30`
  time-formatted values, because Excel converts those to serial numbers and the
  round trip corrupts.
- Missing `axis_max_minutes`: compute it per section 6.

### 4.4 Export rules

- **Write UTF-8 with a BOM.** Without it, Excel on Windows mangles non-ASCII
  characters in process names. This is not optional.
- Line endings `\r\n`.
- Default filename `yamazumi.csv`.
- Export must be byte-stable: exporting the same state twice produces identical bytes.

---

## 5. The layout function (core architecture)

There is exactly one implementation of the chart's geometry, and it is a pure
function. Two thin paint layers consume it: a DOM renderer for the interactive
editor, and a Canvas 2D renderer for PNG, PDF, and video frames.

This is what guarantees that an exported image and an exported video are pixel-
identical to what is on screen. Do not duplicate geometry logic in the renderers.

```ts
export interface LayoutRect {
  id: string;
  x: number; y: number; w: number; h: number;  // screen coords, top-left origin
  fill: string;
  label: string;
  minutes: number;
  labelFits: boolean;   // false when h is too small to draw the label
}

export interface LayoutResult {
  pxPerMinute: number;
  plot: { x: number; y: number; w: number; h: number };
  blocks: LayoutRect[];
  bayHeaders: { bay: string; x: number; w: number; totalMinutes: number; topY: number }[];
  axisTicks: { y: number; minutes: number; label: string }[];
  taktY: number | null;
  overflowBays: string[];   // bays whose total exceeds axisMaxMinutes
}

export function layout(
  state: ChartState,
  viewport: { width: number; height: number }
): LayoutResult;
```

Rules:

- **Pure.** No DOM, no React, no canvas, no `window`. Fully unit-testable.
- `pxPerMinute = plot.h / state.axisMaxMinutes`
- Blocks are bottom-anchored: a block's `y` is computed from the bottom of the plot
  minus the cumulative minutes below it, minus its own height.
- Height is **exactly** `minutes * pxPerMinute`. There is no minimum height. Do not
  clamp. Proportionality is the point of the chart.
- `labelFits` is false when `h` is under the label line height. Renderers use this to
  skip the label; the DOM renderer shows a tooltip on hover instead.
- Parking lot blocks are **not** in `blocks`. The parking lot is not proportional and
  is laid out separately by its own component.
- `bayHeaders[].topY` is the y of the top of the tallest stack in that bay, so the
  total can be drawn just above it.

---

## 6. The axis and scale

The scale must never change as a side effect of editing. Blocks resizing while the
user works is explicitly unwanted.

- `axisMaxMinutes` is a normal editable number field in the top bar.
- It is recomputed **only** in these three cases: on file load, when takt is entered
  for the first time on an empty chart, and when the user clicks **Fit**.
- The default computation is:
  `roundUpToMultiple(max(tallestBayTotal, taktMinutes ?? 0) * 1.15, axisIntervalMinutes)`
  with a floor of `axisIntervalMinutes * 2`.
- Ticks every `axisIntervalMinutes`, labeled in plain minutes. Do not format as h:mm.
- If a bay total exceeds `axisMaxMinutes`, do not clip silently. Draw a small chevron
  marker at the top of that column showing the overflow amount, clickable to run Fit.
  List the bay in `LayoutResult.overflowBays`.

---

## 7. Screen layout

```
+--------------------------------------------------------------------+
| New  Open  Export v  |  Undo Redo  |  Takt [ 60 ]  Axis [ 120 ] Fit |  Present |
+--------------------------------------------------------------------+
|      |  Bay 1     |  Bay 2     |  Bay 3     |  Bay 4     |  + Bay   |
| 120 -|            |            |            |            |          |
|      |   [95]     |    [80]    |            |    [60]    |          |
|  90 -|  +-----+   |   +-----+  |            |            |          |
|      |  |     |   |   |     |  |   [40]     |   +-----+  |          |
|  60 -|- - - - - - - - - - - - - - - - - - - - - - - - - -| takt     |
|      |  +-----+   |   +-----+  |   +-----+  |   |     |  |          |
|  30 -|  |     |   |   |     |  |   |     |  |   +-----+  |          |
|      |  +-----+   |   +-----+  |   +-----+  |            |          |
|   0 -+------------+------------+------------+------------+          |
+--------------------------------------------------------------------+
| Value-Add [] Non-Value-Add [] Waste []                              |
+--------------------------------------------------------------------+
| Parking Lot (2 items, 35 min)                              [v]      |
| ( Paint touchup - 15 min )  ( Deburr - 20 min )                     |
+--------------------------------------------------------------------+
```

- Time axis on the far left, 0 at the bottom.
- Bay columns take the majority of the screen. Default 4 bays named `Bay 1` ... `Bay 4`.
- Each column header shows the bay name (click to rename inline) and a `+` button.
- Each column shows its total minutes just above its topmost block. An empty bay
  shows `0` at the baseline.
- The takt line is a dotted horizontal line spanning the full plot width, labeled
  at the right edge.
- **Blocks and columns exceeding takt are NOT highlighted.** Column height versus the
  dotted line is the message. Highlighting adds noise. This is deliberate.
- Legend strip below the chart. Renders only when at least one block has a category.
- Parking lot tray docked at the bottom, collapsible.

---

## 8. Parking lot

A place for process blocks that should not be deleted but do not have a home yet.

- Docked horizontal tray at the bottom of the screen, full width, collapsible.
- **Blocks in the tray are NOT time-proportional.** They render as fixed-height chips
  around 32px tall reading `Paint touchup - 15 min`, wrapping or scrolling
  horizontally. Dashed border, muted fill. Visually a different language from the
  chart, so it never reads as a fifth bay.
- Header reads `Parking Lot (2 items, 35 min)`, styled distinctly from bay totals.
- Excluded from takt comparison, from axis fitting, and from all balance math.
- Full drag and drop to and from bay columns.
- Collapses to a single bar when empty.

---

## 9. Interaction

### 9.1 Adding blocks

- The `+` in a **column header** adds a block to the **top** of that column. Top means
  latest in sequence, since 0 is at the bottom.
- The global **Add** button in the top bar adds to the **parking lot**.

There is no auto-placement heuristic. Do not guess which column a block belongs in.

### 9.2 Modals

- **Every modal has an X in its top right corner.** No exceptions.
- Esc closes. Clicking the backdrop closes. Unsaved edits prompt before discarding.
- Add / Edit Block modal has exactly three fields:
  1. `Process name` - text
  2. `Time (minutes)` - number
  3. `Category` - combobox: filter the list, pick an option, or type a new name and
     press Enter to create it
- The Edit modal additionally has a Delete button.
- **No color picker.** New categories get the next color from the palette
  automatically. Users who care about colors edit the hex in the CSV.

### 9.3 Drag and drop

This is a critical feature. Use `@dnd-kit/core` and `@dnd-kit/sortable`.
Do not use `react-beautiful-dnd` (unmaintained).

- Drag within a column to reorder.
- Drag between columns.
- Drag to and from the parking lot.
- **Neighbor blocks reflow live as you drag over them**, the way iOS homescreen icons
  shift to show where an app will land. The drop position must be visible before you
  release.

**Coordinate system warning, read this carefully.** Columns are bottom-anchored:
array index 0 renders at the bottom. dnd-kit reasons in DOM order. Render each column
with `flex-direction: column-reverse` so that DOM order matches array order and index
0 sits at the bottom. Verify with a test that dragging a block from index 0 to index 2
produces the expected array, not the reverse. **This mismatch is the single most likely
source of off-by-one drop bugs in this project.** Do not skip verifying it.

The scale must not change during a drag.

### 9.4 Undo

- Snapshot-based. Push a full `ChartState` copy onto a stack, capped at 50 entries.
- `Ctrl+Z` undo, `Ctrl+Shift+Z` redo, plus toolbar buttons.
- Covers add, edit, delete, drag, bay add / remove / rename, category creation, and
  takt / axis field changes.

### 9.5 Bays

- Add Bay button appends a new bay named `Bay N`.
- Click a bay header to rename inline.
- **Deleting a bay moves its blocks to the parking lot. It never destroys them.**
  This is what makes bay removal safe.
- Minimum one bay.

---

## 10. Categories and palette

- Category is **optional**. Blank means neutral gray `#9E9E9E` and no legend entry.
  A first-time user never has to think about categories.
- A new chart seeds these three: `Value-Add #2E7D32`, `Non-Value-Add #F9A825`,
  `Waste #C62828`.
- Custom categories are created by typing in the combobox and get the next unused
  palette color.
- Palette, in assignment order. Lightness deliberately alternates so the chart stays
  readable when printed or photocopied in grayscale:

```
#2E7D32  #F9A825  #C62828  #4FC3F7  #6A1B9A  #AED581  #00838F  #FFAB91
```

  After the list is exhausted, cycle with a lightness shift.
- Legend shows only categories currently in use, in `ChartState.categories` order.

---

## 11. Crash protection

There is no persistence and no file history. An accidental refresh must not lose work.

- Autosave `ChartState` to **`sessionStorage`** under the key `yamazumi:draft`,
  debounced 500ms. sessionStorage dies with the tab, so nothing is stored long term.
- Serialize the **same object shape the CSV parser produces**. There is one state
  schema in this app and only one.
- On load, if a draft exists, show a non-blocking banner: `Recovered unsaved work.`
  with `Keep` and `Discard` actions.
- `beforeunload` guard whenever the state is dirty.
- Cleared by `Discard` and by `New`. A successful CSV export marks the state clean but
  leaves the draft in place.

---

## 12. Exports

### 12.1 Canvas renderer

A Canvas 2D renderer consumes `LayoutResult` and draws blocks, labels, the axis, the
dotted takt line, bay headers, totals, and the legend. It is the single code path
behind PNG, PDF, and video frames.

**The presentation frame.** There is one canonical composition, `PRESENT_FRAME`
(1920x1080, 16:9), and every picture of the chart is that frame: presentation mode
renders it and scales it to fit the window, a PNG rasterizes it at 3x, and every video
frame is it at the chosen resolution. The chart takes the frame minus the legend band,
exactly as the on-screen flex column splits them.

Consequences, all deliberate:

- Type sizes in the canvas renderer are the `.presenting` sizes from `index.css`, not
  the editor's. Change one, change the other.
- An export is never sized from the editor window. Two people on different monitors
  export the same image.
- Resolution changes pixel density, not composition. 1080p and 2160p clips are the
  same picture; absolute type on a growing canvas would not be.

Do **not** use `html-to-image`, `html2canvas`, or any DOM rasterization. The chart is
rectangles, text, and dashed lines. Draw it directly. This is faster by two orders of
magnitude and avoids font-embedding failures.

### 12.2 PNG and PDF

- PNG rendered at 3x pixel ratio: 5760x3240 for the 1920x1080 frame.
- PDF via `jsPDF` wrapping that same image.
- Exports include the axis, bay headers, totals, takt line, and legend.
- Exports **exclude** the top bar and the parking lot by default. Provide an
  `Include parking lot` checkbox. The parking band is appended **below** the frame:
  presentation mode unmounts the tray, so it can never be part of the picture, and
  ticking the box must not steal height from the chart.

### 12.3 Presentation mode

A toggle that hides the top bar, the parking lot, and all chrome, leaving a full-bleed
chart with larger type. Esc exits.

Purpose: clean manual screen capture (Win+Shift+S) for slides. It is not a live
presenter mode and needs no speaker controls.

It renders `PRESENT_FRAME` at its fixed layout size and scales it to fit the window
with a transform, letterboxed in the page background. It does **not** lay itself out to
fit the window: a fluid stage is what makes a capture and an export disagree, because
the canvas renderer's margins and type are absolute. Rendering the frame itself makes
the capture, the PNG, and every MP4 frame the same picture at any window size, browser
zoom, or Windows display scaling.

---

## 13. The `/animate` route

A lazy-loaded route that takes a **before** CSV and an **after** CSV and produces a
morph animation as an MP4, for embedding on a PowerPoint slide.

### 13.1 UI

- Two drop zones: `Before` and `After`.
- Controls: duration (default 2500ms), easing (default easeInOutCubic), fps (30 or 60),
  resolution (1920x1080 or 3840x2160). Resolution is output pixel density only; the
  clip is composed at `PRESENT_FRAME` either way (section 12.1).
- Preview player with a scrubber, showing the frame at half size.
- Before export, show a matching summary: `12 blocks moved, 3 added, 1 removed`. This
  is how the user catches a bad match before it ends up in a deck.
- `Export MP4` button.

### 13.2 Matching and interpolation

- Blocks are matched by `id`. This is why the CSV has an id column.
- Run `layout()` on both states with the same viewport to get start and end rects,
  then lerp `x`, `y`, `w`, `h`, and fill color per frame.
- Matched in both: tween.
- In `after` only: fade and scale in.
- In `before` only: fade and scale out.
- Axis settings come from the **after** file, so the frame is stable.
- **The takt line is a lerp between the two files' takt values.** This is a no-op when
  they match. Implement it anyway.
- Categories and colors come from the **after** file. Warn if the two files disagree.

### 13.3 Encoding

Render frames **offline**, not in real time. There is no capture and no playback
timing constraint, so no frames can drop.

Pipeline: draw frame to canvas with the Canvas 2D renderer -> `VideoEncoder` ->
mux to MP4. Frames are drawn on the app's own page background, like every other
picture of the chart; a clip on a white page reads as a different product.

- Use the **WebCodecs** `VideoEncoder` with an H.264 codec string (`avc1.*`).
  Supported in Chrome 94+, Edge 94+, Firefox 130+, Safari 26+.
- Mux with **Mediabunny** (`npm i mediabunny`). Zero dependencies, tree-shakable,
  has a canvas source that accepts frames directly.
- **Do not use `mp4-muxer`.** It is deprecated in favor of Mediabunny and unmaintained.
  Training data may suggest it. Ignore that.
- **Do not use `ffmpeg.wasm`.** It is unnecessary here and would require COOP/COEP
  headers for SharedArrayBuffer, which is real infrastructure cost behind the Worker
  proxy.
- Feature-detect with `VideoEncoder.isConfigSupported()`. If unsupported, disable the
  export button and explain why rather than failing at click time.

Expected performance for a 2.5s 1080p60 clip (150 frames): a few seconds end to end.

---

## 14. Testing

Use Vitest.

Required:

- **CSV round trip.** Generate a random `ChartState`, serialize, parse, deep-equal the
  result. Run it over many random states.
- **CSV fixtures.** At least: commas in process names, non-ASCII names, blank
  category, blank id, an empty bay, a bay named with trailing whitespace, and a file
  with rows reordered by hand.
- **CSV rejection.** Non-numeric minutes, negative minutes, zero minutes.
- **`layout()` math.** Proportionality (a 2x block is 2x tall), bottom anchoring
  (index 0 touches the baseline), cumulative stacking, axis tick positions, takt
  line position, `overflowBays` detection.
- **Totals.** Bay totals match the sum of their blocks. Parking lot is excluded.
- **Axis default.** The fit computation with and without takt, and the floor case.
- **Drag index math.** Reordering with `column-reverse` produces the expected array.
- **Byte stability.** Exporting the same state twice gives identical output.

---

## 15. Explicit non-goals

Do not build these. If one seems necessary, ask first.

- No backend, no accounts, no database.
- No persistence beyond the sessionStorage crash draft.
- No file history, no versioning, no autosave to disk.
- No highlighting of blocks or columns that exceed takt.
- No color picker UI.
- No GIF export.
- No `ffmpeg.wasm`.
- No DOM rasterization libraries.
- No analytics, no telemetry, no third-party trackers.

---

## 16. Code style

- TypeScript, strict mode.
- **ASCII only in code, comments, and console output.** Use `->`, `[OK]`, `[X]`, `[!]`.
  No Unicode arrows, checkmarks, or emoji.
- Prefer plain CSS or CSS modules. Do not add a component library.
- Keep the geometry in `layout()`. Renderers only paint.
