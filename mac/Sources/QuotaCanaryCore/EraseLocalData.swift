import Foundation

/// What an erase would take, for the confirm to say before it happens.
public struct EraseSummary: Equatable, Sendable {
  /// Provider keys in the Keychain, one per local connection.
  public let keys: Int
}

public enum EraseError: Error, Equatable {
  /// The Keychain or a file refused; what was erased before it is not undone.
  case failed
}

/// QUO-297: removes every Keychain item the app owns, saved connections,
/// history and settings, then returns to first run without a network request.
@MainActor
public struct EraseLocalData {
  private let service: MonitoringService
  private let folder: URL?

  /// `folder` is the Application Support folder to remove once its files are
  /// gone. nil (the default) for in-memory stores, so a synthetic or preview
  /// run can never touch the real folder.
  public init(service: MonitoringService, folder: URL? = nil) {
    self.service = service
    self.folder = folder
  }

  public nonisolated static func defaultFolder() -> URL {
    JSONFileConnectionStore.defaultURL().deletingLastPathComponent()
  }

  public var summary: EraseSummary {
    EraseSummary(keys: service.connections.count)
  }

  /// Erases everything, returning what it removed. Throws `.failed` and leaves
  /// the in-memory state alone if a store refuses, so the panel never claims
  /// a cleanup that did not happen.
  @discardableResult
  public func run() throws -> EraseSummary {
    let removed = summary
    do {
      try service.eraseLocal()
      if let folder, FileManager.default.fileExists(atPath: folder.path) {
        try FileManager.default.removeItem(at: folder)
      }
    } catch {
      throw EraseError.failed
    }
    return removed
  }
}
