import Foundation

/// A fixed stack seeded straight into in-memory stores: connections with their
/// last readings, local history, and a transport that answers each
/// connection's provider with its seeded balances, so a launch check lands on
/// the same numbers (QUO-144, QUO-212, QUO-51). Part of `Scenarios` (QUO-313).
public struct StackScenario: Sendable {
  public let connections: [Connection]
  public let history: ReadingHistory
  /// The connection whose checks answer 503.
  public let failingID: String?

  /// The fixtures cycle through the five original providers (the ones with
  /// bundled logos and scripted bodies), not the whole catalog.
  public static let fixtureProviders: [ProviderID] = [.openrouter, .hunter, .tavily, .apollo, .prospeo]

  public init(connections: [Connection], failingID: String? = nil, burn: [Double]? = nil, history: Bool = true) {
    self.connections = connections
    self.failingID = failingID
    self.history = history ? Self.history(connections, burn: burn) : ReadingHistory()
  }

  @MainActor
  public func service() -> MonitoringService {
    let store = InMemoryConnectionStore()
    let history = InMemoryReadingHistoryStore()
    let credentials = InMemoryCredentialStore()
    do {
      try store.save(connections)
      try history.save(self.history)
      for connection in connections {
        try credentials.save(connection.id, ref: connection.credentialRef)
      }
    } catch {
      preconditionFailure("Cannot seed in-memory snapshot stack: \(error)")
    }
    return MonitoringService(
      credentials: credentials, store: store, history: history,
      transport: StackTransport(connections: connections, failingID: failingID),
      now: { Scenarios.checkedAt }
    )
  }
}

extension StackScenario {
  /// 1, 8 and 50 connections (QUO-144); any count for `--design-preview`.
  /// Eight: two low, one critical, one failing, one balance unmonitored.
  /// Fifty: two critical, three low, every fixture provider at least twice.
  public static func stack(count: Int) -> StackScenario {
    StackScenario(connections: connections(count: count), failingID: count == 8 ? "stack-8-6" : nil)
  }

  /// The inspector's three local-history states (QUO-271). Connection 0 burns
  /// (a declining week), 1 has a flat week (no consumption observed), 2 has
  /// no history at all (collecting).
  public static var historyStates: StackScenario {
    StackScenario(connections: connections(count: 3, plainNames: true), burn: [1.4, 0, -1])
  }

  /// Website hero and launch gallery (QUO-212), and the `--demo` stack: the
  /// five fixture providers under their plain names, Hunter critical and
  /// Apollo low, nothing failing. Burn per week as a share of the balance, so
  /// the ETA agrees with the colour: Hunter ~2 days, Apollo ~5 days, the
  /// healthy ones weeks out.
  public static var showcase: StackScenario {
    let risks: [PoolStatus] = [.healthy, .critical, .healthy, .low, .healthy]
    return StackScenario(
      connections: connections(count: risks.count, risks: risks, plainNames: true), burn: [0.33, 3.5, 0.2, 1.4, 0.3]
    )
  }

  /// Website hero (QUO-213): three recognisable tools from three categories,
  /// Apollo critical, OpenRouter and Apify low, nothing failing.
  /// `StackTransport` scripts Apify's two bodies too.
  public static var showcaseSite: StackScenario {
    // (provider, first-pool balance, first-pool cap); other pools stay healthy.
    let specs: [(ProviderID, Double, Double?)] = [(.apollo, 250, 10_000), (.openrouter, 12.5, nil), (.apify, 12.5, 49)]
    let connections = specs.enumerated().map { index, spec in
      let (provider, balance, cap) = spec
      let balances = provider.pools.enumerated().map { offset, template in
        var pool = template
        pool.cap = offset == 0 ? cap : 10_000
        return PoolBalance(pool: pool, balance: offset == 0 ? balance : provider.defaultSettings.low * 3 + Double(offset * 13))
      }
      return Connection(
        id: "site-\(index)", provider: provider, name: provider.displayName, credentialRef: "site-\(index)",
        lastReading: Reading(balances: balances, checkedAt: Scenarios.checkedAt)
      )
    }
    return StackScenario(connections: connections, burn: [3.5, 1.4, 1.4])
  }

  /// QUO-160: Hunter balances that raise no alert yet are not all healthy.
  /// Searches stay healthy; verifications are healthy, unknown, low and
  /// empty with monitoring off, and not in plan. With `alerting`, one
  /// monitored low balance also fills Needs attention. No history.
  public static func quietTruth(alerting: Bool) -> StackScenario {
    var mutedLow = ProviderID.hunter.defaultSettings
    mutedLow.monitored = false
    var cases: [(String, Double?, Double, PoolSettings?)] = [
      ("Acorn", 4000, 10_000, nil), // healthy only
      ("Birch", nil, 10_000, nil), // verifications not reported: unknown
      ("Cedar", 1000, 10_000, mutedLow), // low, monitoring off
      ("Dune", 0, 10_000, mutedLow), // empty, monitoring off
      ("Elm", 0, 0, nil), // verifications not in plan
    ]
    if alerting { cases.append(("Fern", 1000, 10_000, nil)) }
    let connections = cases.enumerated().map { index, item in
      let (name, verifications, cap, settings) = item
      let id = "truth-\(index)"
      var searches = ProviderID.hunter.pools[0]
      searches.cap = 10_000
      var balances = [PoolBalance(pool: searches, balance: 4000)]
      if let verifications {
        var pool = ProviderID.hunter.pools[1]
        pool.cap = cap
        balances.append(PoolBalance(pool: pool, balance: verifications))
      }
      return Connection(
        id: id, provider: .hunter, name: "\(name) Hunter", credentialRef: id,
        lastReading: Reading(balances: balances, checkedAt: Scenarios.checkedAt),
        poolSettings: settings.map { [ProviderID.hunter.pools[1].creditType: $0] } ?? [:]
      )
    }
    return StackScenario(connections: connections, history: false)
  }

  /// QUO-265: a two-balance Hunter whose second balance is the only low one,
  /// so a panel row must open its own balance, not the connection's top one.
  public static func twoBalanceHunter(checkedAt: Date) -> Connection {
    var searches = ProviderID.hunter.pools[0]
    searches.cap = 10_000
    var verifications = ProviderID.hunter.pools[1]
    verifications.cap = 10_000
    return Connection(
      id: "exact-row", provider: .hunter, name: "Exact row", credentialRef: "exact-row",
      lastReading: Reading(
        balances: [PoolBalance(pool: searches, balance: 9000), PoolBalance(pool: verifications, balance: 1)],
        checkedAt: checkedAt)
    )
  }

  /// QUO-51: the recordable showcase stack, time anchored at `now`.
  /// In-memory stores and scripted provider responses, no network.
  @MainActor
  public static func demo(now: Date = Date()) -> StackScenario {
    Scenarios.checkedAt = now
    return showcase
  }

  /// A week of six-hourly checks for each connection's first pool (QUO-186),
  /// declining to the seeded balance so the launch check lands on it. The
  /// multiplier cycles through the ETA bands; other pools stay history-free
  /// and show the fresh-install "no burn yet" state.
  private static func history(_ connections: [Connection], burn: [Double]? = nil) -> ReadingHistory {
    var history = ReadingHistory()
    let extra = burn ?? [1.1, 0.2, 2.8, 0.5, 14.0]
    for (index, connection) in connections.enumerated() {
      guard let first = connection.lastReading?.balances.first else { continue }
      let k = extra[index % extra.count]
      if k < 0 { continue }  // QUO-271: a negative multiplier keeps this connection history-free
      for step in 1...28 {
        let age = Double(29 - step) * 6 * 3600
        let balance = first.balance * (1 + k * age / (7 * 86_400))
        history.append(
          Reading(balances: [PoolBalance(pool: first.pool, balance: balance)], checkedAt: Scenarios.checkedAt.addingTimeInterval(-age)),
          connectionID: connection.id
        )
      }
    }
    return history
  }

  private static func connections(count: Int, risks: [PoolStatus]? = nil, plainNames: Bool = false) -> [Connection] {
    let names = ["Acorn", "Birch", "Cedar", "Dune", "Elm", "Fern", "Grove", "Harbor", "Iris", "Juniper"]
    return (0..<count).map { index in
      let provider = fixtureProviders[index % fixtureProviders.count]
      let id = "stack-\(count)-\(index)"
      let risk: PoolStatus
      if let risks {
        risk = risks[index]
      } else if count == 8 {
        risk = index == 5 ? .critical : ([1, 3].contains(index) ? .low : .healthy)
      } else if count == 50 {
        risk = [17, 43].contains(index) ? .critical : ([7, 29, 38].contains(index) ? .low : .healthy)
      } else {
        risk = .healthy
      }
      let balances = provider.pools.enumerated().map { offset, template in
        var pool = template
        let settings = provider.defaultSettings
        if provider != .openrouter { pool.cap = 10_000 }
        let balance: Double
        if offset == 0 && risk == .critical { balance = settings.critical / 2 }
        else if offset == 0 && risk == .low { balance = (settings.low + settings.critical) / 2 }
        else { balance = settings.low * 3 + Double(index * 7 + offset * 13) }
        return PoolBalance(pool: pool, balance: balance)
      }
      var settings: [String: PoolSettings] = [:]
      if count == 8 && index == 7, let first = balances.first {
        var unmonitored = provider.defaultSettings
        unmonitored.monitored = false
        settings[first.pool.creditType] = unmonitored
      }
      return Connection(
        id: id, provider: provider,
        name: plainNames ? provider.displayName : "\(names[index % names.count]) \(provider.displayName) \(index / names.count + 1)",
        credentialRef: id, lastReading: Reading(balances: balances, checkedAt: Scenarios.checkedAt),
        poolSettings: settings
      )
    }
  }
}

/// Answers each provider read with the connection's seeded balances, found by
/// the key (the connection id) in its auth header.
final class StackTransport: ProviderTransport {
  let connections: [Connection]
  let failingID: String?

  init(connections: [Connection], failingID: String?) {
    self.connections = connections
    self.failingID = failingID
  }

  /// Provider reads only: a GET or a documented POST read; anything else fails like no network.
  func send(_ request: HTTPRequest) async throws -> HTTPResponse {
    guard request.method == "GET" || request.method == "POST" else { throw TransportFailure() }
    return try response(request.url, headers: request.headers)
  }

  private func response(_ url: URL, headers: [String: String]) throws -> HTTPResponse {
    let key = headers["x-api-key"] ?? headers["X-KEY"]
      ?? headers["Authorization"]?.replacingOccurrences(of: "Bearer ", with: "")
    guard let connection = connections.first(where: { $0.id == key }) else {
      return HTTPResponse(status: 401, body: Data())
    }
    if connection.id == failingID { return HTTPResponse(status: 503, body: Data()) }
    let balances = connection.lastReading!.balances
    let body: [String: Any]
    switch connection.provider {
    case .openrouter:
      body = ["data": ["total_credits": balances[0].balance, "total_usage": 0]]
    case .hunter:
      body = ["data": ["requests": Dictionary(uniqueKeysWithValues: balances.map {
        ($0.pool.creditType, ["available": $0.pool.cap!, "used": $0.pool.cap! - $0.balance])
      })]]
    case .tavily:
      var account: [String: Double] = [:]
      for balance in balances {
        account["\(balance.pool.creditType)_limit"] = balance.pool.cap!
        account["\(balance.pool.creditType)_usage"] = balance.pool.cap! - balance.balance
      }
      body = ["account": account]
    case .apollo:
      body = ["credit_usage_stats": Dictionary(uniqueKeysWithValues: balances.map {
        ($0.pool.creditType, ["limit": $0.pool.cap!, "left_over": $0.balance])
      })]
    case .prospeo:
      body = ["response": ["remaining_credits": balances[0].balance,
                            "used_credits": balances[0].pool.cap! - balances[0].balance]]
    case .apify: // the plan's included credit, then the usage this cycle
      body = url == Apify.meURL
        ? ["data": ["plan": ["monthlyUsageCreditsUsd": balances[0].pool.cap!]]]
        : ["data": ["current": ["monthlyUsageUsd": balances[0].pool.cap! - balances[0].balance]]]
    default:
      return HTTPResponse(status: 404, body: Data())
    }
    return HTTPResponse(status: 200, body: try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys]))
  }
}
