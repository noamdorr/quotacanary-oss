import Foundation
@testable import QuotaCanaryCore
import Testing

private let prospeoKey = "pk-SYNTHETIC-PROSPEO-KEY-123"

@MainActor
private func prospeoService(_ steps: [ScriptedTransport.Step]) -> MonitoringService {
  var issued = 0
  return MonitoringService(
    credentials: InMemoryCredentialStore(), store: InMemoryConnectionStore(),
    transport: ScriptedTransport(steps),
    makeID: {
      issued += 1
      return "conn-\(issued)"
    }
  )
}

/// QUO-279: the last call's redacted record.
@MainActor @Suite struct CheckRecordTests {
  @Test func aRejected400ShowsStatusAndVendorCodeAndCopiesWhole() async throws {
    let service = prospeoService([
      .respond(status: 200, body: prospeoFixture),
      .respond(status: 400, body: #"{"error":true,"error_code":"INVALID_API_KEY"}"#),
    ])
    let connection = try await service.connect(provider: .prospeo, key: prospeoKey)
    // A check that read fine keeps the call line but no body.
    #expect(service.lastChecks[connection.id]?.status == 200)
    #expect(service.lastChecks[connection.id]?.body == "")

    await #expect(throws: MonitorError.provider(.prospeo, .keyRejected)) { try await service.refresh(id: connection.id) }
    let record = try #require(service.lastChecks[connection.id])
    #expect(record.method == "GET")
    #expect(record.host == "api.prospeo.io")
    #expect(record.path == "/account-information")
    #expect(record.status == 400)
    #expect(record.summary == #"HTTP 400 · {"error":true,"error_code":"INVALID_API_KEY"}"#)
    #expect(Copy.lastCheck(record.summary).hasPrefix("Last check: HTTP 400 · "))
    #expect(record.clipboardText.contains("GET api.prospeo.io/account-information"))
    #expect(record.clipboardText.contains("INVALID_API_KEY"))
  }

  @Test func theKeyNeverReachesTheRecordOrTheDiagnosticsExport() async throws {
    let echo = #"{"error":true,"message":"Key \#(prospeoKey) not found for ops@example.com (X-KEY: \#(prospeoKey))"}"#
    let service = prospeoService([.respond(status: 200, body: prospeoFixture), .respond(status: 400, body: echo)])
    let connection = try await service.connect(provider: .prospeo, key: prospeoKey)
    _ = try? await service.refresh(id: connection.id)
    let record = try #require(service.lastChecks[connection.id])
    #expect(!record.body.contains(prospeoKey))
    #expect(!record.body.contains("ops@example.com"))
    #expect(record.body.contains("[redacted]"))
    #expect(record.body.contains("[email]"))

    let report = Diagnostics.report(
      connections: [Diagnostics.ConnectionSnapshot(connection: connection, lastError: nil, lastCheck: record)],
      appVersion: "0.1.0"
    )
    let json = String(decoding: Diagnostics.encode(report), as: UTF8.self)
    #expect(!json.contains(prospeoKey))
    #expect(!json.contains("ops@example.com"))
    #expect(json.contains("\"lastCheck\""))
    #expect(json.contains("\"status\" : 400"))
    #expect(!record.clipboardText.contains(prospeoKey))
  }

  @Test func theUrlKeepsHostAndPathOnlyAndRedactsAKeyInThePath() {
    let url = URL(string: "https://api.example.test/v1/\(prospeoKey)/credits?api_key=\(prospeoKey)")!
    let record = CheckRecord.make(
      method: "GET", url: url, status: 403, durationMs: 12, body: Data("denied".utf8),
      secrets: CheckRecord.secrets(key: prospeoKey), now: Date(timeIntervalSince1970: 0)
    )
    #expect(record.host == "api.example.test")
    #expect(record.path == "/v1/[redacted]/credits")
    #expect(!record.clipboardText.contains(prospeoKey))
    #expect(!record.clipboardText.contains("api_key"))
  }

  @Test func authHeaderValuesAndMultiValueKeyPartsAreRedacted() {
    let secrets = CheckRecord.secrets(
      key: #"{"user":"alice-account","token":"tok-SYNTHETIC-9999"}"#,
      headers: ["Authorization": "Bearer abc-SYNTHETIC-bearer", "Accept": "application/json"]
    )
    let record = CheckRecord.make(
      method: "GET", url: URL(string: "https://x.test/a")!, status: 401, durationMs: 1,
      body: Data("alice-account tok-SYNTHETIC-9999 abc-SYNTHETIC-bearer application/json".utf8),
      secrets: secrets, now: Date(timeIntervalSince1970: 0)
    )
    #expect(record.body == "[redacted] [redacted] [redacted] application/json")
  }

  @Test func theBodyIsCutAfterRedactionAtAboutTwoKilobytes() {
    let long = String(repeating: "x", count: 5000)
    let record = CheckRecord.make(
      method: "GET", url: URL(string: "https://x.test/a")!, status: 500, durationMs: 1,
      body: Data(long.utf8), secrets: [], now: Date(timeIntervalSince1970: 0)
    )
    #expect(record.body.count == CheckRecord.bodyLimit + 3)
    #expect(record.body.hasSuffix("..."))
  }

  @Test func aTransportFailureIsARecordWithNoStatus() async throws {
    let service = prospeoService([.respond(status: 200, body: prospeoFixture), .fail])
    let connection = try await service.connect(provider: .prospeo, key: prospeoKey)
    _ = try? await service.refresh(id: connection.id)
    let record = try #require(service.lastChecks[connection.id])
    #expect(record.status == nil)
    #expect(record.summary == "no response")
  }

  @Test func aFailedConnectLeavesNoRecordAndRemoveClearsOne() async throws {
    let service = prospeoService([.respond(status: 400, body: "{}"), .respond(status: 200, body: prospeoFixture)])
    _ = try? await service.connect(provider: .prospeo, key: prospeoKey)
    #expect(service.lastChecks.isEmpty)
    let connection = try await service.connect(provider: .prospeo, key: prospeoKey)
    #expect(service.lastChecks[connection.id] != nil)
    try service.remove(id: connection.id)
    #expect(service.lastChecks[connection.id] == nil)
  }
}
