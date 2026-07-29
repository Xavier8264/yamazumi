// Display-only helpers for the DOM renderer. No geometry here.

export function formatMinutes(n: number): string {
  return String(Math.round(n * 100) / 100);
}

// Black text on light fills, white text on dark fills.
export function textColorFor(hex: string): string {
  const raw = hex.replace('#', '');
  if (raw.length < 6) return '#1f2328';
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? '#1f2328' : '#ffffff';
}
