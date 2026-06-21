// Appends UTM attribution to an outbound link. Safe on null/empty (returns the
// input) and on URLs that already carry a query string or hash fragment.
export function withUtm(
  url: string | null | undefined,
  params: { source?: string; medium?: string; campaign?: string } = {}
): string {
  if (!url) return url ?? ""
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  const { source = "quotacanary", medium = "directory", campaign } = params
  parsed.searchParams.set("utm_source", source)
  parsed.searchParams.set("utm_medium", medium)
  if (campaign) parsed.searchParams.set("utm_campaign", campaign)
  return parsed.toString()
}
