export type AuthTab = "login" | "signup"

export function resolveAuthTab(tab?: string | null): AuthTab {
  return tab === "signup" ? "signup" : "login"
}
