import Combine
import Foundation

/// How a manual Refresh ended (QUO-268).
public enum RefreshOutcome: Equatable, Sendable {
  case checked
  /// Checks that failed.
  case failed(Int)
  /// Nothing went out: the Mac is offline.
  case offline

  /// Read after every involved check has landed.
  public static func of(health: [String: ConnectionHealth]) -> RefreshOutcome {
    let failed = health.values.filter { if case .failed = $0 { return true }; return false }.count
    if failed > 0 { return .failed(failed) }
    if health.values.contains(where: { if case .offline = $0 { return true }; return false }) { return .offline }
    return .checked
  }
}

/// What the panel header and the stack toolbar show for Refresh.
public enum RefreshProgress: Equatable, Sendable {
  case idle
  case checking
  case finished(RefreshOutcome)

  public var isChecking: Bool { self == .checking }

  /// Nil when there is nothing to say beyond the usual freshness line.
  public var label: String? {
    switch self {
    case .idle: return nil
    case .checking: return Copy.checkingNow
    case .finished(.checked): return Copy.checked(Copy.justNow)
    case let .finished(.failed(count)): return Copy.refreshFailed(count)
    case .finished(.offline): return Copy.refreshOffline
    }
  }
}

/// Runs a manual Refresh and publishes its progress: `checking` from the
/// first instant, then the outcome for `resultDuration`, then idle. `isBusy`
/// stays reserved for connect and key replacement, so Refresh never
/// disables those. A click while one is running joins it.
@MainActor
public final class ManualRefresh: ObservableObject {
  @Published public private(set) var progress: RefreshProgress = .idle

  private let resultDuration: Duration
  private let work: @MainActor () async -> RefreshOutcome
  private var inFlight: Task<Void, Never>?
  private var fade: Task<Void, Never>?

  public init(resultDuration: Duration = .seconds(4), work: @escaping @MainActor () async -> RefreshOutcome) {
    self.resultDuration = resultDuration
    self.work = work
  }

  /// Checks through the scheduler, coalesced with timer, launch and wake.
  public static func checking(
    scheduler: PollScheduler, resultDuration: Duration = .seconds(4)
  ) -> ManualRefresh {
    ManualRefresh(resultDuration: resultDuration) {
      await scheduler.check(.manual)
      return .of(health: scheduler.monitor.health)
    }
  }

  public func run() async {
    if let inFlight {
      await inFlight.value
      return
    }
    fade?.cancel()
    progress = .checking
    let task = Task { @MainActor in
      let outcome = await self.work()
      self.progress = .finished(outcome)
    }
    inFlight = task
    await task.value
    inFlight = nil
    let duration = resultDuration
    fade = Task { @MainActor [weak self] in
      try? await Task.sleep(for: duration)
      guard !Task.isCancelled, let self, case .finished = self.progress else { return }
      self.progress = .idle
    }
  }
}
