import Foundation

/// Port of src/lib/adapters/icypeas.ts. Read-only: one POST per check, the
/// endpoint Icypeas documents for subscription information. The key goes in
/// `Authorization` with no scheme, and the key owner's account email goes in
/// the JSON body, so the stored secret is the two-field JSON
/// (`CredentialFields`). One pool, `credits`. Icypeas answers a validation
/// failure (an email that does not match the key) with a 200 and
/// `success: false`.
public enum Icypeas: HandWrittenProvider {
  public static let id: ProviderID = .icypeas
  public static let name = "Icypeas"
  public static let topupURL = "https://www.icypeas.com/pricing"
  // Icypeas's seed row (migration 094): critical 100, low 300.
  public static let defaultSettings = PoolSettings(monitored: true, low: 300, critical: 100)

  public static let fields = [
    CredentialField(name: "api_key", label: Copy.apiKeyLabel, isSecret: true),
    CredentialField(name: "email", label: Copy.icypeasEmailLabel, isSecret: false),
  ]

  public static let subscriptionURL = URL(string: "https://app.icypeas.com/api/a/actions/subscription-information")!

  public static let creditsPool = Pool(creditType: "credits", label: Copy.creditsPoolLabel, unit: .credits, cap: nil)
  public static let pools = [creditsPool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    // A secret without both values is never sent anywhere.
    guard let (apiKey, email) = CredentialFields.pair(key, "api_key", "email") else {
      throw ProviderReadError.keyRejected
    }
    let body = try? JSONSerialization.data(withJSONObject: ["email": email], options: [.withoutEscapingSlashes])
    let response: HTTPResponse
    do {
      response = try await transport.post(
        subscriptionURL,
        headers: ["Accept": "application/json", "Content-Type": "application/json", "Authorization": apiKey],
        body: body
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
    let object = json as? [String: Any]
    if object?["success"] as? Bool == false { throw ProviderReadError.reportedError(Copy.icypeasEmailNotAccepted) }
    guard let balance = ProviderJSON.finiteOrNil(object?["credits"]) else {
      throw ProviderReadError.missingField("credits")
    }
    return [PoolBalance(pool: creditsPool, balance: balance)]
  }
}
