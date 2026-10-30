import Combine
import Foundation

/// The behavioral boundary: connect / refresh / remove / settings events
/// coordinate the credential store, the provider read, and persistence. On
/// any failure the previous trustworthy state is kept and a typed error is
/// thrown. A provider can have several connections, told apart by name.
@MainActor
public final class MonitoringService {
  public private(set) var connections: [Connection] = [] {
    didSet { connectionsChanged.send(connections) }
  }
  /// Every change to `connections`, after it landed: what the app observes
  /// instead of copying the list after each call (QUO-310).
  public let connectionsChanged = PassthroughSubject<[Connection], Never>()
  /// Local reading history, one point per pool per successful check (QUO-186).
  public private(set) var history = ReadingHistory()
  /// The last provider call per connection id, redacted, in memory only (QUO-279).
  public private(set) var lastChecks: [String: CheckRecord] = [:]

  private let credentials: CredentialStore
  private let store: ConnectionStore
  private let historyStore: ReadingHistoryStore
  private let transport: ProviderTransport
  private let now: () -> Date
  private let makeID: () -> String

  public init(
    credentials: CredentialStore,
    store: ConnectionStore,
    history historyStore: ReadingHistoryStore = InMemoryReadingHistoryStore(),
    transport: ProviderTransport,
    now: @escaping () -> Date = Date.init,
    makeID: @escaping () -> String = { UUID().uuidString }
  ) {
    self.credentials = credentials
    self.store = store
    self.historyStore = historyStore
    self.transport = transport
    self.now = now
    self.makeID = makeID
  }

  /// Relaunch: load saved metadata. Credentials are read on the next refresh.
  @discardableResult
  public func restore() throws -> [Connection] {
    do {
      connections = try store.load()
    } catch {
      throw MonitorError.loadFailed
    }
    // No history file (fresh install, or a state file from before QUO-186)
    // is an empty history; an unreadable one is too, so it never blocks the
    // connections from loading. The next good check rewrites it.
    history = (try? historyStore.load()) ?? ReadingHistory()
    return connections
  }

  /// Erase-from-this-Mac (QUO-297): every key, the saved connections and the
  /// history, then first run in memory. Sends nothing. Stops at the first
  /// failure with the in-memory state untouched.
  func eraseLocal() throws {
    try credentials.deleteAll()
    try store.erase()
    try historyStore.erase()
    connections = []
    history = ReadingHistory()
    lastChecks = [:]
  }

  /// The last 7 days of one pool's readings: the burn-rate input.
  public func history(for key: PoolKey) -> [HistoryPoint] {
    history.recent(for: key, now: now())
  }

  /// The same week at one point per 6 hours: the sparkline input.
  public func sparkline(for key: PoolKey) -> [HistoryPoint] {
    history.sampled(for: key, now: now())
  }

  /// The reading on screen is the source of truth; history is kept on a
  /// best-effort basis, so a failed history write never fails a good check.
  private func record(_ reading: Reading?, connectionID: String) {
    guard let reading else { return }
    history.append(reading, connectionID: connectionID)
    try? historyStore.save(history)
  }

  /// Validate the key with a first read, then store the key and the reading.
  /// Nothing is kept unless every step succeeds. A blank or nil `name` gets
  /// the provider name, or "Hunter 2" style when that is taken.
  @discardableResult
  public func connect(provider: ProviderID, key rawKey: String, name rawName: String? = nil) async throws -> Connection {
    let key = rawKey.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !key.isEmpty else { throw MonitorError.missingKey }
    _ = try resolveName(rawName, provider: provider) // refuse a taken name before any read

    let (result, record) = await readRecorded(provider: provider, key: key)
    let balances = try result.get()
    let name = try resolveName(rawName, provider: provider) // again: the list may have changed
    let id = makeID()
    var fresh = Connection(
      id: id,
      provider: provider,
      name: name,
      credentialRef: id,
      lastReading: Reading(balances: balances, checkedAt: now())
    )
    fresh.watchedCreditTypes = WatchedBalances.defaults(for: fresh)

    do {
      try credentials.save(key, ref: fresh.credentialRef)
    } catch {
      throw MonitorError.credentialWriteFailed
    }
    do {
      try store.save(connections + [fresh])
    } catch {
      try? credentials.delete(ref: fresh.credentialRef)
      throw MonitorError.saveFailed
    }
    connections.append(fresh)
    lastChecks[id] = record?.withoutBody
    self.record(fresh.lastReading, connectionID: fresh.id)
    return fresh
  }

  /// Re-reads one connection. Only its reading changes; pool settings and
  /// every other connection are left exactly as they were. A result older
  /// than the saved reading is dropped.
  @discardableResult
  public func refresh(id: String) async throws -> Connection {
    guard let current = connections.first(where: { $0.id == id }) else {
      throw MonitorError.notConnected
    }

    let key: String
    do {
      key = try credentials.read(ref: current.credentialRef)
    } catch CredentialStoreError.notFound {
      throw MonitorError.credentialMissing
    } catch {
      throw MonitorError.credentialReadFailed
    }

    // A reading is dated when its request went out, so a slow answer can be
    // told apart from a newer one that landed first.
    let startedAt = now()
    let balances = try await read(provider: current.provider, key: key, recordFor: id)
    try Task.checkCancellation()
    // Re-look-up after the await: settings may have been saved meanwhile.
    guard let index = connections.firstIndex(where: { $0.id == id }) else {
      throw MonitorError.notConnected
    }
    if let existing = connections[index].lastReading, existing.checkedAt > startedAt {
      return connections[index] // a newer reading already landed; never overwrite it
    }
    var updated = connections
    updated[index].lastReading = Reading(balances: balances, checkedAt: startedAt)
    updated[index].dropEndedMutes()
    do {
      try store.save(updated)
    } catch {
      throw MonitorError.saveFailed
    }
    connections = updated
    record(updated[index].lastReading, connectionID: id)
    return updated[index]
  }

  /// Saves pool settings, each scoped to its connection and pool. Every
  /// entry is validated first; nothing is saved unless all are valid.
  public func updatePoolSettings(_ changes: [PoolKey: PoolSettings]) throws {
    for settings in changes.values {
      if let error = Thresholds.validate(settings) { throw MonitorError.invalidThresholds(error) }
    }
    var updated = connections
    for (key, settings) in changes {
      guard let index = updated.firstIndex(where: { $0.id == key.connectionID }) else {
        throw MonitorError.notConnected
      }
      updated[index].poolSettings[key.creditType] = settings
    }
    do {
      try store.save(updated)
    } catch {
      throw MonitorError.saveFailed
    }
    connections = updated
  }

  /// Saves which balances one connection shows (QUO-283), kept in row order.
  /// Watching every balance is stored as nil. An empty set is ignored: a
  /// connection always watches at least one balance.
  @discardableResult
  public func updateWatched(id: String, creditTypes: [String]) throws -> Connection {
    guard let index = connections.firstIndex(where: { $0.id == id }) else {
      throw MonitorError.notConnected
    }
    guard !creditTypes.isEmpty else { return connections[index] }
    var updated = connections
    updated[index].watchedCreditTypes = WatchedBalances.normalized(creditTypes, for: updated[index])
    guard updated != connections else { return connections[index] }
    do {
      try store.save(updated)
    } catch {
      throw MonitorError.saveFailed
    }
    connections = updated
    return updated[index]
  }

  // MARK: Named connections (QUO-129)

  /// Renames one connection. Only its name changes: id, credential, reading
  /// and settings stay. Never touches Keychain.
  @discardableResult
  public func rename(id: String, to rawName: String) throws -> Connection {
    guard let index = connections.firstIndex(where: { $0.id == id }) else {
      throw MonitorError.notConnected
    }
    let current = connections[index]
    if let error = ConnectionNames.validate(rawName, provider: current.provider, among: connections, excluding: id) {
      throw MonitorError.invalidName(error)
    }
    let name = ConnectionNames.normalized(rawName)
    guard name != current.name else { return current }
    var updated = connections
    updated[index].name = name
    do {
      try store.save(updated)
    } catch {
      throw MonitorError.saveFailed
    }
    connections = updated
    return updated[index]
  }

  /// Swaps a connection's key. The new key is read against the provider
  /// first; only then is the Keychain item updated in place (same ref, so the
  /// id and pool settings stay) and the fresh reading saved. Any failure
  /// before the Keychain write leaves the old key working.
  @discardableResult
  public func replaceKey(id: String, key rawKey: String) async throws -> Connection {
    guard let current = connections.first(where: { $0.id == id }) else {
      throw MonitorError.notConnected
    }
    let key = rawKey.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !key.isEmpty else { throw MonitorError.missingKey }

    let balances = try await read(provider: current.provider, key: key, recordFor: id)
    // Removed while the new key was being checked: write nothing, so a
    // removed connection cannot come back through its Keychain item.
    guard let index = connections.firstIndex(where: { $0.id == id }) else {
      throw MonitorError.notConnected
    }
    let ref = connections[index].credentialRef
    let previous = try? credentials.read(ref: ref)
    do {
      // Add, or SecItemUpdate on the existing item: never delete-then-add.
      try credentials.save(key, ref: ref)
    } catch {
      throw MonitorError.credentialWriteFailed
    }
    var updated = connections
    updated[index].lastReading = Reading(balances: balances, checkedAt: now())
    updated[index].dropEndedMutes()
    // A working new key ends any failure incident and re-arms its alerts.
    updated[index].monitoring = MonitoringState()
    do {
      try store.save(updated)
    } catch {
      // Put the old key back so "nothing changed" is true; if that is not
      // possible, say the new key is live but its reading was not saved.
      if let previous, (try? credentials.save(previous, ref: ref)) != nil {
        throw MonitorError.saveFailed
      }
      throw MonitorError.keyReplacedReadingNotSaved
    }
    connections = updated
    record(updated[index].lastReading, connectionID: id)
    return updated[index]
  }

  /// A blank or nil name becomes the suggested one; anything else must be
  /// free for this provider.
  private func resolveName(_ rawName: String?, provider: ProviderID) throws -> String {
    guard let rawName, !ConnectionNames.normalized(rawName).isEmpty else {
      return ConnectionNames.suggested(for: provider, among: connections)
    }
    if let error = ConnectionNames.validate(rawName, provider: provider, among: connections) {
      throw MonitorError.invalidName(error)
    }
    return ConnectionNames.normalized(rawName)
  }

  /// Deletes the Keychain item first, then the record. If the key cannot be
  /// deleted the record stays, so nothing claims a cleanup that did not
  /// happen. A refresh still in flight for this id finds it gone and writes
  /// nothing.
  public func remove(id: String) throws {
    guard let current = connections.first(where: { $0.id == id }) else { return }
    do {
      try credentials.delete(ref: current.credentialRef)
    } catch {
      throw MonitorError.credentialDeleteFailed
    }
    let remaining = connections.filter { $0.id != id }
    do {
      try store.save(remaining)
    } catch {
      throw MonitorError.saveFailed
    }
    connections = remaining
    lastChecks[id] = nil
    history.remove(connectionID: id)
    try? historyStore.save(history)
  }

  // MARK: Alert marks (QUO-131)

  /// Saves per-pool notification high-water marks in one write. `.none`
  /// clears a mark. A connection removed meanwhile is skipped, not an error.
  /// On a failed save nothing changes, so the alert is retried next time.
  public func updateAlertMarks(_ changes: [PoolKey: AlertSeverity]) throws {
    var updated = connections
    for (key, mark) in changes {
      guard let index = updated.firstIndex(where: { $0.id == key.connectionID }) else { continue }
      updated[index].alertMarks[key.creditType] = mark == .none ? nil : mark
    }
    guard updated != connections else { return }
    do {
      try store.save(updated)
    } catch {
      throw MonitorError.saveFailed
    }
    connections = updated
  }

  // MARK: Mute until it changes (QUO-351)

  /// Mutes a balance at its current reading, or unmutes it. A balance with
  /// no reading has nothing to mute at, and a removed connection is skipped.
  public func setMuted(_ key: PoolKey, _ muted: Bool) throws {
    var updated = connections
    guard let index = updated.firstIndex(where: { $0.id == key.connectionID }) else { return }
    let balance = updated[index].lastReading?.balances.first { $0.pool.creditType == key.creditType }?.balance
    updated[index].mutedAt[key.creditType] = muted ? balance : nil
    guard updated != connections else { return }
    do {
      try store.save(updated)
    } catch {
      throw MonitorError.saveFailed
    }
    connections = updated
  }

  // MARK: Monitoring health (QUO-133)

  /// Saves one connection's failure count and alert flags. A connection
  /// removed meanwhile is skipped. On a failed save nothing changes.
  public func updateMonitoring(id: String, _ state: MonitoringState) throws {
    guard let index = connections.firstIndex(where: { $0.id == id }),
          connections[index].monitoring != state else { return }
    var updated = connections
    updated[index].monitoring = state
    do {
      try store.save(updated)
    } catch {
      throw MonitorError.saveFailed
    }
    connections = updated
  }

  /// Reads through a recording wrapper and keeps what the call did under
  /// `id`. A check that read fine drops its body; a failed one keeps the
  /// redacted slice the inspector and the diagnostics export show.
  private func read(provider: ProviderID, key: String, recordFor id: String) async throws -> [PoolBalance] {
    let (result, record) = await readRecorded(provider: provider, key: key)
    if let record { lastChecks[id] = (try? result.get()) == nil ? record : record.withoutBody }
    return try result.get()
  }

  private func readRecorded(provider: ProviderID, key: String) async -> (Result<[PoolBalance], Error>, CheckRecord?) {
    let recorder = RecordingTransport(transport, key: key, now: now)
    do {
      return (.success(try await read(provider: provider, key: key, transport: recorder)), recorder.record)
    } catch {
      return (.failure(error), recorder.record)
    }
  }

  private func read(provider: ProviderID, key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    do {
      // A provider this build does not know (state file from a newer
      // release) has no definition to read with; nothing is sent.
      guard let definition = ProviderRegistry.current.definition(provider) else {
        throw ProviderReadError.missingField("catalog")
      }
      return try await definition.read(key, transport)
    } catch let error as ProviderReadError {
      throw MonitorError.provider(provider, error)
    }
  }
}
