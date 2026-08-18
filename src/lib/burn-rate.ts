type Reading = { balance: number; recorded_at: string }

const MS_PER_DAY = 86_400_000

// Estimates consumption by summing the balance drops between consecutive
// readings, so a mid-window top-up contributes zero rather than cancelling
// out the burn that came before it. Returns null unless some genuine
// consumption happened over a positive time span.
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
  let consumed = 0
  for (let i = 1; i < sorted.length; i++) {
    const drop = sorted[i - 1].balance - sorted[i].balance
    if (drop > 0) consumed += drop
  }
  if (consumed <= 0) return null
  const perDay = consumed / days
  return { perDay, daysLeft: newest.balance / perDay }
}
