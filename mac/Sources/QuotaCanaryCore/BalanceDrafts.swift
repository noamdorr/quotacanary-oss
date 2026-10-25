import Foundation

/// Unsaved "Monitor this balance" and Warn below edits, kept per balance while
/// the person moves between balances, until Save writes them or Discard drops
/// them. Explicit Save, no autosave. Every read compares against the saved
/// settings passed in, so an edit typed back to the saved value, or a balance
/// that no longer exists, never counts as an unsaved change.
public struct BalanceDrafts: Equatable, Sendable {
  private var edits: [PoolKey: PoolSettingsDraft]

  public init(_ edits: [PoolKey: PoolSettingsDraft] = [:]) {
    self.edits = edits
  }

  public func draft(for key: PoolKey, saved: PoolSettings) -> PoolSettingsDraft {
    edits[key] ?? PoolSettingsDraft(saved)
  }

  /// Returns whether the draft changed. Repeated identical writes (a text field
  /// re-sending its value on blur) are ignored.
  @discardableResult
  public mutating func set(_ draft: PoolSettingsDraft, for key: PoolKey, saved: PoolSettings) -> Bool {
    guard draft != self.draft(for: key, saved: saved) else { return false }
    edits[key] = draft == PoolSettingsDraft(saved) ? nil : draft
    return true
  }

  public func isDirty(_ key: PoolKey, saved: PoolSettings) -> Bool {
    edits[key].map { $0 != PoolSettingsDraft(saved) } ?? false
  }

  /// Balances with unsaved changes, among those that still exist.
  public func dirtyKeys(_ saved: [PoolKey: PoolSettings]) -> Set<PoolKey> {
    Set(saved.keys.filter { isDirty($0, saved: saved[$0]!) })
  }

  /// Dirty balances whose Warn below does not parse, in a stable order. Each one
  /// blocks Save, whether or not its editor is on screen.
  public func invalidKeys(_ saved: [PoolKey: PoolSettings]) -> [PoolKey] {
    Self.ordered(dirtyKeys(saved)).filter { edits[$0]!.error != nil }
  }

  public func firstInvalid(_ saved: [PoolKey: PoolSettings]) -> PoolKey? {
    invalidKeys(saved).first
  }

  private static func ordered(_ keys: Set<PoolKey>) -> [PoolKey] {
    keys.sorted { ($0.connectionID, $0.creditType) < ($1.connectionID, $1.creditType) }
  }

  /// Restores saved values for `keys`, or for every balance when nil.
  public mutating func discard(_ keys: Set<PoolKey>? = nil) {
    guard let keys else { return edits = [:] }
    for key in keys { edits[key] = nil }
  }

  public enum SaveOutcome: Equatable, Sendable {
    case saved
    /// This balance's Warn below does not parse; nothing was written.
    case invalid(PoolKey)
    /// The write failed with this message; every draft is kept.
    case failed(String)
  }

  /// Validates every dirty draft among `keys` (all when nil) and writes them in
  /// one call. `write` returns an error message, or nil on success. Drafts are
  /// cleared only after a successful write.
  public mutating func save(
    _ keys: Set<PoolKey>? = nil, saved: [PoolKey: PoolSettings],
    write: ([PoolKey: PoolSettings]) -> String?
  ) -> SaveOutcome {
    let dirty = Self.ordered(dirtyKeys(saved).filter { keys?.contains($0) ?? true })
    guard !dirty.isEmpty else { return .saved }
    var changes: [PoolKey: PoolSettings] = [:]
    for key in dirty {
      guard case let .success(settings) = edits[key]!.validated() else { return .invalid(key) }
      changes[key] = settings
    }
    if let error = write(changes) { return .failed(error) }
    discard(Set(dirty))
    return .saved
  }

  // MARK: Closing a window with unsaved edits

  public func needsCloseConfirmation(_ saved: [PoolKey: PoolSettings]) -> Bool {
    !dirtyKeys(saved).isEmpty
  }

  /// The person's answer to "Save / Discard / Cancel" when closing.
  public enum CloseChoice: Sendable {
    case save, discard, cancel
  }

  public enum CloseOutcome: Equatable, Sendable {
    case close
    /// Keep the window open: Cancel (nil), or a Save that could not complete.
    case stay(SaveOutcome?)
  }

  public mutating func resolveClose(
    _ choice: CloseChoice, saved: [PoolKey: PoolSettings],
    write: ([PoolKey: PoolSettings]) -> String?
  ) -> CloseOutcome {
    switch choice {
    case .cancel:
      return .stay(nil)
    case .discard:
      discard()
      return .close
    case .save:
      let outcome = save(saved: saved, write: write)
      return outcome == .saved ? .close : .stay(outcome)
    }
  }
}
