import Foundation

/// Port of src/lib/adapters/dataforseo.ts. Read-only: one GET per check.
/// DataForSEO authenticates with HTTP Basic over two values (API login and
/// API password), so the stored secret is the two-field JSON
/// (`CredentialFields`). One pool, the prepaid account balance in US dollars.
public enum DataForSEO: HandWrittenProvider {
  public static let id: ProviderID = .dataforseo
  public static let name = "DataForSEO"
  public static let topupURL = "https://app.dataforseo.com/"
  // DataForSEO's seed row: critical 25, low 75, dollars.
  public static let defaultSettings = PoolSettings(monitored: true, low: 75, critical: 25)

  public static let userDataURL = URL(string: "https://api.dataforseo.com/v3/appendix/user_data")!

  public static let fields = [
    CredentialField(name: "login", label: Copy.apiLoginLabel, isSecret: false),
    CredentialField(name: "password", label: Copy.apiPasswordLabel, isSecret: true),
  ]

  public static let balancePool = Pool(
    creditType: "balance", label: Copy.accountBalancePoolLabel, unit: .usd, cap: nil
  )
  public static let pools = [balancePool]

  /// DataForSEO's success code, at the top level and per task.
  static let ok = 20000

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    // A secret without both values is never sent anywhere.
    guard let (login, password) = CredentialFields.pair(key, "login", "password") else {
      throw ProviderReadError.keyRejected
    }
    let response: HTTPResponse
    do {
      response = try await transport.get(userDataURL, headers: ["Authorization": CredentialFields.basic(login, password)])
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
    // A 200 can still carry DataForSEO's own error code, at either level.
    try check(object)
    let task = (object?["tasks"] as? [Any])?.first as? [String: Any]
    try check(task)
    let result = (task?["result"] as? [Any])?.first as? [String: Any]
    guard let balance = ProviderJSON.finiteOrNil((result?["money"] as? [String: Any])?["balance"]) else {
      throw ProviderReadError.missingField("tasks.result.money.balance")
    }
    return [PoolBalance(pool: balancePool, balance: balance)]
  }

  private static func check(_ object: [String: Any]?) throws {
    guard let code = ProviderJSON.finiteOrNil(object?["status_code"]), code != 0, code != Double(ok) else { return }
    throw ProviderReadError.reportedError(object?["status_message"] as? String)
  }
}
