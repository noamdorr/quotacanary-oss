import type { BurnEta } from "./burn-eta"

// The dashboard shows two measures of one pool and labels them apart: the
// status badge is the Warn below state (what alerts use), runway is the
// forecast of when the balance empties. Status drives the default sort and
// the filters; runway picks the hero and breaks status ties.

// The hero's eyebrow. The hero is the pool with the shortest runway, which
// can still be above its Warn below number.
export const HERO_EYEBROW = "Next to die · by runway"

// Shown under the hero's ETA when its badge says healthy, so a short runway
// beside a green badge reads as two facts, not a contradiction.
export const HEALTHY_SHORT_RUNWAY_NOTE = "Still above your Warn below number."

// Heads the ETA block in the drawer.
export const RUNWAY_HEADING = "Runway"

// The runway line on a row or card: the long ETA without its full stop
// ("Empties in ~3 days", "Already empty", "Not draining yet").
export function runwayLabel(eta: BurnEta): string {
  return eta.long.replace(/\.$/, "")
}
