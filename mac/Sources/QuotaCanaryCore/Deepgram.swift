import Foundation

/// Port of src/lib/adapters/deepgram.ts. Read-only: one GET for the project
/// list, then one GET per project for its balances, sequentially, so the first
/// failure stops the read. One pool per project, keyed by the discovered
/// project id (never by position), summed over its USD balances.
public enum Deepgram: HandWrittenProvider {
  public static let id: ProviderID = .deepgram
  public static let name = "Deepgram"
  public static let topupURL = "https://deepgram.com/pricing"
  // Deepgram's seed row: critical 5, low 15 (3x), dollars on every project.
  public static let defaultSettings = PoolSettings(monitored: true, low: 15, critical: 5)

  public static let projectsURL = URL(string: "https://api.deepgram.com/v1/projects")!

  /// A key belongs to one project, so seeing more than a handful is rare. The
  /// cap keeps one check from fanning out; projects past it (in list order)
  /// are not read.
  public static let maxProjects = 10

  /// Empty: the pools are discovered from each reading (like Apollo's extras,
  /// `Connection.poolRows` appends every reported pool), so there is no fixed
  /// list, and a placeholder would show as a permanently unknown row.
  public static let pools: [Pool] = []

  /// encodeURIComponent's unreserved set, so the path matches the web adapter.
  static let idAllowed = CharacterSet(
    charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()"
  )

  struct Project: Equatable {
    let id: String
    let name: String
  }

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let headers = ["Authorization": "Token \(key)", "Accept": "application/json"]
    let projects = try parseProjects(try await get(projectsURL, headers: headers, transport: transport))

    var balances: [PoolBalance] = []
    for project in projects {
      guard let encoded = project.id.addingPercentEncoding(withAllowedCharacters: idAllowed),
            let url = URL(string: "\(projectsURL.absoluteString)/\(encoded)/balances") else {
        throw ProviderReadError.missingField("projects.project_id")
      }
      guard let total = try parseBalances(try await get(url, headers: headers, transport: transport)) else {
        continue  // No purchased balance on this project.
      }
      let label = project.name.isEmpty ? String(project.id.prefix(8)) : project.name
      balances.append(PoolBalance(
        pool: Pool(creditType: "project:\(project.id)", label: label, unit: .usd, cap: nil), balance: total
      ))
    }
    guard !balances.isEmpty else { throw ProviderReadError.missingField("balances") }
    return balances
  }

  static func get(_ url: URL, headers: [String: String], transport: ProviderTransport) async throws -> HTTPResponse {
    do {
      return try await transport.get(url, headers: headers)
    } catch {
      throw ProviderReadError.unreachable
    }
  }

  /// On a balances call, 401/403 means a key without billing:read; the fix is
  /// the same new key, so it maps to the same error.
  static func checkStatus(_ response: HTTPResponse) throws -> Any {
    if response.status == 401 || response.status == 403 { throw ProviderReadError.keyRejected }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    return json
  }

  /// The first `maxProjects` projects in list order. An entry without a
  /// `project_id` fails the read.
  static func parseProjects(_ response: HTTPResponse) throws -> [Project] {
    guard let list = (try checkStatus(response) as? [String: Any])?["projects"] as? [Any] else {
      throw ProviderReadError.missingField("projects")
    }
    return try list.prefix(maxProjects).map { entry in
      let record = entry as? [String: Any]
      guard let id = record?["project_id"] as? String,
            !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        throw ProviderReadError.missingField("projects.project_id")
      }
      let name = (record?["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      return Project(id: id, name: name)
    }
  }

  /// The project's USD total, or nil when it has no balance entries. Money in
  /// another unit, or a missing amount, fails the read: never dropped, never 0.
  static func parseBalances(_ response: HTTPResponse) throws -> Double? {
    guard let list = (try checkStatus(response) as? [String: Any])?["balances"] as? [Any] else {
      throw ProviderReadError.missingField("balances")
    }
    if list.isEmpty { return nil }
    var total = 0.0
    for entry in list {
      let record = entry as? [String: Any]
      guard (record?["units"] as? String)?.lowercased() == "usd" else {
        throw ProviderReadError.missingField("balances.units")
      }
      guard let amount = ProviderJSON.finiteOrNil(record?["amount"]) else {
        throw ProviderReadError.missingField("balances.amount")
      }
      total += amount
    }
    return total
  }
}
