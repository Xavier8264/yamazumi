import Papa from 'papaparse';
import { PARKING } from './types';
import type { Block, Category, ChartState } from './types';
import { computeAxisMax } from './axis';
import { generateId } from './id';
import { nextUnusedColor } from './palette';

// SPEC section 4. This format is durable: files in the wild depend on it.

const BOM = '\uFEFF';
const COMMENT_LINE = '# Yamazumi chart';
const TABLE_HEADER = ['id', 'bay', 'process', 'minutes', 'category'];

export interface ParseSuccess {
  ok: true;
  state: ChartState;
  warnings: string[];
}

export interface ParseFailure {
  ok: false;
  error: string;
}

export type ParseResult = ParseSuccess | ParseFailure;

function isBlankRow(cells: string[]): boolean {
  return cells.every((c) => c.trim() === '');
}

function isCommentRow(cells: string[]): boolean {
  return (cells[0] ?? '').trim().startsWith('#');
}

function cell(cells: string[], i: number): string {
  return (cells[i] ?? '').trim();
}

const HEX_COLOR = /^#?[0-9a-fA-F]{6}$/;

function normalizeHex(raw: string): string {
  return raw.startsWith('#') ? raw : '#' + raw;
}

interface DataRow {
  rowNumber: number; // 1-based CSV record number in the file
  id: string;
  bay: string;
  process: string;
  minutes: number;
  category: string | null;
}

export function parseCsv(text: string): ParseResult {
  const raw = text.startsWith(BOM) ? text.slice(1) : text;
  const parsed = Papa.parse<string[]>(raw, { header: false, skipEmptyLines: false });
  const rows = parsed.data;

  const warnings: string[] = [];
  let taktMinutes: number | null = null;
  let axisMaxMinutes: number | undefined;
  let axisIntervalMinutes = 30;
  const bays: string[] = [];
  const categories: Category[] = [];

  const addBay = (name: string) => {
    if (name === '' || name === PARKING) return;
    if (bays.includes(name)) return;
    bays.push(name);
  };

  const addCategory = (name: string, color: string | null): void => {
    if (categories.some((c) => c.name === name)) return;
    const resolved =
      color !== null ? color : nextUnusedColor(categories.map((c) => c.color));
    categories.push({ name, color: resolved });
  };

  // --- Pass 1: split into settings and data rows -------------------------
  // The data table begins at the first row whose first cell is 'id'
  // (case-insensitive, trimmed). Blank lines are NOT the boundary.
  const dataRows: { rowNumber: number; cells: string[] }[] = [];
  let inData = false;

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
    const rowNumber = i + 1;
    if (isBlankRow(cells) || isCommentRow(cells)) continue;

    if (!inData) {
      const first = cell(cells, 0).toLowerCase();
      if (first === 'id') {
        inData = true; // header row of the data table; columns are fixed
        continue;
      }
      // Settings row. Unknown keys are ignored.
      switch (first) {
        case 'takt_minutes': {
          const v = cell(cells, 1);
          if (v === '') {
            taktMinutes = null;
          } else {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) {
              taktMinutes = n;
            } else {
              warnings.push(
                'Row ' + rowNumber + ': ignored invalid takt_minutes value "' + v + '"',
              );
            }
          }
          break;
        }
        case 'axis_max_minutes': {
          const v = cell(cells, 1);
          const n = Number(v);
          if (v !== '' && Number.isFinite(n) && n > 0) {
            axisMaxMinutes = n;
          } else if (v !== '') {
            warnings.push(
              'Row ' + rowNumber + ': ignored invalid axis_max_minutes value "' + v + '"',
            );
          }
          break;
        }
        case 'axis_interval': {
          const v = cell(cells, 1);
          const n = Number(v);
          if (v !== '' && Number.isFinite(n) && n > 0) {
            axisIntervalMinutes = n;
          } else if (v !== '') {
            warnings.push(
              'Row ' + rowNumber + ': ignored invalid axis_interval value "' + v + '"',
            );
          }
          break;
        }
        case 'bays': {
          for (let c = 1; c < cells.length; c++) {
            const name = cell(cells, c);
            if (name === '') continue;
            if (bays.includes(name)) {
              warnings.push('Row ' + rowNumber + ': duplicate bay "' + name + '" ignored');
            } else {
              addBay(name);
            }
          }
          break;
        }
        case 'category': {
          const name = cell(cells, 1);
          if (name === '') {
            warnings.push('Row ' + rowNumber + ': category row with no name ignored');
            break;
          }
          if (categories.some((c) => c.name === name)) {
            warnings.push(
              'Row ' + rowNumber + ': duplicate category "' + name + '" ignored',
            );
            break;
          }
          const colorRaw = cell(cells, 2);
          if (HEX_COLOR.test(colorRaw)) {
            addCategory(name, normalizeHex(colorRaw));
          } else {
            if (colorRaw !== '') {
              warnings.push(
                'Row ' + rowNumber + ': category "' + name +
                  '" has invalid color "' + colorRaw + '"; assigned a palette color',
              );
            }
            addCategory(name, null);
          }
          break;
        }
        default:
          // Unknown settings key: ignored on parse, dropped on export.
          break;
      }
      continue;
    }

    dataRows.push({ rowNumber, cells });
  }

  // --- Pass 2: validate data rows (minutes reject rule) ------------------
  const records: DataRow[] = [];
  for (const { rowNumber, cells } of dataRows) {
    const minutesRaw = cell(cells, 3);
    const minutes = minutesRaw === '' ? NaN : Number(minutesRaw);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return {
        ok: false,
        error:
          'Row ' + rowNumber + ': minutes must be a positive number, got "' +
          minutesRaw + '". File not loaded.',
      };
    }
    const categoryRaw = cell(cells, 4);
    records.push({
      rowNumber,
      id: cell(cells, 0),
      bay: cell(cells, 1),
      process: cell(cells, 2),
      minutes,
      category: categoryRaw === '' ? null : categoryRaw,
    });
  }

  // --- Pass 3: resolve ids ------------------------------------------------
  // First occurrence of an explicit id wins; later duplicates are regenerated
  // with a warning. Blank ids are generated. Generation avoids every explicit
  // id in the file, so a blank id can never steal a later row's id.
  const claimed = new Set<string>();
  const needsNewId = new Set<DataRow>();
  for (const r of records) {
    if (r.id === '') {
      needsNewId.add(r);
    } else if (claimed.has(r.id)) {
      warnings.push(
        'Row ' + r.rowNumber + ': duplicate id "' + r.id + '"; a new id was generated',
      );
      needsNewId.add(r);
    } else {
      claimed.add(r.id);
    }
  }
  for (const r of records) {
    if (!needsNewId.has(r)) continue;
    const id = generateId(claimed);
    claimed.add(id);
    r.id = id;
  }

  // --- Pass 4: build blocks, appending unknown bays and categories --------
  const blocks: Block[] = [];
  for (const r of records) {
    let bay = r.bay;
    if (bay === '') {
      warnings.push(
        'Row ' + r.rowNumber + ': block has no bay; moved to the parking lot',
      );
      bay = PARKING;
    } else if (bay !== PARKING && !bays.includes(bay)) {
      addBay(bay);
    }
    if (r.category !== null && !categories.some((c) => c.name === r.category)) {
      addCategory(r.category, null);
    }
    blocks.push({
      id: r.id,
      bay,
      process: r.process,
      minutes: r.minutes,
      category: r.category,
    });
  }

  const state: ChartState = {
    bays,
    blocks,
    categories,
    taktMinutes,
    axisMaxMinutes: 0, // placeholder, set below
    axisIntervalMinutes,
  };
  state.axisMaxMinutes =
    axisMaxMinutes !== undefined
      ? axisMaxMinutes
      : computeAxisMax({
          blocks,
          bays,
          taktMinutes,
          axisIntervalMinutes,
        });

  return { ok: true, state, warnings };
}

// Export rules (SPEC 4.4): UTF-8 with BOM, CRLF line endings, byte-stable.
// Blocks are written in array order, which preserves the user's row order and
// the within-bay bottom-to-top sequence.
export function serializeCsv(state: ChartState): string {
  const settingsRows: string[][] = [
    ['takt_minutes', state.taktMinutes === null ? '' : String(state.taktMinutes)],
    ['axis_max_minutes', String(state.axisMaxMinutes)],
    ['axis_interval', String(state.axisIntervalMinutes)],
    ['bays', ...state.bays],
  ];
  for (const c of state.categories) {
    settingsRows.push(['category', c.name, c.color]);
  }

  const tableRows: string[][] = [TABLE_HEADER];
  for (const b of state.blocks) {
    tableRows.push([b.id, b.bay, b.process, String(b.minutes), b.category ?? '']);
  }

  const settings = Papa.unparse(settingsRows, { newline: '\r\n' });
  const table = Papa.unparse(tableRows, { newline: '\r\n' });
  return BOM + COMMENT_LINE + '\r\n' + settings + '\r\n\r\n' + table + '\r\n';
}
