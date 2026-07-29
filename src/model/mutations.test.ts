import { describe, expect, it } from 'vitest';
import {
  addBay,
  addBlock,
  deleteBlock,
  ensureCategory,
  removeBay,
  renameBay,
  updateBlock,
} from './mutations';
import { newChartState } from './defaults';
import { PALETTE } from './palette';
import { PARKING } from './types';
import type { ChartState } from './types';

function base(overrides: Partial<ChartState> = {}): ChartState {
  return { ...newChartState(), ...overrides };
}

function inBay(state: ChartState, bay: string): string[] {
  return state.blocks.filter((b) => b.bay === bay).map((b) => b.process);
}

const FIELDS = { process: 'Weld', minutes: 30, category: null };

describe('addBlock (SPEC 9.1)', () => {
  it('adds to the TOP of the column, which is the end of the array', () => {
    let s = base();
    s = addBlock(s, 'Bay 1', { ...FIELDS, process: 'First' });
    s = addBlock(s, 'Bay 1', { ...FIELDS, process: 'Second' });
    expect(inBay(s, 'Bay 1')).toEqual(['First', 'Second']);
  });

  it('inserts into the bay run without disturbing other bays', () => {
    let s = base();
    s = addBlock(s, 'Bay 1', { ...FIELDS, process: 'A' });
    s = addBlock(s, 'Bay 2', { ...FIELDS, process: 'X' });
    s = addBlock(s, 'Bay 1', { ...FIELDS, process: 'B' });
    expect(inBay(s, 'Bay 1')).toEqual(['A', 'B']);
    expect(inBay(s, 'Bay 2')).toEqual(['X']);
  });

  it('gives every block a unique id', () => {
    let s = base();
    for (let i = 0; i < 5; i++) s = addBlock(s, 'Bay 1', FIELDS);
    expect(new Set(s.blocks.map((b) => b.id)).size).toBe(5);
  });

  it('adds to the parking lot when that is the destination', () => {
    const s = addBlock(base(), PARKING, FIELDS);
    expect(inBay(s, PARKING)).toEqual(['Weld']);
    expect(s.bays).not.toContain(PARKING);
  });

  it('does not mutate the input state', () => {
    const s = base();
    addBlock(s, 'Bay 1', FIELDS);
    expect(s.blocks).toEqual([]);
  });
});

describe('updateBlock and deleteBlock', () => {
  it('updates only the targeted block', () => {
    let s = addBlock(base(), 'Bay 1', { ...FIELDS, process: 'A' });
    s = addBlock(s, 'Bay 1', { ...FIELDS, process: 'B' });
    const id = s.blocks[0].id;
    s = updateBlock(s, id, { process: 'A2', minutes: 45, category: 'Waste' });
    expect(s.blocks[0]).toMatchObject({ process: 'A2', minutes: 45, category: 'Waste' });
    expect(s.blocks[1].process).toBe('B');
  });

  it('keeps the block in its bay and position when updated', () => {
    let s = addBlock(base(), 'Bay 1', { ...FIELDS, process: 'A' });
    s = addBlock(s, 'Bay 1', { ...FIELDS, process: 'B' });
    s = updateBlock(s, s.blocks[0].id, { ...FIELDS, process: 'A2' });
    expect(inBay(s, 'Bay 1')).toEqual(['A2', 'B']);
  });

  it('deletes by id', () => {
    let s = addBlock(base(), 'Bay 1', { ...FIELDS, process: 'A' });
    s = addBlock(s, 'Bay 1', { ...FIELDS, process: 'B' });
    s = deleteBlock(s, s.blocks[0].id);
    expect(inBay(s, 'Bay 1')).toEqual(['B']);
  });
});

describe('ensureCategory (SPEC 10)', () => {
  it('assigns the next unused palette color', () => {
    // A new chart already uses the first three palette entries.
    const s = ensureCategory(base(), 'Rework');
    expect(s.categories[s.categories.length - 1]).toEqual({
      name: 'Rework',
      color: PALETTE[3],
    });
  });

  it('is a no-op for a name that already exists', () => {
    const s = base();
    expect(ensureCategory(s, 'Waste')).toBe(s);
  });

  it('ignores blank names', () => {
    const s = base();
    expect(ensureCategory(s, '   ')).toBe(s);
  });

  it('appends in order so the legend order is stable', () => {
    let s = ensureCategory(base(), 'One');
    s = ensureCategory(s, 'Two');
    expect(s.categories.map((c) => c.name)).toEqual([
      'Value-Add',
      'Non-Value-Add',
      'Waste',
      'One',
      'Two',
    ]);
  });
});

describe('bays (SPEC 9.5)', () => {
  it('appends Bay N, skipping names already taken', () => {
    expect(addBay(base()).bays).toEqual(['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Bay 5']);
    const collide = base({ bays: ['Bay 1', 'Bay 5'] });
    expect(addBay(collide).bays).toEqual(['Bay 1', 'Bay 5', 'Bay 3']);
  });

  it('renaming retags the bay blocks', () => {
    const s = renameBay(addBlock(base(), 'Bay 1', FIELDS), 'Bay 1', 'Weld cell');
    expect(s.bays[0]).toBe('Weld cell');
    expect(s.blocks[0].bay).toBe('Weld cell');
  });

  it('rejects blank, duplicate, and reserved rename targets', () => {
    const s = base();
    expect(renameBay(s, 'Bay 1', '  ')).toBe(s);
    expect(renameBay(s, 'Bay 1', 'Bay 2')).toBe(s);
    expect(renameBay(s, 'Bay 1', PARKING)).toBe(s);
  });

  it('removing a bay moves its blocks to the parking lot, never deletes them', () => {
    let s = addBlock(base(), 'Bay 2', { ...FIELDS, process: 'Kept' });
    s = removeBay(s, 'Bay 2');
    expect(s.bays).toEqual(['Bay 1', 'Bay 3', 'Bay 4']);
    expect(inBay(s, PARKING)).toEqual(['Kept']);
    expect(s.blocks).toHaveLength(1);
  });

  it('refuses to remove the last bay', () => {
    const s = base({ bays: ['Bay 1'] });
    expect(removeBay(s, 'Bay 1')).toBe(s);
  });
});
