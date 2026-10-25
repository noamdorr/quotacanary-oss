import Foundation

/// Port of src/lib/adapters/twilio.ts. Read-only: one GET per check.
/// Twilio authenticates with HTTP Basic over two values (Account SID as
/// username, Auth token as password) and puts the Account SID in the path,
/// so the stored secret is the two-field JSON (`CredentialFields`). One pool,
/// the account balance in US dollars.
public enum Twilio: HandWrittenProvider {
  public static let id: ProviderID = .twilio
  public static let name = "Twilio"
  public static let topupURL = "https://console.twilio.com/us1/billing/manage-billing/billing-overview"
  // Twilio's seed row: critical 5, low 15, dollars.
  public static let defaultSettings = PoolSettings(monitored: true, low: 15, critical: 5)

  public static let fields = [
    CredentialField(name: "account_sid", label: Copy.twilioAccountSIDLabel, isSecret: false),
    CredentialField(name: "auth_token", label: Copy.authTokenLabel, isSecret: true),
  ]

  public static let balancePool = Pool(
    creditType: "balance", label: Copy.balanceUSDPoolLabel, unit: .usd, cap: nil
  )
  public static let pools = [balancePool]

  public static func balanceURL(accountSID: String) -> URL {
    URL(string: "https://api.twilio.com/2010-04-01/Accounts/\(CredentialFields.pathSegment(accountSID))/Balance.json")!
  }

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    // A secret without both values is never sent anywhere.
    guard let (accountSID, authToken) = CredentialFields.pair(key, "account_sid", "auth_token") else {
      throw ProviderReadError.keyRejected
    }
    let response: HTTPResponse
    do {
      response = try await transport.get(
        balanceURL(accountSID: accountSID),
        headers: ["Accept": "application/json", "Authorization": CredentialFields.basic(accountSID, authToken)]
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
    // The pool is labeled USD; a balance in another currency would be
    // mislabeled, so it reads as unexpected until a currency unit exists.
    if let currency = object?["currency"], !(currency is NSNull), currency as? String != "USD" {
      throw ProviderReadError.missingField("currency")
    }
    // `balance` is a decimal string ("0.05"). Subaccounts carry no balance,
    // which lands here too.
    guard let balance = ProviderJSON.finiteOrNil(object?["balance"]) else {
      throw ProviderReadError.missingField("balance")
    }
    return [PoolBalance(pool: balancePool, balance: balance)]
  }
}
