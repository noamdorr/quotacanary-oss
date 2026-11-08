import Foundation

/// The connect form's searchable logo list (QUO-241). Searching only narrows
/// the rows; a provider is picked by a click or by Return on the highlighted row.
public enum ProviderPicker {
  /// The row the arrow keys start from: the current pick when it is listed,
  /// else the first match of a typed search. With no pick and no search no row
  /// is highlighted (QUO-456), and Down still starts at the top.
  public static func highlight(current: ProviderID?, search: String, in rows: [ProviderID]) -> ProviderID? {
    if let current, rows.contains(current) { return current }
    return search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : rows.first
  }

  /// QUO-442: whether the form may take a key. While a search is typed and the
  /// picked tool is not among its results, the title and key label name a tool
  /// the list does not show, so nothing may be sent until a visible one is picked.
  public static func keyEntryOpen(current: ProviderID?, search: String, among all: [ProviderID]) -> Bool {
    guard let current else { return false }
    return ProviderSearch.filter(search, among: all).contains(current)
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
  /// nil until a tool is picked: the form opens with nothing chosen (QUO-456).
  public private(set) var provider: ProviderID?
  public var key = ""
  /// Values of a multi-value credential, by field name.
  public var credentialInputs: [String: String] = [:]
  /// nil while the Name field follows the suggestion (QUO-277).
  private var editedName: String?

  public init(provider: ProviderID? = nil) {
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

  /// Anything typed into the form: a key, a credential value or a name of its own (QUO-445).
  public var hasTypedInput: Bool {
    !key.isEmpty || credentialInputs.values.contains { !$0.isEmpty } || editedName != nil
  }

  /// After Connect or Cancel: the pick and what was typed go, so every open
  /// starts clean (QUO-456).
  public mutating func reset() {
    provider = nil
    key = ""
    credentialInputs = [:]
    editedName = nil
  }
}
