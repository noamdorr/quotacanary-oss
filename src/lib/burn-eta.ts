export type BurnEta = { short: string; long: string }

// Translates days-of-runway (from burnRate().daysLeft) into the brand's
// human phrasing. `daysLeft` is null when there is no measurable burn.
//
// Unit rule (QUO-184; the Mac app's BurnEta.swift mirrors it exactly):
//   < 1 day        hours        "~18h"              / "Empties in ~18 hours."
//   1 to < 1.5     tomorrow     "burns out tomorrow" / "Empties tomorrow."
//   1.5 to < 7     days         "in ~3 days"        / "Empties in ~3 days."
//   7 to < 28      weeks        "~2 weeks"          / "Empties in ~16 days."
//   28 to < 365    months       "~3 months"         / "Empties in ~3 months."
//   >= 365         next year    "~next year"        / "Plenty of runway."
// Always relative, never a weekday name: the reader should not have to recall
// today's date and do the math.
export function formatBurnEta(daysLeft: number | null): BurnEta {
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
  if (daysLeft < 7) {
    const d = Math.round(daysLeft)
    return {
      short: `in ~${d} day${d === 1 ? "" : "s"}`,
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
