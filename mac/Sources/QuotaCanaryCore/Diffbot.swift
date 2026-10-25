import Foundation

/// Port of src/lib/adapters/diffbot.ts. Read-only: one GET per check.
/// SECURITY: Diffbot documents only a query-string token, so the key can
/// surface in vendor request logs, the same residual exposure as the web.
/// `/v4/account` reports no remaining figure: the balance is `planCredits`
/// minus the `usage[].credits` since the current billing cycle began, which
/// is derived from `planStart` (the latest monthly anniversary on or before
/// today, UTC). One pool, cap = planCredits when above 0.
public enum Diffbot: HandWrittenProvider {
  public static let id: ProviderID = .diffbot
  public static let name = "Diffbot"
  public static let topupURL = "https://www.diffbot.com/pricing"
  // Diffbot's seed row: critical 500, low 1500.
  public static let defaultSettings = PoolSettings(monitored: true, low: 1500, critical: 500)

  public static let creditsPool = Pool(
    creditType: "credits", label: Copy.monthlyCreditsPoolLabel, unit: .credits, cap: nil
  )
  public static let pools = [creditsPool]

  /// The key escaped like the web's `encodeURIComponent`; `days=31` covers any monthly cycle.
  public static func accountURL(key: String) -> URL {
    URL(string: "https://api.diffbot.com/v4/account?token=\(CredentialFields.pathSegment(key))&days=31")!
  }

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    try await read(key: key, transport: transport, now: { Date() })
  }

  public static func read(
    key: String, transport: ProviderTransport, now: @Sendable () -> Date = { Date() }
  ) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.get(accountURL(key: key), headers: [:])
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parse(response, today: utcDay(now()))
  }

  private static let utc: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    return calendar
  }()

  /// `YYYY-MM-DD` in UTC, the web's `toISOString().slice(0, 10)`.
  static func utcDay(_ date: Date) -> String {
    let parts = utc.dateComponents([.year, .month, .day], from: date)
    return isoDate(parts.year!, parts.month!, parts.day!)
  }

  private static func isoDate(_ year: Int, _ month: Int, _ day: Int) -> String {
    let padded = { (value: Int, width: Int) in String(repeating: "0", count: max(width - String(value).count, 0)) + String(value) }
    return "\(padded(year, 4))-\(padded(month, 2))-\(padded(day, 2))"
  }

  /// `year`/`month0` with the web's `Date.UTC` month overflow, the day clamped to the month's last day.
  private static func anniversary(year: Int, month0: Int, day: Int) -> String {
    var y = year
    var m = month0
    if m < 0 { y -= 1; m += 12 }
    var components = DateComponents()
    components.year = y
    components.month = m + 1
    components.day = 1
    let lastDay = utc.range(of: .day, in: .month, for: utc.date(from: components)!)!.count
    return isoDate(y, m + 1, min(day, lastDay))
  }

  /// The start of the billing cycle that contains `today`: the latest monthly
  /// anniversary of `planStart` on or before today (a day-31 start clamps to
  /// the month's last day). Both are `YYYY-MM-DD`, so they compare as strings.
  /// Nil when either is malformed.
  static func cycleStart(planStart: String, today: String) -> String? {
    func parts(_ value: String) -> [Int]? {
      let pieces = value.split(separator: "-", omittingEmptySubsequences: false)
      guard pieces.count == 3, pieces[0].count == 4, pieces[1].count == 2, pieces[2].count == 2,
        pieces.allSatisfy({ $0.allSatisfy { $0.isASCII && $0.isNumber } })
      else { return nil }
      return pieces.compactMap { Int($0) }
    }
    guard let start = parts(planStart), let now = parts(today) else { return nil }
    if planStart >= today { return planStart }
    let thisMonth = anniversary(year: now[0], month0: now[1] - 1, day: start[2])
    return thisMonth <= today ? thisMonth : anniversary(year: now[0], month0: now[1] - 2, day: start[2])
  }

  public static func parse(_ response: HTTPResponse, today: String) throws -> [PoolBalance] {
    if response.status == 401 || response.status == 403 { throw ProviderReadError.keyRejected }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    let object = json as? [String: Any]
    guard let planCredits = ProviderJSON.finiteOrNil(object?["planCredits"]) else {
      throw ProviderReadError.missingField("planCredits")
    }
    guard let planStart = object?["planStart"] as? String, let start = cycleStart(planStart: planStart, today: today) else {
      throw ProviderReadError.missingField("planStart")
    }
    guard let usage = object?["usage"] as? [Any] else { throw ProviderReadError.missingField("usage") }
    var used = 0.0
    for day in usage {
      guard let day = day as? [String: Any], let date = day["date"] as? String, date >= start else { continue }
      used += ProviderJSON.finiteOrNil(day["credits"]) ?? 0
    }
    var pool = creditsPool
    if planCredits > 0 { pool.cap = planCredits }
    return [PoolBalance(pool: pool, balance: planCredits - used)]
  }

  /// The 429 sweep and callers without a clock: today read from the system.
  public static func parse(_ response: HTTPResponse) throws -> [PoolBalance] {
    try parse(response, today: utcDay(Date()))
  }
}
