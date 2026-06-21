// How a balance value should be interpreted and formatted in the UI.
// Adapters pick from this known set; the DB column is freeform text so new
// units can be added without a migration (the formatter falls back gracefully).
export type BalanceUnit = "credits" | "usd" | "gb"

export type BalanceReading = {
  creditType: string
  label: string
  balance: number
  balanceLimit: number | null
  unit: BalanceUnit
}

export type AdapterResult =
  | { ok: true; balances: BalanceReading[] }
  | { ok: false; error: string }

export type ToolAdapter = {
  toolId: string
  readBalance: (apiKey: string) => Promise<AdapterResult>
}
