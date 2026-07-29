// Palette in assignment order. Lightness deliberately alternates so the chart
// stays readable when printed or photocopied in grayscale (SPEC section 10).
export const PALETTE = [
  '#2E7D32',
  '#F9A825',
  '#C62828',
  '#4FC3F7',
  '#6A1B9A',
  '#AED581',
  '#00838F',
  '#FFAB91',
];

export const UNCATEGORIZED_COLOR = '#9E9E9E';

function clampChannel(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// amount in [-1, 1]: positive blends toward white, negative toward black.
export function shiftLightness(hex: string, amount: number): string {
  const raw = hex.replace('#', '');
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  const mix = (c: number) => clampChannel(c + (target - c) * t);
  const out = [mix(r), mix(g), mix(b)]
    .map((c) => c.toString(16).toUpperCase().padStart(2, '0'))
    .join('');
  return '#' + out;
}

// Next unused palette color. After the base palette is exhausted, cycle with a
// lightness shift, alternating lighter and darker per round.
export function nextUnusedColor(used: readonly string[]): string {
  const usedSet = new Set(used.map((c) => c.toUpperCase()));
  const isFree = (c: string) => !usedSet.has(c.toUpperCase());
  for (const c of PALETTE) {
    if (isFree(c)) return c;
  }
  for (let round = 1; ; round++) {
    const magnitude = Math.min(0.6, 0.18 * Math.ceil(round / 2));
    const amount = round % 2 === 1 ? magnitude : -magnitude;
    for (const base of PALETTE) {
      const c = shiftLightness(base, amount);
      if (isFree(c)) return c;
    }
  }
}
