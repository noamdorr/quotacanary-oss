// Coerces an unknown API value to a finite number, falling back when it isn't one.
export function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
