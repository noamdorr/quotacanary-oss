import Foundation

/// Port of src/lib/adapters/thecompaniesapi.ts. Read-only: one GET per check.
/// Credits belong to a team, and no endpoint lists a token's teams, so the
/// team ID is a second value the user copies from the dashboard; the stored
/// secret is the two-field JSON (`CredentialFields`). The raw token follows
/// "Basic", as the vendor documents it (not base64 of user:password). A 403 or
/// 404 means this token has no team with that ID, which the web words apart
/// from a rejected token.
public enum TheCompaniesAPI: HandWrittenProvider {
  public static let id: ProviderID = .thecompaniesapi
  public static let name = "The Companies API"
  public static let topupURL = "https://www.thecompaniesapi.com/pricing"
  // The Companies API's seed row (migration 094): critical 100, low 300.
  public static let defaultSettings = PoolSettings(monitored: true, low: 300, critical: 100)

  public static let fields = [
    CredentialField(name: "api_token", label: Copy.apiTokenLabel, isSecret: true),
    CredentialField(name: "team_id", label: Copy.theCompaniesAPITeamIDLabel, isSecret: false),
  ]

  public static let creditsPool = Pool(creditType: "credits", label: Copy.creditsPoolLabel, unit: .credits, cap: nil)
  public static let pools = [creditsPool]

  public static func teamURL(teamID: String) -> URL {
    URL(string: "https://api.thecompaniesapi.com/v2/teams/\(CredentialFields.pathSegment(teamID))")!
  }

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    // A secret without both values is never sent anywhere.
    guard let (apiToken, teamID) = CredentialFields.pair(key, "api_token", "team_id") else {
      throw ProviderReadError.keyRejected
    }
    let response: HTTPResponse
    do {
      response = try await transport.get(
        teamURL(teamID: teamID), headers: ["Accept": "application/json", "Authorization": "Basic \(apiToken)"]
      )
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parse(response)
  }

  public static func parse(_ response: HTTPResponse) throws -> [PoolBalance] {
    if response.status == 401 { throw ProviderReadError.keyRejected }
    if response.status == 403 || response.status == 404 {
      throw ProviderReadError.reportedError(Copy.theCompaniesAPINoTeam)
    }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    guard let balance = ProviderJSON.finiteOrNil((json as? [String: Any])?["credits"]) else {
      throw ProviderReadError.missingField("credits")
    }
    return [PoolBalance(pool: creditsPool, balance: balance)]
  }
}
