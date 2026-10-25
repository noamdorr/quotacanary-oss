import Foundation

/// Port of src/lib/adapters/majestic.ts. Read-only: one POST per check (the
/// docs advise POST, and it keeps the key out of the URL). Majestic answers
/// every failure with HTTP 200 and a non-"OK" `Code`, and its `ErrorMessage`
/// ECHOES THE SUBMITTED KEY, so it is never surfaced: the error is mapped from
/// `Code` alone. Three pools, the remaining unit totals, no caps.
public enum Majestic: HandWrittenProvider {
  public static let id: ProviderID = .majestic
  public static let name = "Majestic"
  public static let topupURL = "https://majestic.com/plans-pricing"
  // Majestic's seed row: critical 10000, low 30000.
  public static let defaultSettings = PoolSettings(monitored: true, low: 30000, critical: 10000)

  public static let apiURL = URL(string: "https://api.majestic.com/api/json")!

  public static let analysisPool = Pool(
    creditType: "analysis_units", label: Copy.majesticAnalysisPoolLabel, unit: .credits, cap: nil
  )
  public static let retrievalPool = Pool(
    creditType: "retrieval_units", label: Copy.majesticRetrievalPoolLabel, unit: .credits, cap: nil
  )
  public static let indexItemInfoPool = Pool(
    creditType: "index_item_info_units", label: Copy.majesticIndexItemInfoPoolLabel, unit: .credits, cap: nil
  )
  public static let pools = [analysisPool, retrievalPool, indexItemInfoPool]

  /// Each pool and the response field it reads.
  private static let fieldsByPool: [(Pool, String)] = [
    (analysisPool, "TotalAnalysisResUnits"), (retrievalPool, "TotalRetrievalResUnits"),
    (indexItemInfoPool, "TotalIndexItemInfoResUnits"),
  ]

  /// Codes that mean the key itself is wrong or missing.
  static let keyCodes: Set<String> = ["AuthenticationFailed", "AuthenticationRequired", "FailedAuth"]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.post(
        apiURL,
        headers: ["Content-Type": "application/x-www-form-urlencoded"],
        body: requestBody(key: key)
      )
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parse(response)
  }

  /// The form body `URLSearchParams` builds on the web.
  static func requestBody(key: String) -> Data {
    let pairs = [("app_api_key", key), ("cmd", "GetSubscriptionInfo")]
    return Data(pairs.map { "\(formEncode($0.0))=\(formEncode($0.1))" }.joined(separator: "&").utf8)
  }

  /// application/x-www-form-urlencoded: space as `+`, `*-._` and
  /// alphanumerics kept, everything else percent-encoded.
  private static func formEncode(_ value: String) -> String {
    let kept = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789*-._ ")
    return (value.addingPercentEncoding(withAllowedCharacters: kept) ?? value).replacingOccurrences(of: " ", with: "+")
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
    guard let code = object?["Code"] as? String else { throw ProviderReadError.missingField("Code") }
    if code != "OK" { throw codeError(code, message: object?["ErrorMessage"]) }
    var balances: [PoolBalance] = []
    for (pool, field) in fieldsByPool {
      guard let balance = ProviderJSON.finiteOrNil(object?[field]) else { continue }
      balances.append(PoolBalance(pool: pool, balance: balance))
    }
    guard !balances.isEmpty else { throw ProviderReadError.missingField("TotalAnalysisResUnits") }
    return balances
  }

  /// Reads `ErrorMessage` only to spot a bad key; never passes it on.
  private static func codeError(_ code: String, message: Any?) -> ProviderReadError {
    if keyCodes.contains(code) { return .keyRejected }
    if code == "FailedRequestViaAPI", let message = message as? String,
       message.range(of: "api key", options: .caseInsensitive) != nil {
      return .keyRejected
    }
    // A plain word code is a vendor enum, safe to name; anything else is not.
    let isWord = !code.isEmpty && code.unicodeScalars.allSatisfy { ("A"..."Z").contains($0) || ("a"..."z").contains($0) }
    return .reportedError(isWord ? Copy.majesticReturned(code) : nil)
  }
}
