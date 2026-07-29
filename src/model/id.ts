// Deterministic short ids in the style of the SPEC example (b01, b02, ...).
// Does not mutate `existing`; the caller records the returned id.
export function generateId(existing: ReadonlySet<string>): string {
  for (let n = 1; ; n++) {
    const id = 'b' + String(n).padStart(2, '0');
    if (!existing.has(id)) return id;
  }
}
