import Foundation
@testable import QuotaCanaryCore
import Testing

private let creditsBody = Data(#"{"data":{"total_credits":20,"total_usage":7.5}}"#.utf8)

/// Manual Refresh says "Checking..." the moment it starts and how it ended
/// once the slowest check lands (QUO-268). The provider answer is held on a
/// gate so the in-between state is observable.
@MainActor @Suite struct RefreshProgressTests {
  /// One OpenRouter connection behind a gated transport.
  private func harness() async throws -> (SchedulerHarness, GatedTransport, ManualRefresh) {
    let gate = GatedTransport()
    let h = SchedulerHarness(transport: gate)
    let connecting = Task { try await h.connect() }
    await yieldUntil { gate.pending == 1 }
    gate.answer(at: 0, with: .success(HTTPResponse(status: 200, body: creditsBody)))
    _ = try await connecting.value
    let refresh = ManualRefresh.checking(scheduler: h.scheduler, resultDuration: .seconds(600))
    return (h, gate, refresh)
  }

  @Test func aDelayedCheckShowsCheckingAtOnceThenChecked() async throws {
    let (h, gate, refresh) = try await harness()
    #expect(refresh.progress == .idle)
    let run = Task { await refresh.run() }
    await yieldUntil { gate.pending == 1 }
    #expect(refresh.progress == .checking)
    gate.answer(at: 0, with: .success(HTTPResponse(status: 200, body: creditsBody)))
    await run.value
    #expect(refresh.progress == .finished(.checked))
    #expect(gate.requestCount == 2) // connect + this refresh
    #expect(h.health == .ok(lastSuccess: t0))
  }

  @Test func aDelayedFailureEndsAsFailed() async throws {
    let (_, gate, refresh) = try await harness()
    let run = Task { await refresh.run() }
    await yieldUntil { gate.pending == 1 }
    #expect(refresh.progress == .checking)
    gate.answer(at: 0, with: .success(HTTPResponse(status: 401, body: Data("{}".utf8))))
    await run.value
    #expect(refresh.progress == .finished(.failed(1)))
  }

  @Test func aSecondClickWhileCheckingJoinsInsteadOfSendingAgain() async throws {
    let (_, gate, refresh) = try await harness()
    let first = Task { await refresh.run() }
    await yieldUntil { gate.pending == 1 }
    let second = Task { await refresh.run() }
    await yieldUntil { false } // let the second run reach its join
    #expect(gate.pending == 1)
    gate.answer(at: 0, with: .success(HTTPResponse(status: 200, body: creditsBody)))
    await first.value
    await second.value
    #expect(gate.requestCount == 2) // connect + one refresh
    #expect(refresh.progress == .finished(.checked))
  }

  @Test func theResultFadesBackToIdle() async throws {
    let gate = GatedTransport()
    let h = SchedulerHarness(transport: gate)
    let refresh = ManualRefresh.checking(
      scheduler: h.scheduler,
      resultDuration: .milliseconds(1)
    )
    await refresh.run() // nothing connected: finishes at once
    for _ in 0..<200 where refresh.progress != .idle {
      try await Task.sleep(for: .milliseconds(5))
    }
    #expect(refresh.progress == .idle)
  }

  // MARK: Outcome

  @Test func outcomeCountsFailedChecks() {
    let health: [String: ConnectionHealth] = [
      "a": .ok(lastSuccess: t0),
      "b": .failed(lastSuccess: t0, attempted: true),
      "c": .failed(lastSuccess: nil, attempted: false),
    ]
    #expect(RefreshOutcome.of(health: health) == .failed(2))
    #expect(RefreshOutcome.of(health: ["a": .ok(lastSuccess: t0)]) == .checked)
    #expect(RefreshOutcome.of(health: ["a": .offline(lastSuccess: t0)]) == .offline)
  }

  @Test func copyNamesTheOutcomeWithoutEmDashes() {
    #expect(RefreshProgress.checking.label == Copy.checkingNow)
    #expect(RefreshProgress.finished(.checked).label == Copy.checked(Copy.justNow))
    #expect(RefreshProgress.finished(.failed(1)).label == "1 check failed")
    #expect(RefreshProgress.finished(.failed(3)).label == "3 checks failed")
    #expect(RefreshProgress.idle.label == nil)
    for text in [Copy.refreshFailed(1), Copy.refreshFailed(2), Copy.refreshOffline] {
      #expect(!text.contains("\u{2014}"))
    }
  }
}
