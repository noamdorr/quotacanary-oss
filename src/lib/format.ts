// Formats a balance value for display based on its unit. Known units render
// with their natural notation; anything else falls back to a plain localized
// number so a new adapter unit never breaks the UI.
export function formatBalance(balance: number, unit: string): string {
  switch (unit) {
    case "usd":
      return balance.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
      })
    case "eur":
      return balance.toLocaleString(undefined, {
        style: "currency",
        currency: "EUR",
      })
    case "gb":
      return `${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} GB`
    case "minutes":
      return `${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} min`
    default:
      return balance.toLocaleString()
  }
}
