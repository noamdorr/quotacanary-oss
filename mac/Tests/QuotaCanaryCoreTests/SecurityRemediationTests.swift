import Foundation
import Testing
@testable import QuotaCanaryCore

@MainActor @Suite struct SecurityRemediationTests {
  @Test func diagnosticsNeverExportAccountResponseBodies() throws {
    for status in [200, 400, 500] {
      let record = CheckRecord.make(
        method: "GET", url: URL(string: "https://api.example.test/account")!, status: status,
        durationMs: 1, body: Data(#"{"account_id":987654,"name":"Synthetic customer"}"#.utf8),
        secrets: [], now: Date()
      )
      let report = Diagnostics.report(connections: [
        .init(provider: .hunter, hasCredential: true, lastReading: nil,
              lastError: .provider(.hunter, .missingField("balance")), lastCheck: record)
      ], appVersion: "test")
      let json = String(decoding: Diagnostics.encode(report), as: UTF8.self)
      #expect(!json.contains("987654"))
      #expect(!json.contains("Synthetic customer"))
      #expect(report.connections.first?.lastCheck?.status == status)
      #expect(report.connections.first?.lastCheck?.body == "")
    }
  }

  @Test func dynamicProviderPoolNamesAreNotExported() {
    let dynamic = Pool(creditType: "private-team-987654", label: "Private", unit: .credits, cap: 10)
    let reading = Reading(balances: [PoolBalance(pool: dynamic, balance: 3)], checkedAt: Date())
    let report = Diagnostics.report(connections: [.init(provider: .apollo, hasCredential: true, lastReading: reading,
                                                       lastError: nil)], appVersion: "test")
    #expect(report.connections[0].pools[0].creditType == "pool:1")
    #expect(report.connections[0].pools[0].balance == 3)
    #expect(!String(decoding: Diagnostics.encode(report), as: UTF8.self).contains("private-team"))
  }

  @Test func diagnosticsPreserveTavilysDeclaredKeyPool() throws {
    let response = HTTPResponse(status: 200, body: Data(#"{"key":{"limit":10,"usage":2}}"#.utf8))
    let reading = Reading(balances: try Tavily.parse(response), checkedAt: Date())
    let report = Diagnostics.report(connections: [.init(provider: .tavily, hasCredential: true, lastReading: reading,
                                                       lastError: nil)], appVersion: "test")
    #expect(report.connections[0].pools.map(\.creditType).contains("key"))
  }

  @Test func vendorErrorTextCannotReachEitherUIMessage() {
    let error = MonitorError.provider(.snov, .reportedError("Echoed synthetic a-%7Eb secret"))
    #expect(error.message == Copy.reportedError(ProviderID.snov.displayName))
    #expect(error.checkFailureMessage == Copy.checkReportedError(ProviderID.snov.displayName))
  }

  @Test func tokenExchangeResponsesNeverEnterRecords() async throws {
    let raw = "a-~b"
    for echo in ["a-%7Eb", "a-%7eb", "a-%257Eb", raw] {
      let recorder = RecordingTransport(
        ScriptedTransport([.respond(status: 400, body: #"{"message":"bad \#(echo)","access_token":"new-secret"}"#)]),
        key: #"{"client_id":"synthetic-client","client_secret":"a-~b"}"#
      )
      _ = try await recorder.send(HTTPRequest(
        "POST", URL(string: "https://api.snov.io/v1/oauth/access_token")!,
        headers: ["Content-Type": "application/x-www-form-urlencoded"],
        body: Data("client_secret=a-%7Eb".utf8)
      ))
      let record = try #require(recorder.record)
      #expect(record.body == "")
      #expect(!record.clipboardText.contains(echo))
      #expect(record.status == 400)
    }
  }

  @Test func snovBalanceErrorCannotCopyTheExchangedBearer() async throws {
    let credential = #"{"clientId":"synthetic","clientSecret":"a-~b"}"#
    let recorder = RecordingTransport(ScriptedTransport([
      .respond(status: 200, body: #"{"access_token":"bearer-~value"}"#),
      .respond(status: 400, body: #"{"message":"invalid bearer-%7Evalue for client a-%7Eb"}"#)
    ]), key: credential)
    _ = try? await Snov.read(key: credential, transport: recorder)
    let last = try #require(recorder.record)
    #expect(last.path == Snov.balanceURL.path)
    #expect(last.status == 400)
    #expect(last.body.isEmpty)
    #expect(!last.clipboardText.contains("bearer-%7Evalue"))
  }

  @Test func testAlertCompletionCannotRepopulateErasedSettings() async {
    let center = FakeNotificationCenter(permission: .allowed)
    center.holdDeliveries = true
    let settings = NotificationSettings(center: center, preferences: InMemoryPreferencesStore())
    let test = Task { await settings.sendTest() }
    for _ in 0..<1000 where center.heldCount == 0 { await Task.yield() }
    #expect(center.heldCount == 1)
    center.clearNotifications()
    settings.resetAfterErase()
    center.releaseHeld()
    await test.value
    #expect(settings.testResult == nil)
    #expect(center.delivered.isEmpty)
  }

  @Test func failedHistoryDeletionRemainsVisibleAndRetryable() async throws {
    let credentials = InMemoryCredentialStore()
    let store = InMemoryConnectionStore()
    let history = InMemoryReadingHistoryStore()
    let service = MonitoringService(
      credentials: credentials, store: store, history: history,
      transport: ScriptedTransport([.respond(status: 200, body: #"{"data":{"total_credits":20,"total_usage":3}}"#)])
    )
    let connection = try await service.connect(provider: .openrouter, key: "synthetic")
    let previousHistory = try history.load()
    #expect(previousHistory != ReadingHistory())
    history.failSaves = true
    let error = await monitorError { try service.remove(id: connection.id) }
    #expect(error?.message == "The key was removed. Choose Remove connection again to remove the reading history and saved connection.")
    #expect(credentials.items.isEmpty)
    #expect(try history.load() == previousHistory)
    #expect(service.connections.count == 1)
    #expect(try store.load().count == 1)
    history.failSaves = false
    try service.remove(id: connection.id)
    #expect(service.connections.isEmpty)
    #expect(try store.load().isEmpty)
    #expect(try history.load() == ReadingHistory())
  }
  @Test func excessiveApolloPoolsAreRejectedAndOldReadingsAreSetAside() throws {
    let stats = Dictionary(uniqueKeysWithValues: (0...Reading.maximumBalances).map { ("funded_\($0)", ["limit": 5, "left_over": 2]) })
    let response = HTTPResponse(status: 200, body: try JSONSerialization.data(withJSONObject: ["credit_usage_stats": stats]))
    #expect(throws: ProviderReadError.missingField("credit_usage_stats")) { try Apollo.parse(response) }
    let reading = Reading(balances: (0...Reading.maximumBalances).map {
      PoolBalance(pool: Pool(creditType: "funded_\($0)", label: "Funded", unit: .credits, cap: 5), balance: 2)
    }, checkedAt: Date())
    let old = Connection(id: "synthetic", provider: .apollo, name: "Test", credentialRef: "test", lastReading: reading)
    let decoded = try StateCoding.decodeChecked(StateCoding.encode([old]))
    #expect(decoded.damaged)
    #expect(decoded.connections.first?.id == old.id)
    #expect(decoded.connections.first?.lastReading == nil)
    #expect(decoded.connections.first?.allPoolRows.count == Apollo.pools.count)
  }

}
