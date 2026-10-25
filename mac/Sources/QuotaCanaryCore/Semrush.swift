import Foundation

/// Port of src/lib/adapters/semrush.ts. Read-only: one GET per check.
/// SECURITY: Semrush's countapiunits call supports only query-string key
/// auth, so the key can surface in vendor request logs, the same residual
/// exposure as the web. The body is plain text, not JSON: its first non-empty
/// line, commas stripped, is the unit count. One pool, no cap.
public enum Semrush: HandWrittenProvider {
  public static let id: ProviderID = .semrush
  public static let name = "Semrush"
  public static let topupURL = "https://www.semrush.com/billing-admin/profile/subscription/api-units"
  // Semrush's seed row: critical 1000, low 3000.
  public static let defaultSettings = PoolSettings(monitored: true, low: 3000, critical: 1000)

  public static let unitsPool = Pool(creditType: "units", label: Copy.semrushUnitsPoolLabel, unit: .credits, cap: nil)
  public static let pools = [unitsPool]

  /// The key escaped like the web's `encodeURIComponent`.
  public static func balanceURL(key: String) -> URL {
    URL(string: "https://www.semrush.com/users/countapiunits.html?key=\(CredentialFields.pathSegment(key))")!
  }

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.get(
        balanceURL(key: key), headers: ["Accept": "text/csv, text/plain;q=0.9, application/json;q=0.8"]
      )
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parse(response)
  }

  public static func parse(_ response: HTTPResponse) throws -> [PoolBalance] {
    // Semrush answers a bad key with 400 as well as 401/403.
    if [400, 401, 403].contains(response.status) { throw ProviderReadError.keyRejected }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    let text = String(decoding: response.body, as: UTF8.self)
    let firstLine = text.split(whereSeparator: \.isNewline)
      .map { $0.trimmingCharacters(in: .whitespaces) }
      .first { !$0.isEmpty }
    guard let firstLine, let balance = ProviderJSON.finiteOrNil(firstLine.replacingOccurrences(of: ",", with: "")) else {
      throw ProviderReadError.missingField("units")
    }
    return [PoolBalance(pool: unitsPool, balance: balance)]
  }
}
