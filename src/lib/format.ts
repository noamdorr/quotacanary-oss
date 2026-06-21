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
    case "gb":
      return `${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} GB`
    default:
      return balance.toLocaleString()
  }
}
