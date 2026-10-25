import Foundation

/// Local reading history (QUO-186): one point per pool per successful check,
/// kept 30 days, pruned on every append. Local-mode connections only; a
/// connected pool gets its burn and ETA from the API (QUO-188).
public struct ReadingHistory: Codable, Equatable, Sendable {
  public static let retention: TimeInterval = 30 * 86_400
  /// The sparkline and burn-rate window, as the web's pool_history_sampled.
  static let window: TimeInterval = 7 * 86_400
  static let bucket: TimeInterval = 6 * 3600

  var version = 1
  /// Connection id, then credit type, then points oldest first.
  var points: [String: [String: [HistoryPoint]]] = [:]

  public init() {}

  public func points(for key: PoolKey) -> [HistoryPoint] {
    points[key.connectionID]?[key.creditType] ?? []
  }

  /// Appends every balance of a reading and drops anything older than 30
  /// days before it, so the file never grows past a month.
  public mutating func append(_ reading: Reading, connectionID: String) {
    var pools = points[connectionID] ?? [:]
    for balance in reading.balances {
      pools[balance.pool.creditType, default: []].append(
        HistoryPoint(balance: balance.balance, recordedAt: reading.checkedAt)
      )
    }
    points[connectionID] = pools
    let cutoff = reading.checkedAt.addingTimeInterval(-Self.retention)
    for (id, pools) in points {
      points[id] = pools.compactMapValues { points in
        let kept = points.filter { $0.recordedAt >= cutoff }
        return kept.isEmpty ? nil : kept
      }
    }
  }

  public mutating func remove(connectionID: String) {
    points[connectionID] = nil
  }

  /// Every point of the last 7 days, oldest first: the burn-rate input. Raw,
  /// not bucketed, so three checks within an hour already give a burn.
  public func recent(for key: PoolKey, now: Date) -> [HistoryPoint] {
    let since = now.addingTimeInterval(-Self.window)
    return points(for: key).filter { $0.recordedAt >= since }.sorted { $0.recordedAt < $1.recordedAt }
  }

  /// The newest point per 6-hour bucket over the last 7 days plus the newest
  /// point overall, oldest first: the sparkline input, as the web's
  /// pool_history_sampled RPC.
  public func sampled(for key: PoolKey, now: Date) -> [HistoryPoint] {
    let all = points(for: key).sorted { $0.recordedAt < $1.recordedAt }
    guard let newest = all.last else { return [] }
    let since = now.addingTimeInterval(-Self.window)
    var newestPerBucket: [Int: HistoryPoint] = [:]
    for point in all where point.recordedAt >= since {
      newestPerBucket[Int((point.recordedAt.timeIntervalSince1970 / Self.bucket).rounded(.down))] = point
    }
    var sampled = newestPerBucket.values.sorted { $0.recordedAt < $1.recordedAt }
    if sampled.last != newest { sampled.append(newest) }
    return sampled
  }
}

public struct ReadingHistoryStoreFailure: Error {}

/// Persists the reading history beside the connections file.
public protocol ReadingHistoryStore: AnyObject {
  func load() throws -> ReadingHistory
  func save(_ history: ReadingHistory) throws
  func erase() throws
}

enum HistoryCoding {
  static func encode(_ history: ReadingHistory) throws -> Data {
    let encoder = JSONEncoder()
    // Sorted for stable diffs; not pretty-printed, as a month of
    // 15-minute checks is thousands of points per pool.
    encoder.outputFormatting = [.sortedKeys]
    return try encoder.encode(history)
  }

  static func decode(_ data: Data) throws -> ReadingHistory {
    try JSONDecoder().decode(ReadingHistory.self, from: data)
  }
}

/// JSON file under ~/Library/Application Support/QuotaCanary/, next to
/// connections.json. A missing file (fresh install, or an upgrade from a
/// lastReading-only state file) is an empty history.
public final class JSONFileReadingHistoryStore: ReadingHistoryStore {
  public let url: URL

  public init(url: URL = JSONFileReadingHistoryStore.defaultURL()) {
    self.url = url
  }

  public static func defaultURL() -> URL {
    JSONFileConnectionStore.defaultURL().deletingLastPathComponent().appendingPathComponent("history.json")
  }

  public func load() throws -> ReadingHistory {
    guard FileManager.default.fileExists(atPath: url.path) else { return ReadingHistory() }
    return try HistoryCoding.decode(Data(contentsOf: url))
  }

  public func save(_ history: ReadingHistory) throws {
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true
    )
    try HistoryCoding.encode(history).write(to: url, options: .atomic)
  }

  public func erase() throws {
    try removeFileIfPresent(url)
  }
}

/// In-memory store for tests and the synthetic UI mode.
public final class InMemoryReadingHistoryStore: ReadingHistoryStore {
  public private(set) var bytes: Data?
  public var failSaves = false

  public init() {}

  public func load() throws -> ReadingHistory {
    guard let bytes else { return ReadingHistory() }
    return try HistoryCoding.decode(bytes)
  }

  public func save(_ history: ReadingHistory) throws {
    if failSaves { throw ReadingHistoryStoreFailure() }
    bytes = try HistoryCoding.encode(history)
  }

  public func erase() throws {
    if failSaves { throw ReadingHistoryStoreFailure() }
    bytes = nil
  }
}
