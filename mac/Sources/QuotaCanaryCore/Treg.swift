import Foundation

/// Port of src/lib/adapters/treg.ts. Read-only: one GET per check. The balance
/// route takes the integer org id in the path (a slug answers 422), so the org
/// ID is a second value beside the token; the stored secret is the two-field
/// JSON (`CredentialFields`). The token goes in X-Treg-Token (Bearer is a 401).
/// Only `balance_usd` is read; the body also carries a ledger page.
public enum Treg: HandWrittenProvider {
  public static let id: ProviderID = .treg
  public static let name = "treg"
  public static let topupURL = "https://treg.to/app"
  // treg's seed row (migration 098): critical 5, low 15.
  public static let defaultSettings = PoolSettings(monitored: true, low: 15, critical: 5)

  public static let fields = [
    CredentialField(name: "api_token", label: Copy.apiTokenLabel, isSecret: true),
    CredentialField(name: "org_id", label: Copy.tregOrgIDLabel, isSecret: false),
  ]

  public static let balancePool = Pool(creditType: "balance", label: Copy.tregBalancePoolLabel, unit: .usd, cap: nil)
  public static let pools = [balancePool]

  public static func balanceURL(orgID: String) -> URL {
    URL(string: "https://treg.to/orgs/\(CredentialFields.pathSegment(orgID))/balance")!
  }

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    // A secret without both values is never sent anywhere.
    guard let (apiToken, orgID) = CredentialFields.pair(key, "api_token", "org_id") else {
      throw ProviderReadError.keyRejected
    }
    let response: HTTPResponse
    do {
      response = try await transport.get(
        balanceURL(orgID: orgID), headers: ["Accept": "application/json", "X-Treg-Token": apiToken]
      )
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parse(response)
  }

  public static func parse(_ response: HTTPResponse) throws -> [PoolBalance] {
    if response.status == 401 { throw ProviderReadError.keyRejected }
    // A slug for the id (422), an unknown org (404), an identity token with no
    // pinned org (400), or a token that may not read this org (403).
    if [400, 403, 404, 422].contains(response.status) {
      throw ProviderReadError.reportedError(Copy.tregOrgNotReadable)
    }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    guard let balance = ProviderJSON.finiteOrNil((json as? [String: Any])?["balance_usd"]) else {
      throw ProviderReadError.missingField("balance_usd")
    }
    return [PoolBalance(pool: balancePool, balance: balance)]
  }
}
