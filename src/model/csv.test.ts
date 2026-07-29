import { describe, expect, it } from 'vitest';
import { parseCsv, serializeCsv } from './csv';
import type { ParseResult } from './csv';
import { PARKING } from './types';
import type { ChartState } from './types';
import { mulberry32, randomChartState } from './testutil';

function ok(r: ParseResult) {
  if (!r.ok) throw new Error('expected parse success, got: ' + r.error);
  return r;
}

function fail(r: ParseResult) {
  if (r.ok) throw new Error('expected parse failure, but parse succeeded');
  return r;
}

const SPEC_EXAMPLE = [
  '# Yamazumi chart',
  'takt_minutes,60',
  'axis_max_minutes,120',
  'axis_interval,30',
  'bays,Bay 1,Bay 2,Bay 3,Bay 4',
  'category,Value-Add,#2E7D32',
  'category,Non-Value-Add,#F9A825',
  'category,Waste,#C62828',
  '',
  'id,bay,process,minutes,category',
  'b01,Bay 1,Weld frame,45,Value-Add',
  'b02,Bay 1,Install harness,30,Non-Value-Add',
  'b03,Bay 2,Torque fasteners,20,Value-Add',
  'b04,Parking Lot,Paint touchup,15,',
].join('\n');

describe('parseCsv: SPEC 4.1 example', () => {
  it('parses the example file exactly', () => {
    const { state, warnings } = ok(parseCsv(SPEC_EXAMPLE));
    expect(warnings).toEqual([]);
    expect(state.bays).toEqual(['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4']);
    expect(state.taktMinutes).toBe(60);
    expect(state.axisMaxMinutes).toBe(120);
    expect(state.axisIntervalMinutes).toBe(30);
    expect(state.categories).toEqual([
      { name: 'Value-Add', color: '#2E7D32' },
      { name: 'Non-Value-Add', color: '#F9A825' },
      { name: 'Waste', color: '#C62828' },
    ]);
    expect(state.blocks).toEqual([
      { id: 'b01', bay: 'Bay 1', process: 'Weld frame', minutes: 45, category: 'Value-Add' },
      { id: 'b02', bay: 'Bay 1', process: 'Install harness', minutes: 30, category: 'Non-Value-Add' },
      { id: 'b03', bay: 'Bay 2', process: 'Torque fasteners', minutes: 20, category: 'Value-Add' },
      { id: 'b04', bay: PARKING, process: 'Paint touchup', minutes: 15, category: null },
    ]);
  });

  it('parses the same file with CRLF line endings', () => {
    const { state } = ok(parseCsv(SPEC_EXAMPLE.replace(/\n/g, '\r\n')));
    expect(state.blocks).toHaveLength(4);
    expect(state.bays).toHaveLength(4);
  });
});

describe('parseCsv: section boundary', () => {
  it('finds the boundary without any blank line before it', () => {
    const text = [
      'bays,Bay 1',
      'id,bay,process,minutes,category',
      'b01,Bay 1,Weld,10,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.blocks).toHaveLength(1);
  });

  it('boundary detection is case-insensitive and trims', () => {
    const text = [
      'bays,Bay 1',
      ' ID ,bay,process,minutes,category',
      'b01,Bay 1,Weld,10,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.blocks).toHaveLength(1);
  });

  it('survives extra blank rows sprinkled through both sections', () => {
    const text = [
      '',
      'bays,Bay 1',
      '',
      '',
      'id,bay,process,minutes,category',
      '',
      'b01,Bay 1,Weld,10,',
      '',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.blocks).toHaveLength(1);
  });

  it('ignores comment rows in both sections', () => {
    const text = [
      '# Yamazumi chart',
      'bays,Bay 1',
      '# a settings comment',
      'id,bay,process,minutes,category',
      '# a data comment',
      'b01,Bay 1,Weld,10,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.blocks).toHaveLength(1);
  });
});

describe('parseCsv: settings', () => {
  it('blank takt_minutes means no takt line', () => {
    const text = [
      'takt_minutes,',
      'bays,Bay 1',
      'id,bay,process,minutes,category',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.taktMinutes).toBeNull();
  });

  it('ignores unknown settings keys and drops them on export', () => {
    const text = [
      'zoom,1.5',
      'bays,Bay 1',
      'id,bay,process,minutes,category',
      'b01,Bay 1,Weld,10,',
    ].join('\n');
    const { state, warnings } = ok(parseCsv(text));
    expect(warnings).toEqual([]);
    expect(serializeCsv(state)).not.toContain('zoom');
  });

  it('missing axis_max_minutes is computed per SPEC 6', () => {
    const text = [
      'bays,Bay 1',
      'id,bay,process,minutes,category',
      'b01,Bay 1,A,60,',
      'b02,Bay 1,B,40,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    // tallest 100 -> 115 -> rounded up to 120
    expect(state.axisMaxMinutes).toBe(120);
  });

  it('missing axis_max_minutes uses the takt when it is taller', () => {
    const text = [
      'takt_minutes,100',
      'bays,Bay 1',
      'id,bay,process,minutes,category',
      'b01,Bay 1,A,10,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.axisMaxMinutes).toBe(120);
  });

  it('missing axis_max_minutes floors at interval * 2 on an empty chart', () => {
    const text = ['bays,Bay 1,Bay 2', 'id,bay,process,minutes,category'].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.axisMaxMinutes).toBe(60);
  });

  it('parking lot blocks are excluded from the computed axis max', () => {
    const text = [
      'bays,Bay 1',
      'id,bay,process,minutes,category',
      'b01,Bay 1,A,10,',
      'b02,Parking Lot,Huge,500,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.axisMaxMinutes).toBe(60);
  });
});

describe('parseCsv: data rows', () => {
  it('keeps commas in process names intact', () => {
    const text = [
      'bays,Bay 1',
      'id,bay,process,minutes,category',
      'b01,Bay 1,"Torque, check, log",10,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.blocks[0].process).toBe('Torque, check, log');
  });

  it('keeps non-ASCII names intact', () => {
    const text = [
      'bays,Estaci\u00f3n 3',
      'id,bay,process,minutes,category',
      'b01,Estaci\u00f3n 3,Montaje r\u00e1pido,10,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.bays).toEqual(['Estaci\u00f3n 3']);
    expect(state.blocks[0].process).toBe('Montaje r\u00e1pido');
  });

  it('blank category becomes null', () => {
    const text = [
      'bays,Bay 1',
      'id,bay,process,minutes,category',
      'b01,Bay 1,Weld,10,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.blocks[0].category).toBeNull();
  });

  it('generates an id for a blank id cell', () => {
    const text = [
      'bays,Bay 1',
      'id,bay,process,minutes,category',
      ',Bay 1,Weld,10,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.blocks[0].id).not.toBe('');
  });

  it('a generated id never steals an explicit id used later in the file', () => {
    const text = [
      'bays,Bay 1',
      'id,bay,process,minutes,category',
      ',Bay 1,First,10,',
      'b01,Bay 1,Second,10,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.blocks[1].id).toBe('b01');
    expect(state.blocks[0].id).not.toBe('b01');
    const ids = state.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('duplicate id keeps the first, regenerates the rest, and warns', () => {
    const text = [
      'bays,Bay 1',
      'id,bay,process,minutes,category',
      'x1,Bay 1,First,10,',
      'x1,Bay 1,Second,20,',
    ].join('\n');
    const { state, warnings } = ok(parseCsv(text));
    expect(state.blocks[0].id).toBe('x1');
    expect(state.blocks[1].id).not.toBe('x1');
    expect(warnings.some((w) => w.includes('x1'))).toBe(true);
  });

  it('a bay not in the bays setting is appended', () => {
    const text = [
      'bays,Bay 1',
      'id,bay,process,minutes,category',
      'b01,Bay 9,Weld,10,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.bays).toEqual(['Bay 1', 'Bay 9']);
  });

  it('Parking Lot is never treated as a bay', () => {
    const text = [
      'bays,Bay 1',
      'id,bay,process,minutes,category',
      'b01,Parking Lot,Weld,10,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.bays).toEqual(['Bay 1']);
    expect(state.blocks[0].bay).toBe(PARKING);
  });

  it('an unknown category gets the next unused palette color', () => {
    const text = [
      'bays,Bay 1',
      'category,Value-Add,#2E7D32',
      'id,bay,process,minutes,category',
      'b01,Bay 1,Weld,10,Inspection',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.categories).toEqual([
      { name: 'Value-Add', color: '#2E7D32' },
      { name: 'Inspection', color: '#F9A825' },
    ]);
  });

  it('an empty bay from the bays setting is representable', () => {
    const text = [
      'bays,Bay 1,Bay 2',
      'id,bay,process,minutes,category',
      'b01,Bay 1,Weld,10,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.bays).toEqual(['Bay 1', 'Bay 2']);
  });

  it('trims a bay name with trailing whitespace instead of forking a new bay', () => {
    const text = [
      'bays,Bay 1,Bay 2 ',
      'id,bay,process,minutes,category',
      'b01,Bay 2  ,Weld,10,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    expect(state.bays).toEqual(['Bay 1', 'Bay 2']);
    expect(state.blocks[0].bay).toBe('Bay 2');
  });

  it('row order in the file defines the sequence within each bay', () => {
    const text = [
      'bays,Bay 1,Bay 2',
      'id,bay,process,minutes,category',
      'b1,Bay 2,C2-first,10,',
      'b2,Bay 1,C1-first,10,',
      'b3,Bay 2,C2-second,10,',
      'b4,Bay 1,C1-second,10,',
    ].join('\n');
    const { state } = ok(parseCsv(text));
    const seq = (bay: string) =>
      state.blocks.filter((b) => b.bay === bay).map((b) => b.process);
    expect(seq('Bay 1')).toEqual(['C1-first', 'C1-second']);
    expect(seq('Bay 2')).toEqual(['C2-first', 'C2-second']);
  });

  it('a row with no bay goes to the parking lot with a warning', () => {
    const text = [
      'bays,Bay 1',
      'id,bay,process,minutes,category',
      'b01,,Weld,10,',
    ].join('\n');
    const { state, warnings } = ok(parseCsv(text));
    expect(state.blocks[0].bay).toBe(PARKING);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe('parseCsv: rejection', () => {
  function rejectFixture(minutes: string): string {
    return [
      '# Yamazumi chart',
      'bays,Bay 1',
      'id,bay,process,minutes,category',
      'b01,Bay 1,Weld,' + minutes + ',',
    ].join('\n');
  }

  it('rejects non-numeric minutes and names the row and value', () => {
    const { error } = fail(parseCsv(rejectFixture('abc')));
    expect(error).toContain('Row 4');
    expect(error).toContain('abc');
  });

  it('rejects time-formatted minutes like 1:30', () => {
    const { error } = fail(parseCsv(rejectFixture('1:30')));
    expect(error).toContain('1:30');
  });

  it('rejects negative minutes', () => {
    fail(parseCsv(rejectFixture('-5')));
  });

  it('rejects zero minutes', () => {
    fail(parseCsv(rejectFixture('0')));
  });

  it('rejects blank minutes', () => {
    fail(parseCsv(rejectFixture('')));
  });
});

describe('serializeCsv', () => {
  const tinyState: ChartState = {
    bays: ['Bay 1'],
    blocks: [
      { id: 'b01', bay: 'Bay 1', process: 'Weld frame', minutes: 45, category: 'Value-Add' },
    ],
    categories: [{ name: 'Value-Add', color: '#2E7D32' }],
    taktMinutes: 60,
    axisMaxMinutes: 120,
    axisIntervalMinutes: 30,
  };

  it('writes the exact durable format', () => {
    const expected =
      '\ufeff# Yamazumi chart\r\n' +
      'takt_minutes,60\r\n' +
      'axis_max_minutes,120\r\n' +
      'axis_interval,30\r\n' +
      'bays,Bay 1\r\n' +
      'category,Value-Add,#2E7D32\r\n' +
      '\r\n' +
      'id,bay,process,minutes,category\r\n' +
      'b01,Bay 1,Weld frame,45,Value-Add\r\n';
    expect(serializeCsv(tinyState)).toBe(expected);
  });

  it('starts with a BOM and uses CRLF line endings', () => {
    const csv = serializeCsv(tinyState);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('\r\n');
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('writes a blank takt_minutes when takt is null', () => {
    const csv = serializeCsv({ ...tinyState, taktMinutes: null });
    expect(csv).toContain('takt_minutes,\r\n');
  });

  it('quotes fields containing commas', () => {
    const csv = serializeCsv({
      ...tinyState,
      blocks: [
        { id: 'b01', bay: 'Bay 1', process: 'Torque, check, log', minutes: 10, category: null },
      ],
    });
    expect(csv).toContain('"Torque, check, log"');
  });

  it('is byte-stable: same state twice gives identical output', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = randomChartState(mulberry32(seed * 7919));
      expect(serializeCsv(state)).toBe(serializeCsv(state));
    }
  });

  it('is idempotent through a parse cycle', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = randomChartState(mulberry32(seed * 104729));
      const csv = serializeCsv(state);
      const { state: reparsed } = ok(parseCsv(csv));
      expect(serializeCsv(reparsed)).toBe(csv);
    }
  });
});

describe('CSV round trip', () => {
  it('serialize -> parse reproduces the state exactly over many random states', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const state = randomChartState(mulberry32(seed));
      const csv = serializeCsv(state);
      const result = ok(parseCsv(csv));
      expect(result.warnings).toEqual([]);
      expect(result.state).toStrictEqual(state);
    }
  });
});
