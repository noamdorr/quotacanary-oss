import Foundation

/// Port of src/lib/adapters/brevo.ts. Read-only: one GET per check.
/// The balance lives in `plan[]`, one entry per plan type in an undocumented
/// order, so entries are selected by `type`, never by position. Paid email
/// credits (subscription + pay-as-you-go) sum into one pool; sms and the free
/// plan's daily allowance (it resets) are their own pools. A pool with no
/// matching entry is omitted; `userLimit` entries count seats, not sends.
public enum Brevo: HandWrittenProvider {
  public static let id: ProviderID = .brevo
  public static let name = "Brevo"
  public static let topupURL = "https://www.brevo.com/pricing/"
  // Brevo's seed row: critical 500, low 1500 (3x), email, SMS and free daily credits alike.
  public static let defaultSettings = PoolSettings(monitored: true, low: 1500, critical: 500)

  public static let accountURL = URL(string: "https://api.brevo.com/v3/account")!

  public static let emailsPool = Pool(
    creditType: "emails", label: Copy.brevoEmailsPoolLabel, unit: .credits, cap: nil
  )
  public static let smsPool = Pool(
    creditType: "sms", label: Copy.brevoSMSPoolLabel, unit: .credits, cap: nil
  )
  public static let freeEmailsPool = Pool(
    creditType: "free_emails", label: Copy.brevoFreeEmailsPoolLabel, unit: .credits, cap: nil
  )
  public static let pools = [emailsPool, smsPool, freeEmailsPool]

  private static let types: [(Pool, Set<String>)] = [
    (emailsPool, ["subscription", "payAsYouGo"]),
    (smsPool, ["sms"]),
    (freeEmailsPool, ["free"]),
  ]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.get(
        accountURL,
        headers: ["Accept": "application/json", "api-key": key]
      )
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
    guard let plan = (json as? [String: Any])?["plan"] as? [Any] else {
      throw ProviderReadError.missingField("plan")
    }
    let entries = plan.compactMap { $0 as? [String: Any] }
      .filter { $0["creditsType"] as? String != "userLimit" }

    var balances: [PoolBalance] = []
    for (pool, poolTypes) in types {
      let matching = entries.filter { ($0["type"] as? String).map(poolTypes.contains) ?? false }
      if matching.isEmpty { continue }
      var total = 0.0
      for entry in matching {
        // Missing or non-numeric credits is an unexpected response, never a false zero.
        guard let credits = ProviderJSON.finiteOrNil(entry["credits"]) else {
          throw ProviderReadError.missingField("plan.credits")
        }
        total += credits
      }
      balances.append(PoolBalance(pool: pool, balance: total))
    }
    guard !balances.isEmpty else { throw ProviderReadError.missingField("plan") }
    return balances
  }
}
