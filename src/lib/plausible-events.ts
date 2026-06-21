type PlausibleWindow = Window & {
  plausible?: (eventName: string) => void
}

export function trackPlausibleEvent(eventName: string) {
  if (typeof window === "undefined") {
    return
  }

  const plausible = (window as PlausibleWindow).plausible

  if (typeof plausible === "function") {
    plausible(eventName)
  }
}
