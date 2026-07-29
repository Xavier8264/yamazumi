import { PARKING } from './types';
import type { Block, Category, ChartState } from './types';

// Deterministic PRNG so test failures reproduce.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Name pools stress the CSV layer: commas, double quotes, and non-ASCII
// (written as \u escapes so this source file stays ASCII). All names are
// pre-trimmed because the parser trims every cell.
const BAY_POOL = [
  'Bay 1',
  'Bay 2',
  'Sub-Assembly',
  'Weld, Trim & Finish',
  'Station "A"',
  'Estaci\u00f3n 3',
  'B\u00fchne 4',
  'Final QC',
];

const PROCESS_POOL = [
  'Weld frame',
  'Install harness',
  'Torque, check, log',
  'Grind "flash" off edge',
  'Montaje r\u00e1pido',
  'Endpr\u00fcfung',
  'Debur edges',
  'Paint touchup',
  'Align doors, hood, and trunk',
  'Kitting',
];

const CATEGORY_POOL: Category[] = [
  { name: 'Value-Add', color: '#2E7D32' },
  { name: 'Non-Value-Add', color: '#F9A825' },
  { name: 'Waste', color: '#C62828' },
  { name: 'Rework, misc', color: '#4FC3F7' },
  { name: 'Pr\u00fcfen \u00dcbergabe', color: '#6A1B9A' },
  { name: 'Setup "quick"', color: '#AED581' },
];

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function shuffledPrefix<T>(rand: () => number, arr: readonly T[], count: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export function randomChartState(rand: () => number): ChartState {
  const bays = shuffledPrefix(rand, BAY_POOL, 1 + Math.floor(rand() * 6));
  const categories = shuffledPrefix(rand, CATEGORY_POOL, Math.floor(rand() * 6));

  const blockCount = Math.floor(rand() * 26);
  const blocks: Block[] = [];
  for (let i = 0; i < blockCount; i++) {
    const parking = rand() < 0.15;
    const withCategory = categories.length > 0 && rand() < 0.7;
    // Raw floats survive String() -> Number() exactly, so decimals are safe.
    const minutes = rand() < 0.5 ? 1 + Math.floor(rand() * 120) : 0.25 + rand() * 119;
    blocks.push({
      id: 'b' + String(i + 1).padStart(2, '0'),
      bay: parking ? PARKING : pick(rand, bays),
      process: pick(rand, PROCESS_POOL),
      minutes,
      category: withCategory ? pick(rand, categories).name : null,
    });
  }

  const axisIntervalMinutes = pick(rand, [5, 10, 15, 20, 30, 60]);
  return {
    bays,
    blocks,
    categories,
    taktMinutes: rand() < 0.3 ? null : 1 + Math.floor(rand() * 180) + (rand() < 0.3 ? 0.5 : 0),
    axisMaxMinutes: axisIntervalMinutes * (2 + Math.floor(rand() * 10)),
    axisIntervalMinutes,
  };
}
