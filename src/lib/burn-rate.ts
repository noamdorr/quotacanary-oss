type Reading = { balance: number; recorded_at: string }

const MS_PER_DAY = 86_400_000

// Estimates linear consumption from the oldest to newest reading in the window.
// Returns null unless the trend is genuinely downward over a positive time span.
export function burnRate(
  history: Reading[]
): { perDay: number; daysLeft: number } | null {
  if (history.length < 2) return null
  const sorted = [...history].sort(
    (a, b) => +new Date(a.recorded_at) - +new Date(b.recorded_at)
  )
  const oldest = sorted[0]
  const newest = sorted[sorted.length - 1]
  const days =
    (+new Date(newest.recorded_at) - +new Date(oldest.recorded_at)) / MS_PER_DAY
  if (days <= 0) return null
  const consumed = oldest.balance - newest.balance
  if (consumed <= 0) return null
  const perDay = consumed / days
  return { perDay, daysLeft: newest.balance / perDay }
}
