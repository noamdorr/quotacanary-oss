import Foundation

/// Port of src/lib/adapters/treg.ts. Read-only: two GETs per check. The
/// balance route takes the integer org id in the path, and `/auth/me` names
/// the org the key belongs to (QUO-423), so the key alone is the credential.
/// A secret saved before that is the two-field JSON; its `api_token` is used
/// and its `org_id` ignored. The token goes in X-Treg-Token (Bearer is a 401).
/// Only `balance_usd` is read; the body also carries a ledger page.
public enum Treg: HandWrittenProvider {
  public static let id: ProviderID = .treg
  public static let name = "treg"
  public static let topupURL = "https://treg.to/app"
  // treg's seed row (migration 098): critical 5, low 15.
  public static let defaultSettings = PoolSettings(monitored: true, low: 15, critical: 5)

  public static let balancePool = Pool(creditType: "balance", label: Copy.tregBalancePoolLabel, unit: .usd, cap: nil)
  public static let pools = [balancePool]

  static let meURL = URL(string: "https://treg.to/auth/me")!

  public static func balanceURL(orgID: Int) -> URL {
    URL(string: "https://treg.to/orgs/\(orgID)/balance")!
  }

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    // A blank key is never sent anywhere.
    let apiToken = token(key)
    guard !apiToken.isEmpty else { throw ProviderReadError.keyRejected }
    let headers = ["Accept": "application/json", "X-Treg-Token": apiToken]
    let orgID = try parseMe(try await get(meURL, headers, transport))
    return try parse(try await get(balanceURL(orgID: orgID), headers, transport))
  }

  /// The org id `/auth/me` names for this key.
  public static func parseMe(_ response: HTTPResponse) throws -> Int {
    let me = try json(response)
    // A JSON true bridges to 1, so booleans are refused by type, as in ProviderJSON.
    guard let number = me["org_id"] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
          let orgID = Int(exactly: number.doubleValue), orgID > 0 else {
      throw ProviderReadError.guidance(.tregNotTiedToATeam)
    }
    return orgID
  }

  public static func parse(_ response: HTTPResponse) throws -> [PoolBalance] {
    guard let usd = ProviderJSON.finiteOrNil(try json(response)["balance_usd"]) else {
      throw ProviderReadError.missingField("balance_usd")
    }
    return [PoolBalance(pool: balancePool, balance: usd)]
  }

  /// The key itself, or the `api_token` of a two-field secret saved before QUO-423.
  static func token(_ key: String) -> String {
    if let data = key.data(using: .utf8),
       let record = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
      return (record["api_token"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
    return key.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func get(_ url: URL, _ headers: [String: String], _ transport: ProviderTransport) async throws
    -> HTTPResponse
  {
    do {
      return try await transport.get(url, headers: headers)
    } catch {
      throw ProviderReadError.unreachable
    }
  }

  private static func json(_ response: HTTPResponse) throws -> [String: Any] {
    if response.status == 401 { throw ProviderReadError.keyRejected }
    // A token with no pinned team (400), one that may not read this org (403),
    // or an org that is gone (404).
    if [400, 403, 404].contains(response.status) {
      throw ProviderReadError.guidance(.tregNotTiedToATeam)
    }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    return json as? [String: Any] ?? [:]
  }
}
