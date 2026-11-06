import Foundation

public struct ConnectionStoreFailure: Error {}

/// Persists connection metadata and last readings. Never holds credentials.
public protocol ConnectionStore: AnyObject {
  func load() throws -> [Connection]
  func save(_ connections: [Connection]) throws
  /// Forgets everything saved; the next load is first run (QUO-297).
  func erase() throws
  /// Where the last load kept a copy of a file it could not read in full
  /// (QUO-447), or nil. Nothing is ever saved over a file that was not.
  var setAside: URL? { get }
}

public extension ConnectionStore {
  var setAside: URL? { nil }
}

struct PersistedState: Codable {
  var version = 1
  var connections: [Connection]
}

enum StateCoding {
  static func encode(_ connections: [Connection]) throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    return try encoder.encode(PersistedState(connections: connections))
  }

  static func decode(_ data: Data) throws -> [Connection] {
    try decodeChecked(data).connections
  }

  /// The connections that could be read, one by one (QUO-447). `damaged`:
  /// an entry was skipped, or a value from a newer build read as unknown, so
  /// saving these would lose something the file holds.
  static func decodeChecked(_ data: Data) throws -> (connections: [Connection], damaged: Bool) {
    let decoder = JSONDecoder()
    let issues = Issues()
    decoder.userInfo[Issues.key] = issues
    let entries = try decoder.decode(LenientState.self, from: data).connections
    let connections = entries.compactMap(\.connection)
    return (connections, issues.count > 0 || connections.count < entries.count)
  }

  /// Counts values a state-file decode tolerated instead of failing on.
  final class Issues {
    static let key = CodingUserInfoKey(rawValue: "QuotaCanary.stateIssues")!
    var count = 0
  }

  private struct LenientState: Decodable {
    var connections: [Entry]
  }

  /// One connection, or nil when it cannot be read; never fails the file.
  private struct Entry: Decodable {
    let connection: Connection?
    init(from decoder: Decoder) throws { connection = try? Connection(from: decoder) }
  }
}

/// JSON file under ~/Library/Application Support/QuotaCanary/.
public final class JSONFileConnectionStore: ConnectionStore {
  public let url: URL
  public private(set) var setAside: URL?
  private let now: () -> Date

  public init(url: URL = JSONFileConnectionStore.defaultURL(), now: @escaping () -> Date = Date.init) {
    self.url = url
    self.now = now
  }

  public static func defaultURL() -> URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent("QuotaCanary", isDirectory: true)
      .appendingPathComponent("connections.json")
  }

  /// A file that cannot be read at all is moved aside and loads as first
  /// run; one read only in part is copied aside first (QUO-447). Throws when
  /// it cannot be read or kept, so nothing is saved over it.
  public func load() throws -> [Connection] {
    setAside = nil
    guard FileManager.default.fileExists(atPath: url.path) else { return [] }
    let data = try Data(contentsOf: url)
    guard let decoded = try? StateCoding.decodeChecked(data) else {
      let copy = setAsideURL(for: url, now: now())
      try FileManager.default.moveItem(at: url, to: copy)
      setAside = copy
      return []
    }
    if decoded.damaged {
      let copy = setAsideURL(for: url, now: now())
      try FileManager.default.copyItem(at: url, to: copy)
      setAside = copy
    }
    return decoded.connections
  }

  public func save(_ connections: [Connection]) throws {
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true
    )
    try StateCoding.encode(connections).write(to: url, options: .atomic)
  }

  public func erase() throws {
    try removeFileIfPresent(url)
    try removeSetAsideCopies(of: url)
  }
}

/// A missing file is already erased.
func removeFileIfPresent(_ url: URL) throws {
  guard FileManager.default.fileExists(atPath: url.path) else { return }
  try FileManager.default.removeItem(at: url)
}

/// "connections-unreadable-2026-11-05-091500.json" beside `url`, never an
/// existing file (QUO-447).
func setAsideURL(for url: URL, now: Date) -> URL {
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.dateFormat = "yyyy-MM-dd-HHmmss"
  let stem = "\(setAsidePrefix(of: url))\(formatter.string(from: now))"
  let folder = url.deletingLastPathComponent()
  var candidate = folder.appendingPathComponent("\(stem).json")
  var n = 2
  while FileManager.default.fileExists(atPath: candidate.path) {
    candidate = folder.appendingPathComponent("\(stem)-\(n).json")
    n += 1
  }
  return candidate
}

private func setAsidePrefix(of url: URL) -> String {
  "\(url.deletingPathExtension().lastPathComponent)-unreadable-"
}

/// Erase takes the set-aside copies too.
func removeSetAsideCopies(of url: URL) throws {
  let folder = url.deletingLastPathComponent()
  guard let names = try? FileManager.default.contentsOfDirectory(atPath: folder.path) else { return }
  for name in names where name.hasPrefix(setAsidePrefix(of: url)) && name.hasSuffix(".json") {
    try FileManager.default.removeItem(at: folder.appendingPathComponent(name))
  }
}

/// In-memory store for tests and the synthetic UI mode. Keeps the encoded
/// bytes so tests can inspect exactly what would hit disk.
public final class InMemoryConnectionStore: ConnectionStore {
  public private(set) var bytes: Data?
  public var failSaves = false
  /// What `setAside` reports, for previews of a file kept aside (QUO-447).
  public var setAside: URL?

  public init() {}

  public func load() throws -> [Connection] {
    guard let bytes else { return [] }
    return try StateCoding.decode(bytes)
  }

  public func save(_ connections: [Connection]) throws {
    if failSaves { throw ConnectionStoreFailure() }
    bytes = try StateCoding.encode(connections)
  }

  public func erase() throws {
    if failSaves { throw ConnectionStoreFailure() }
    bytes = nil
  }
}
