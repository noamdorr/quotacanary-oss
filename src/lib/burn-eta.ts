const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

export type BurnEta = { short: string; long: string }

// Translates days-of-runway (from burnRate().daysLeft) into the brand's
// human phrasing. `daysLeft` is null when there is no measurable burn.
export function formatBurnEta(
  daysLeft: number | null,
  now: Date = new Date()
): BurnEta {
  if (daysLeft === null) {
    return { short: "no burn yet", long: "Not draining yet." }
  }
  if (daysLeft <= 0) {
    return { short: "already gone", long: "Already empty." }
  }
  if (daysLeft < 1) {
    const hrs = Math.max(1, Math.round(daysLeft * 24))
    return {
      short: `~${hrs}h`,
      long: `Empties in ~${hrs} hour${hrs === 1 ? "" : "s"}.`,
    }
  }
  if (daysLeft < 1.5) {
    return {
      short: "burns out tomorrow",
      long: "Empties tomorrow.",
    }
  }
  // Weekday is resolved in UTC on purpose: keeps output deterministic across
  // server/client timezones (and makes the unit tests stable in any CI tz).
  if (daysLeft < 7) {
    const d = Math.round(daysLeft)
    const out = new Date(now.getTime() + daysLeft * 86_400_000)
    return {
      short: `burns out ${DAY_NAMES[out.getUTCDay()]}`,
      long: `Empties in ~${d} day${d === 1 ? "" : "s"}.`,
    }
  }
  if (daysLeft < 28) {
    const wks = Math.round(daysLeft / 7)
    return {
      short: `~${wks} week${wks === 1 ? "" : "s"}`,
      long: `Empties in ~${Math.round(daysLeft)} days.`,
    }
  }
  if (daysLeft < 365) {
    const mo = Math.round(daysLeft / 30)
    return {
      short: `~${mo} month${mo === 1 ? "" : "s"}`,
      long: `Empties in ~${mo} month${mo === 1 ? "" : "s"}.`,
    }
  }
  return { short: "~next year", long: "Plenty of runway." }
}
