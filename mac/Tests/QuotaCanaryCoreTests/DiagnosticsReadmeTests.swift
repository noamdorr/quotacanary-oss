import Foundation
@testable import QuotaCanaryCore
import Testing

/// QUO-448: the README's "Export diagnostics" section must describe every key a real export carries.
@Suite struct DiagnosticsReadmeTests {
  /// Every JSON key the export can hold, with a phrase the README section must contain for it.
  /// A new key fails the first test until it is added here AND described in the README.
  private static let described: [String: String] = [
    "app": "app\nversion",
    "version": "app\nversion",
    "macOSVersion": "macOS version",
    "architecture": "CPU architecture",
    "exportedAt": "JSON file",
    "updates": "automatic update checks",
    "automaticUpdateChecks": "automatic update checks",
    "lastUpdateCheckAt": "when the last one succeeded",
    "connections": "per connection",
    "index": "per connection",
    "provider": "the provider",
    "hasCredential": "whether a key is stored",
    "lastReadingAt": "timestamp",
    "pools": "pool balances",
    "creditType": "pool balances",
    "unit": "pool balances",
    "balance": "pool balances",
    "cap": "pool balances",
    "consecutiveFailures": "checks in a row have failed",
    "lastErrorCase": "error's type",
    "lastCheck": "the last check",
    "method": "method",
    "host": "host",
    "path": "path",
    "status": "HTTP status",
    "durationMs": "duration",
    "checkedAt": "time",
    "body": "response body field is always empty",
  ]

  private static func keys(in value: Any, into found: inout Set<String>) {
    if let object = value as? [String: Any] {
      for (key, child) in object {
        found.insert(key)
        keys(in: child, into: &found)
      }
    } else if let array = value as? [Any] {
      for child in array { keys(in: child, into: &found) }
    }
  }

  private static func readmeSection() throws -> String {
    // .../mac/Tests/QuotaCanaryCoreTests/<this file> -> .../mac/README.md
    let readme = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
      .deletingLastPathComponent().appendingPathComponent("README.md")
    let text = try String(contentsOf: readme, encoding: .utf8)
    let start = try #require(text.range(of: "## Export diagnostics"))
    let rest = text[start.upperBound...]
    let end = rest.range(of: "\n## ")?.lowerBound ?? rest.endIndex
    return String(rest[..<end])
  }

  @Test func readmeDescribesEveryKeyTheExportCarries() throws {
    let reading = Reading(
      balances: [PoolBalance(pool: Pool(creditType: "credits", label: "C", unit: .usd, cap: 100), balance: 1)],
      checkedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )
    let check = CheckRecord(
      method: "GET", host: "api.acme.test", path: "/v1/credits", status: 500, durationMs: 12,
      body: "{}", checkedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )
    let snapshot = Diagnostics.ConnectionSnapshot(
      provider: .openrouter, hasCredential: true, lastReading: reading, consecutiveFailures: 2,
      lastError: .provider(.openrouter, .unreachable), lastCheck: check
    )
    let report = Diagnostics.report(
      connections: [snapshot], appVersion: "0.1.7",
      updates: .init(automaticUpdateChecks: true, lastUpdateCheckAt: Date(timeIntervalSince1970: 1_700_000_000))
    )
    let object = try JSONSerialization.jsonObject(with: Diagnostics.encode(report))
    var found = Set<String>()
    Self.keys(in: object, into: &found)

    let missing = found.subtracting(Self.described.keys)
    #expect(missing.isEmpty, "the export gained keys the README test does not map: \(missing.sorted())")

    let section = try Self.readmeSection().replacingOccurrences(of: "\n", with: " ")
    for key in found.sorted() {
      guard let phrase = Self.described[key] else { continue }
      let flat = phrase.replacingOccurrences(of: "\n", with: " ")
      #expect(section.contains(flat), "README's Export diagnostics section does not describe \"\(key)\" (looked for \"\(flat)\")")
    }
  }

  @Test func readmeStatesTheExportBodyBoundary() throws {
    let section = try Self.readmeSection().replacingOccurrences(of: "\n", with: " ")
    #expect(section.contains("diagnostics never include request or response bodies"))
  }
}
