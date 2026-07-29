import type { ChartState } from '../model/types';

// SPEC section 11: crash protection. sessionStorage only, one state schema.
const KEY = 'yamazumi:draft';

function isChartState(v: unknown): v is ChartState {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.bays) &&
    Array.isArray(o.blocks) &&
    Array.isArray(o.categories) &&
    (o.taktMinutes === null || typeof o.taktMinutes === 'number') &&
    typeof o.axisMaxMinutes === 'number' &&
    typeof o.axisIntervalMinutes === 'number'
  );
}

export function loadDraft(): ChartState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isChartState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDraft(state: ChartState): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable: crash protection is best-effort.
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Ignore.
  }
}
