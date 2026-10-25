import Foundation

/// Narrows the provider picker. A blank query is no filter; otherwise the
/// query must appear in the display name or the id, ignoring case.
public enum ProviderSearch {
  public static func filter(_ query: String, among ids: [ProviderID]) -> [ProviderID] {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !needle.isEmpty else { return ids }
    return ids.filter { $0.displayName.lowercased().contains(needle) || $0.rawValue.contains(needle) }
  }
}
