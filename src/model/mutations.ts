import { PARKING } from './types';
import type { Block, ChartState } from './types';
import { generateId } from './id';
import { nextUnusedColor } from './palette';

// Pure ChartState edits (SPEC sections 9.1, 9.2, 9.5, 10). No DOM, no React.
// Every function returns a new state and leaves the input untouched, which is
// what makes the snapshot undo stack in history.ts cheap and correct.

export interface BlockFields {
  process: string;
  minutes: number;
  category: string | null;
}

function usedIds(state: ChartState): Set<string> {
  return new Set(state.blocks.map((b) => b.id));
}

// Appends to the END of the bay's run, which is the TOP of the column
// (SPEC 9.1: index 0 is the baseline, so latest in sequence is the top).
function insertAtTopOfBay(blocks: readonly Block[], block: Block): Block[] {
  const next = [...blocks];
  let lastOfBay = -1;
  for (let i = 0; i < next.length; i++) {
    if (next[i].bay === block.bay) lastOfBay = i;
  }
  if (lastOfBay === -1) next.push(block);
  else next.splice(lastOfBay + 1, 0, block);
  return next;
}

export function addBlock(
  state: ChartState,
  bay: string,
  fields: BlockFields,
): ChartState {
  const block: Block = { id: generateId(usedIds(state)), bay, ...fields };
  return { ...state, blocks: insertAtTopOfBay(state.blocks, block) };
}

export function updateBlock(
  state: ChartState,
  id: string,
  fields: BlockFields,
): ChartState {
  return {
    ...state,
    blocks: state.blocks.map((b) => (b.id === id ? { ...b, ...fields } : b)),
  };
}

export function deleteBlock(state: ChartState, id: string): ChartState {
  return { ...state, blocks: state.blocks.filter((b) => b.id !== id) };
}

// SPEC 10: a category typed into the combobox gets the next unused palette
// color. There is no color picker. Existing names are returned untouched.
export function ensureCategory(state: ChartState, name: string): ChartState {
  const trimmed = name.trim();
  if (trimmed === '') return state;
  if (state.categories.some((c) => c.name === trimmed)) return state;
  const color = nextUnusedColor(state.categories.map((c) => c.color));
  return { ...state, categories: [...state.categories, { name: trimmed, color }] };
}

// SPEC 9.5: appends "Bay N", skipping names already taken.
export function addBay(state: ChartState): ChartState {
  const taken = new Set(state.bays);
  for (let n = state.bays.length + 1; ; n++) {
    const name = 'Bay ' + n;
    if (!taken.has(name)) return { ...state, bays: [...state.bays, name] };
  }
}

// Renaming retags the bay's blocks so `bay` stays a foreign key into `bays`.
// Rejects blanks, duplicates, and the reserved PARKING name by returning the
// input state unchanged.
export function renameBay(
  state: ChartState,
  from: string,
  to: string,
): ChartState {
  const name = to.trim();
  if (name === '' || name === from) return state;
  if (name === PARKING || state.bays.includes(name)) return state;
  if (!state.bays.includes(from)) return state;
  return {
    ...state,
    bays: state.bays.map((b) => (b === from ? name : b)),
    blocks: state.blocks.map((b) => (b.bay === from ? { ...b, bay: name } : b)),
  };
}

// SPEC 9.5: removing a bay moves its blocks to the parking lot; it never
// destroys them. Minimum one bay, so the last bay cannot be removed.
export function removeBay(state: ChartState, bay: string): ChartState {
  if (state.bays.length <= 1 || !state.bays.includes(bay)) return state;
  return {
    ...state,
    bays: state.bays.filter((b) => b !== bay),
    blocks: state.blocks.map((b) => (b.bay === bay ? { ...b, bay: PARKING } : b)),
  };
}
