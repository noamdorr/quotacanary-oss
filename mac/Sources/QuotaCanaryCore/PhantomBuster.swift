import Foundation

/// Port of src/lib/adapters/phantombuster.ts. Read-only: one GET per check.
/// Each pool is a plan limit minus a counter, plus the sum of its top-up lots.
/// HYPOTHESIS (unconfirmed live, QUO-229): the top-level counters are USAGE
/// this cycle, since the schema documents "remaining" only on top-up lots. A
/// counter above its plan limit means the guess is wrong (or the plan changed
/// mid-cycle), so the read fails instead of reporting a negative balance.
public enum PhantomBuster: HandWrittenProvider {
  public static let id: ProviderID = .phantombuster
  public static let name = "PhantomBuster"
  public static let topupURL = "https://phantombuster.com/pricing"
  // PhantomBuster's seed row: critical 60, low 180 (3x), shared by all three pools.
  public static let defaultSettings = PoolSettings(monitored: true, low: 180, critical: 60)

  public static let resourcesURL = URL(string: "https://api.phantombuster.com/api/v2/orgs/fetch-resources")!

  struct Spec {
    let pool: Pool
    let planField: String
    let counterField: String
    let topUpField: String?
  }

  /// The schema states no unit for execution time; minutes is assumed.
  static let specs = [
    Spec(
      pool: Pool(creditType: "execution_time", label: Copy.phantomBusterExecutionTimePoolLabel, unit: .minutes, cap: nil),
      planField: "monthlyExecutionTime", counterField: "monthlyExecutionTime", topUpField: nil
    ),
    Spec(
      pool: Pool(creditType: "ai_credits", label: Copy.phantomBusterAICreditsPoolLabel, unit: .credits, cap: nil),
      planField: "monthlyAiCredits", counterField: "monthlyAiCredit", topUpField: "aiCredits"
    ),
    Spec(
      pool: Pool(creditType: "emails", label: Copy.phantomBusterEmailsPoolLabel, unit: .credits, cap: nil),
      planField: "monthlyMails", counterField: "monthlyMail", topUpField: "emailCredits"
    ),
  ]
  public static let pools = specs.map(\.pool)

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      // The org comes from the key, so no X-Phantombuster-Org header.
      response = try await transport.get(
        resourcesURL, headers: ["X-Phantombuster-Key": key, "Accept": "application/json"]
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
    guard let data = json as? [String: Any], let plan = data["plan"] as? [String: Any] else {
      throw ProviderReadError.missingField("plan")
    }
    let topUps = data["topUps"] as? [String: Any]

    var balances: [PoolBalance] = []
    for spec in specs {
      // Missing or 0: the plan does not include this resource.
      guard let planLimit = ProviderJSON.finiteOrNil(plan[spec.planField]), planLimit != 0 else { continue }
      // Missing, negative, or above the limit: not the usage counter we assume.
      guard let used = ProviderJSON.finiteOrNil(data[spec.counterField]), used >= 0, used <= planLimit else {
        throw ProviderReadError.missingField(spec.counterField)
      }
      let lots = spec.topUpField.map { sumTopUps(topUps?[$0]) } ?? (remaining: 0, amount: 0)
      var pool = spec.pool
      pool.cap = planLimit + lots.amount
      balances.append(PoolBalance(pool: pool, balance: planLimit - used + lots.remaining))
    }
    guard !balances.isEmpty else { throw ProviderReadError.missingField("plan") }
    return balances
  }

  /// A lot whose `remaining` or `amount` is not a number is skipped whole, so
  /// remaining never outgrows the cap. `expiresAt` is ignored: the schema says
  /// the list holds only valid top-ups.
  static func sumTopUps(_ lots: Any?) -> (remaining: Double, amount: Double) {
    var total = (remaining: 0.0, amount: 0.0)
    for case let lot as [String: Any] in (lots as? [Any]) ?? [] {
      guard let remaining = ProviderJSON.finiteOrNil(lot["remaining"]),
            let amount = ProviderJSON.finiteOrNil(lot["amount"]) else { continue }
      total.remaining += remaining
      total.amount += amount
    }
    return total
  }
}
