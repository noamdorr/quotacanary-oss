import Foundation

/// The connect form's searchable logo list (QUO-241). Searching only narrows
/// the rows; a provider is picked by a click or by Return on the highlighted row.
public enum ProviderPicker {
  /// The row the arrow keys start from: the current pick when it is listed,
  /// else the first row; nil when nothing matches.
  public static func highlight(current: ProviderID, in rows: [ProviderID]) -> ProviderID? {
    rows.contains(current) ? current : rows.first
  }

  /// One row up (negative) or down (positive), stopping at either end.
  public static func move(_ highlighted: ProviderID?, by step: Int, in rows: [ProviderID]) -> ProviderID? {
    guard !rows.isEmpty else { return nil }
    guard let highlighted, let index = rows.firstIndex(of: highlighted) else { return rows.first }
    return rows[min(max(index + step, 0), rows.count - 1)]
  }

  /// How many rows the list is tall (QUO-347): it fits the matches, so a
  /// narrowed search collapses it, and scrolls past six.
  public static func visibleRows(_ count: Int) -> Int { min(count, 6) }
}

/// What the connect form holds before Connect: the picked provider, the
/// credential typed for it, and any name the person typed.
public struct ConnectDraft: Equatable, Sendable {
  public private(set) var provider: ProviderID
  public var key = ""
  /// Values of a multi-value credential, by field name.
  public var credentialInputs: [String: String] = [:]
  /// nil while the Name field follows the suggestion (QUO-277).
  private var editedName: String?

  public init(provider: ProviderID = .openrouter) {
    self.provider = provider
  }

  /// A deliberate pick. Another provider clears the credential, so a key typed
  /// for one provider is never sent to another; the same provider keeps it.
  /// Returns whether the provider changed.
  @discardableResult
  public mutating func choose(_ provider: ProviderID) -> Bool {
    guard provider != self.provider else { return false }
    self.provider = provider
    key = ""
    credentialInputs = [:]
    return true
  }

  /// The Name field: the suggested name (e.g. "Hunter 2") as real text, which
  /// follows the tool until the person types their own.
  public func name(suggested: String) -> String { editedName ?? suggested }

  /// Typing the suggestion back counts as following it again.
  public mutating func setName(_ name: String, suggested: String) {
    editedName = name == suggested ? nil : name
  }

  /// After Connect or Cancel: what was typed goes, the pick stays.
  public mutating func reset() {
    key = ""
    credentialInputs = [:]
    editedName = nil
  }
}
