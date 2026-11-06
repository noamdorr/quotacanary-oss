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

  init(connections: [Connection], failingID: String? = nil, readings: ReadingHistory) {
    self.connections = connections
    self.failingID = failingID
    self.history = readings
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

  /// The run-out time's evidence rules (QUO-444), one inspector each: 0 has
  /// two checks five minutes apart (collecting), 1 a steady week whose newest
  /// reading is three days old because its checks fail (no estimate), 2 a
  /// flat week with one odd reading (not draining), 3 a 0.1% dip over a week
  /// (a sparkline that stays flat).
  public static var runOutEvidence: StackScenario {
    let connections = connections(count: 4, plainNames: true)
    var readings = ReadingHistory()
    func add(_ index: Int, _ balance: Double, ago: TimeInterval) {
      guard let first = connections[index].lastReading?.balances.first else { return }
      readings.append(
        Reading(balances: [PoolBalance(pool: first.pool, balance: balance)], checkedAt: Scenarios.checkedAt.addingTimeInterval(-ago)),
        connectionID: connections[index].id
      )
    }
    func base(_ index: Int) -> Double { connections[index].lastReading?.balances.first?.balance ?? 0 }
    add(0, base(0) * 1.005, ago: 300)
    add(0, base(0), ago: 0)
    for step in 0...27 { add(1, base(1) * (1 + 0.4 * Double(27 - step) / 27), ago: 3 * 86_400 + Double(27 - step) * 6 * 3600) }
    for day in 0...7 { add(2, day == 4 ? base(2) * 10 : base(2), ago: Double(7 - day) * 86_400) }
    for step in 0...27 { add(3, base(3) * (1 + 0.001 * Double(27 - step) / 27), ago: Double(27 - step) * 6 * 3600) }
    return StackScenario(connections: connections, failingID: connections[1].id, readings: readings)
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

  /// Website hero (QUO-213, QUO-401): eight recognisable tools, mostly GTM
  /// with two for AI builders. Clay, Apollo and OpenRouter low, the rest
  /// healthy; nothing red, nothing failing, so the bird is gold.
  /// `StackTransport` scripts Apify's two bodies too. QUO-406: Apollo's low
  /// pool is AI Credits out of 2,000, the combination that fits the
  /// 380-point panel untruncated ("Lead Credits" beside "in ~2 days" and
  /// "900 / 10,000" read "Le...dits").
  /// Render the site export with `-AppleLocale en_US`: "US$" on a non-US Mac
  /// truncates Apify's label too.
  public static var showcaseSite: StackScenario {
    // (provider, low pool, its balance, its cap); other pools stay healthy.
    let specs: [(ProviderID, String?, Double, Double?)] = [
      (ProviderID("clay"), nil, 1_200, nil), (.apollo, "ai_credit", 900, 2_000), (.openrouter, nil, 12.5, nil),
      (ProviderID("instantly"), nil, 4_200, 5_000), (.lemlist, nil, 2_400, nil), (.prospeo, nil, 1_850, 2_000),
      (.apify, nil, 38, 49), (ProviderID("elevenlabs"), nil, 84_000, 100_000),
    ]
    let connections = specs.enumerated().map { index, spec in
      let (provider, focusType, balance, cap) = spec
      let focus = provider.pools.firstIndex { $0.creditType == focusType } ?? 0
      var balances = provider.pools.enumerated().map { offset, template in
        var pool = template
        pool.cap = offset == focus ? cap : 10_000
        return PoolBalance(pool: pool, balance: offset == focus ? balance : provider.defaultSettings.low * 3 + Double(offset * 13))
      }
      // The local history follows the first balance, so the low one leads.
      balances.insert(balances.remove(at: focus), at: 0)
      return Connection(
        id: "site-\(index)", provider: provider, name: provider.displayName, credentialRef: "site-\(index)",
        lastReading: Reading(balances: balances, checkedAt: Scenarios.checkedAt),
        // The hero's Apollo row stays low (QUO-406): it keeps the flat Warn below.
        poolSettings: focusType == "ai_credit" ? ["ai_credit": provider.defaultSettings] : [:]
      )
    }
    return StackScenario(connections: connections, burn: [7, 7, 1.4, 0.2, 0.2, 0.2, 0.2, 0.2])
  }

  /// QUO-441: five brand-new connections, each with its whole small allowance
  /// left. The default Warn below follows each cap, so nothing is low. No history.
  public static var smallPlans: StackScenario {
    let specs: [(ProviderID, Double)] = [(.hunter, 25), (.hunter, 50), (.prospeo, 75), (.tavily, 1000), (.apollo, 500)]
    let connections = specs.enumerated().map { index, spec in
      let (provider, cap) = spec
      var pool = provider.pools[0]
      pool.cap = cap
      let id = "small-\(index)"
      return Connection(
        id: id, provider: provider, name: "\(provider.displayName) \(Int(cap))", credentialRef: id,
        lastReading: Reading(balances: [PoolBalance(pool: pool, balance: cap)], checkedAt: Scenarios.checkedAt)
      )
    }
    return StackScenario(connections: connections, history: false)
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

  /// QUO-446: every balance healthy with monitoring off. Nothing is watched,
  /// so the quiet heading is the neutral one, not "All healthy". No history.
  public static var nothingMonitored: StackScenario {
    let connections = quietTruth(alerting: false).connections.prefix(2).map { connection in
      var connection = connection
      for row in connection.poolRows {
        var settings = row.settings
        settings.monitored = false
        connection.poolSettings[row.key.creditType] = settings
      }
      return connection
    }
    return StackScenario(connections: Array(connections), history: false)
  }

  /// QUO-449: a Prospeo whose checks have failed three times in a row (the
  /// launch check makes four), balances healthy, beside a healthy OpenRouter.
  /// The bird is gold for the stopped checks alone. No history.
  public static var checksStopped: StackScenario {
    let all = connections(count: 5, risks: Array(repeating: .healthy, count: 5), plainNames: true)
    var prospeo = all[4]
    prospeo.monitoring.consecutiveFailures = MonitoringDecider.failureThreshold
    return StackScenario(connections: [all[0], prospeo], failingID: prospeo.id, history: false)
  }

  /// QUO-449: one failed check on a Prospeo whose balance is empty, so its
  /// red balance is listed under the failure line, marked old; a Hunter with
  /// low searches and a muted empty sibling, counted and labelled. No history.
  public static var failingBehindLines: StackScenario {
    var searches = ProviderID.hunter.pools[0]
    searches.cap = 10_000
    var verifications = ProviderID.hunter.pools[1]
    verifications.cap = 10_000
    var prospeo = ProviderID.prospeo.pools[0]
    prospeo.cap = 10_000
    let connections = [
      Connection(
        id: "behind-0", provider: .prospeo, name: "Prospeo", credentialRef: "behind-0",
        lastReading: Reading(balances: [PoolBalance(pool: prospeo, balance: 0)], checkedAt: Scenarios.checkedAt)
      ),
      Connection(
        id: "behind-1", provider: .hunter, name: "Hunter", credentialRef: "behind-1",
        lastReading: Reading(
          balances: [PoolBalance(pool: searches, balance: ProviderID.hunter.defaultSettings.critical + 1),
                     PoolBalance(pool: verifications, balance: 0)],
          checkedAt: Scenarios.checkedAt
        ),
        mutes: [verifications.creditType: Mute(until: nil, balance: 0, severity: .empty)]
      ),
    ]
    return StackScenario(connections: connections, failingID: "behind-0", history: false)
  }

  /// QUO-351, QUO-393: a free-plan Hunter muted until top-up at empty and a
  /// trial muted for a few days sit dimmed in the quiet group; a team plan
  /// whose mute ran out is back in Needs attention beside an unmuted low one.
  /// Mute ends are relative to the wall clock, because rows are. No history.
  public static var muted: StackScenario {
    let now = Date()
    let items: [(String, Double, Mute?)] = [
      ("Free plan", 0, Mute(until: nil, balance: 0, severity: .empty)),
      ("Trial", 800, Mute(until: now.addingTimeInterval(3 * 86_400), balance: 800, severity: .low)),
      ("Team plan", 900, Mute(until: now.addingTimeInterval(-3600), balance: 900, severity: .low)),
      ("Paid plan", 1000, nil),
    ]
    let connections = items.enumerated().map { index, item in
      let (name, verifications, mute) = item
      let id = "muted-\(index)"
      var searches = ProviderID.hunter.pools[0]
      searches.cap = 10_000
      var pool = ProviderID.hunter.pools[1]
      pool.cap = 10_000
      return Connection(
        id: id, provider: .hunter, name: "\(name) Hunter", credentialRef: id,
        lastReading: Reading(
          balances: [PoolBalance(pool: searches, balance: 4000), PoolBalance(pool: pool, balance: verifications)],
          checkedAt: Scenarios.checkedAt
        ),
        mutes: mute.map { [pool.creditType: $0] } ?? [:]
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

  /// QUO-445: `atRisk` Prospeo balances below Warn below (every fifth one
  /// empty), then `healthy` healthy tools. Short names keep every at-risk row
  /// on one line; long names wrap each to two beside its Top up and Mute
  /// buttons. No history.
  public static func atRisk(_ atRisk: Int, healthy: Int = 0, longNames: Bool = false) -> StackScenario {
    let settings = ProviderID.prospeo.defaultSettings
    var pool = ProviderID.prospeo.pools[0]
    pool.cap = 10_000
    let risky = (0..<atRisk).map { index in
      let id = "at-risk-\(index)"
      return Connection(
        id: id, provider: .prospeo,
        name: longNames ? "Prospeo client workspace number \(index + 10)" : "Lead \(index + 1)", credentialRef: id,
        lastReading: Reading(
          balances: [PoolBalance(pool: pool, balance: index % 5 == 4 ? 0 : settings.critical + Double(index))],
          checkedAt: Scenarios.checkedAt
        )
      )
    }
    let rest = connections(count: healthy, risks: Array(repeating: .healthy, count: healthy))
    return StackScenario(connections: risky + rest, history: false)
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
    let key = headers["x-api-key"] ?? headers["X-KEY"] ?? headers["clay-api-key"] ?? headers["xi-api-key"]
      ?? basicPassword(headers["Authorization"])
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
    case ProviderID("clay"):
      body = Dictionary(uniqueKeysWithValues: balances.map {
        ($0.pool.creditType == "credits" ? "balance" : "action_execution_balance", $0.balance)
      })
    case ProviderID("instantly"):
      let credits = balances.first { $0.pool.creditType == "credits" }!
      let leads = balances.first { $0.pool.creditType == "leads" }!
      body = ["subscriptions": [
        "credits": ["available_credits": credits.balance, "total_credits": credits.pool.cap!],
        "outreach": ["total_lead_limit": leads.pool.cap!, "current_lead_count": leads.pool.cap! - leads.balance],
      ]]
    case .lemlist:
      body = ["credits": balances[0].balance]
    case ProviderID("elevenlabs"):
      body = ["character_limit": balances[0].pool.cap!, "character_count": balances[0].pool.cap! - balances[0].balance]
    default:
      return HTTPResponse(status: 404, body: Data())
    }
    return HTTPResponse(status: 200, body: try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys]))
  }

  /// lemlist sends HTTP Basic with an empty username and the key as the password.
  private func basicPassword(_ header: String?) -> String? {
    guard let encoded = header?.split(separator: " ").last, header?.hasPrefix("Basic ") == true,
          let decoded = Data(base64Encoded: String(encoded)).flatMap({ String(data: $0, encoding: .utf8) })
    else { return nil }
    return String(decoded.drop(while: { $0 != ":" }).dropFirst())
  }
}
