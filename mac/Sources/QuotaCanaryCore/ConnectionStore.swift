import Foundation

public struct ConnectionStoreFailure: Error {}

/// Persists connection metadata and last readings. Never holds credentials.
public protocol ConnectionStore: AnyObject {
  func load() throws -> [Connection]
  func save(_ connections: [Connection]) throws
  /// Forgets everything saved; the next load is first run (QUO-297).
  func erase() throws
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
    let decoder = JSONDecoder()
    return try decoder.decode(PersistedState.self, from: data).connections
  }
}

/// JSON file under ~/Library/Application Support/QuotaCanary/.
public final class JSONFileConnectionStore: ConnectionStore {
  public let url: URL

  public init(url: URL = JSONFileConnectionStore.defaultURL()) {
    self.url = url
  }

  public static func defaultURL() -> URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent("QuotaCanary", isDirectory: true)
      .appendingPathComponent("connections.json")
  }

  public func load() throws -> [Connection] {
    guard FileManager.default.fileExists(atPath: url.path) else { return [] }
    return try StateCoding.decode(Data(contentsOf: url))
  }

  public func save(_ connections: [Connection]) throws {
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true
    )
    try StateCoding.encode(connections).write(to: url, options: .atomic)
  }

  public func erase() throws {
    try removeFileIfPresent(url)
  }
}

/// A missing file is already erased.
func removeFileIfPresent(_ url: URL) throws {
  guard FileManager.default.fileExists(atPath: url.path) else { return }
  try FileManager.default.removeItem(at: url)
}

/// In-memory store for tests and the synthetic UI mode. Keeps the encoded
/// bytes so tests can inspect exactly what would hit disk.
public final class InMemoryConnectionStore: ConnectionStore {
  public private(set) var bytes: Data?
  public var failSaves = false

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
