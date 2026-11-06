import Foundation
@testable import QuotaCanaryCore
import Testing

/// QUO-450: treg's org id travels in the balance URL path; what is recorded (export, last-check
/// note, Console line) shows `/orgs/[org]/balance`, while the request still targets the real id.
@MainActor @Suite struct TregOrgRedactionTests {
  private func healthyService(_ transport: ScriptedTransport) -> MonitoringService {
    MonitoringService(credentials: InMemoryCredentialStore(), store: InMemoryConnectionStore(), transport: transport)
  }

  @Test func orgIDNeverReachesTheExportOnAHealthyCheck() async throws {
    let transport = ScriptedTransport([
      .respond(status: 200, body: #"{"org_id":884213,"email":"dana@acme.test"}"#),
      .respond(status: 200, body: #"{"balance_usd":42.5}"#),
    ])
    let service = healthyService(transport)
    let connection = try await service.connect(provider: .treg, key: "treg-token-SECRET")
    let snapshots = service.connections.map {
      Diagnostics.ConnectionSnapshot(connection: $0, lastError: nil, lastCheck: service.lastChecks[$0.id])
    }
    let text = String(decoding: Diagnostics.encode(Diagnostics.report(connections: snapshots, appVersion: "0.1.7")), as: UTF8.self)
    #expect(!text.contains("884213"))
    #expect(service.lastChecks[connection.id]?.path == "/orgs/[org]/balance")
    #expect(service.lastChecks[connection.id]?.clipboardText.contains("884213") == false)
    // Only what is recorded changes: the real request still targets the real org id.
    #expect(transport.requests.last?.url.path == "/orgs/884213/balance")
  }

  @Test func orgIDNeverReachesTheRecordOnAFailedCheck() async throws {
    let recording = RecordingTransport(
      ScriptedTransport([.respond(status: 403, body: #"{"error":"org 884213 is suspended"}"#)]), key: "k"
    )
    _ = try await recording.send(HTTPRequest("GET", Treg.balanceURL(orgID: 884213)))
    let record = try #require(recording.record)
    #expect(record.path == "/orgs/[org]/balance")
    #expect(!record.body.contains("884213"))
    #expect(!record.clipboardText.contains("884213"))
  }
}
