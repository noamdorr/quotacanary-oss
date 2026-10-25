import Foundation

/// Port of src/lib/adapters/contactout.ts. Read-only: one GET per check.
/// Three pools (email, phone, search), each read from `usage` as
/// `<x>remaining ?? <x>quota`. The cap is the quota, but only when a
/// remaining figure exists: a prepaid account reports a quota alone, and that
/// is the balance, not a plan size. A pool with neither value is omitted.
/// The web's `Number(value)` reads a null field as 0; here null counts as
/// absent, so a null never shows as an empty pool.
public enum ContactOut: HandWrittenProvider {
  public static let id: ProviderID = .contactout
  public static let name = "ContactOut"
  public static let topupURL = "https://contactout.com/pricing"
  // QUO-256: ContactOut's seed row: critical 100, low 300 (the seed sets it).
  public static let defaultSettings = PoolSettings(monitored: true, low: 300, critical: 100)

  public static let statsURL = URL(string: "https://api.contactout.com/v1/stats")!

  public static let emailPool = Pool(creditType: "email", label: Copy.contactOutEmailPoolLabel, unit: .credits, cap: nil)
  public static let phonePool = Pool(creditType: "phone", label: Copy.contactOutPhonePoolLabel, unit: .credits, cap: nil)
  public static let searchPool = Pool(creditType: "search", label: Copy.contactOutSearchPoolLabel, unit: .credits, cap: nil)
  public static let pools = [emailPool, phonePool, searchPool]

  /// Each pool with the `usage` keys for its quota and remaining figures.
  private static let fieldsByPool: [(pool: Pool, quota: String, remaining: String)] = [
    (emailPool, "quota", "remaining"),
    (phonePool, "phone_quota", "phone_remaining"),
    (searchPool, "search_quota", "search_remaining"),
  ]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.get(statsURL, headers: [
        "Content-Type": "application/json", "Accept": "application/json", "authorization": "basic", "token": key,
      ])
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parse(response)
  }

  public static func parse(_ response: HTTPResponse) throws -> [PoolBalance] {
    if response.status == 401 || response.status == 403 { throw ProviderReadError.keyRejected }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    let object = json as? [String: Any]
    // A 200 whose body carries its own failing status_code is the vendor's error.
    if let code = ProviderJSON.finiteOrNil(object?["status_code"]), code >= 400 {
      throw ProviderReadError.reportedError((object?["message"] as? String) ?? Copy.contactOutError)
    }
    guard let usage = object?["usage"] as? [String: Any] else { throw ProviderReadError.missingField("usage") }
    var balances: [PoolBalance] = []
    for (pool, quotaField, remainingField) in fieldsByPool {
      let quota = ProviderJSON.finiteOrNil(usage[quotaField])
      let remaining = ProviderJSON.finiteOrNil(usage[remainingField])
      guard let balance = remaining ?? quota else { continue }
      var capped = pool
      if remaining != nil, let quota, quota > 0 { capped.cap = quota }
      balances.append(PoolBalance(pool: capped, balance: balance))
    }
    guard !balances.isEmpty else { throw ProviderReadError.missingField("usage") }
    return balances
  }
}
