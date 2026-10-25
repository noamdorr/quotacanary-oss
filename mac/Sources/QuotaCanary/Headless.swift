import Foundation
import QuotaCanaryCore

/// Developer affordances with no UI. Neither prints the key.
enum Headless {
  private struct ReadResult: Encodable {
    var ok: Bool
    var balance: Double?
    var unit: String?
    var error: String?
  }

  /// `QuotaCanary --read openrouter`: one live read with QUOTACANARY_KEY,
  /// one line of JSON, exit 0 or 1.
  static func readOpenRouter() async -> Int32 {
    let key = (ProcessInfo.processInfo.environment["QUOTACANARY_KEY"] ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let result: ReadResult
    if key.isEmpty {
      result = ReadResult(ok: false, error: MonitorError.missingKey.message)
    } else {
      do {
        let balances = try await OpenRouter.read(key: key, transport: URLSessionTransport())
        let first = balances[0]
        result = ReadResult(ok: true, balance: first.balance, unit: first.pool.unit.rawValue)
      } catch let error as ProviderReadError {
        result = ReadResult(ok: false, error: MonitorError.provider(.openrouter, error).message)
      } catch {
        result = ReadResult(ok: false, error: MonitorError.provider(.openrouter, .unreachable).message)
      }
    }
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    let line = (try? encoder.encode(result)).flatMap { String(data: $0, encoding: .utf8) } ?? #"{"ok":false}"#
    print(line)
    return result.ok ? 0 : 1
  }

  /// `QuotaCanary --export-diagnostics <path>`: writes the same report a real export would
  /// produce, using a fixed synthetic connection (no key, no network, no Keychain), so a session
  /// without a screen can inspect real diagnostics output. Exits 0 on success, 1 on failure.
  static func exportDiagnostics(to path: String) -> Int32 {
    let reading = Reading(
      balances: [PoolBalance(pool: OpenRouter.creditsPool, balance: 12.5)],
      checkedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )
    let connection = Connection(
      id: "headless-connection", provider: .openrouter, name: "OpenRouter",
      credentialRef: "headless-connection", lastReading: reading
    )
    let snapshot = Diagnostics.ConnectionSnapshot(connection: connection, lastError: nil)
    let report = Diagnostics.report(
      connections: [snapshot], appVersion: AppVersionInfo.combined,
      now: Date(timeIntervalSince1970: 1_700_000_100)
    )
    switch Diagnostics.export(report, chooseDestination: { URL(fileURLWithPath: path) }) {
    case .saved: return 0
    case .cancelled, .failed: return 1
    }
  }

  /// `QuotaCanary --erase-local-data` (QUO-297): the Settings erase without a
  /// window, for `install.sh --uninstall --erase-data`. Local only, no network.
  /// Prints what it removed; exits 0, or 1 if something could not be removed.
  @MainActor
  static func eraseLocalData() -> Int32 {
    let credentials = KeychainCredentialStore()
    let service = MonitoringService(
      credentials: credentials, store: JSONFileConnectionStore(), history: JSONFileReadingHistoryStore(),
      transport: URLSessionTransport()
    )
    _ = try? service.restore()
    do {
      print(Copy.eraseReport(try EraseLocalData(service: service, folder: EraseLocalData.defaultFolder()).run()))
      return 0
    } catch {
      print(Copy.eraseFailed)
      return 1
    }
  }

  /// `QuotaCanary --keychain-selftest`: add, read, update, read, delete one
  /// throwaway item under its own service. Touches no other items.
  static func keychainSelfTest() -> Int32 {
    let store = KeychainCredentialStore(service: "com.quotacanary.mac.selftest")
    let ref = "selftest-\(UUID().uuidString)"
    func step(_ name: String, _ body: () throws -> String) -> Bool {
      do {
        print("\(name): \(try body())")
        return true
      } catch {
        print("\(name): FAILED \(error)")
        return false
      }
    }
    var ok = true
    ok = ok && step("add") { try store.save("value-1", ref: ref); return "ok" }
    ok = ok && step("read") { try store.read(ref: ref) == "value-1" ? "ok" : "MISMATCH" }
    ok = ok && step("update") { try store.save("value-2", ref: ref); return "ok" }
    ok = ok && step("read after update") { try store.read(ref: ref) == "value-2" ? "ok" : "MISMATCH" }
    ok = ok && step("delete") { try store.delete(ref: ref); return "ok" }
    ok = ok && step("read after delete") {
      do {
        _ = try store.read(ref: ref)
        return "STILL PRESENT"
      } catch CredentialStoreError.notFound {
        return "ok (not found)"
      }
    }
    try? store.delete(ref: ref)
    print(ok ? "keychain selftest: PASS" : "keychain selftest: FAIL")
    return ok ? 0 : 1
  }
}

/// `QuotaCanary --check-updates` and `--install-update` (QUO-139): the same
/// updater the Settings button drives, with preferences in memory (nothing
/// saved). Prints one line of JSON. `--install-update` checks, and if a
/// verified update is ready, swaps the bundle and relaunches it with `open -n`,
/// exactly as Install does. Honors QUOTACANARY_UPDATE_FEED like the app.
enum UpdateHeadless {
  private struct Outcome: Encodable {
    var outcome: String
    var currentVersion: String
    var version: String?
    var reason: String?
    var archive: String?
    var app: String?
  }

  @MainActor
  static func run(install: Bool) async -> Int32 {
    var pending: Outcome?
    let updater = SystemHooks.realUpdater(clock: SystemClock(), preferences: InMemoryPreferencesStore()) {
      // The installer relaunched the new bundle; this process ends here.
      if let pending { emit(pending) }
      exit(0)
    }
    await updater.checkNow()
    let current = updater.currentVersion
    switch updater.status {
    case let .ready(version):
      guard install else {
        emit(Outcome(outcome: "ready", currentVersion: current, version: version, archive: updater.ready?.archive.path))
        return 0
      }
      pending = Outcome(
        outcome: "installed", currentVersion: current, version: version, app: Bundle.main.bundleURL.path
      )
      updater.install()
      if case let .failed(reason) = updater.status {
        emit(Outcome(outcome: "failed", currentVersion: current, version: version, reason: reason.rawValue))
      } else {
        emit(Outcome(outcome: "failed", currentVersion: current, version: version, reason: "installReturned"))
      }
      return 1
    case .upToDate:
      emit(Outcome(outcome: "upToDate", currentVersion: current))
      return 0
    case let .needsNewerMacOS(version, _):
      emit(Outcome(outcome: "needsNewerMacOS", currentVersion: current, version: version))
      return 0
    case let .failed(reason):
      emit(Outcome(outcome: "failed", currentVersion: current, reason: reason.rawValue))
      return 1
    case .idle, .checking, .downloading, .installing:
      emit(Outcome(outcome: "failed", currentVersion: current, reason: "unfinished"))
      return 1
    }
  }

  private static func emit(_ outcome: Outcome) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    print((try? encoder.encode(outcome)).flatMap { String(data: $0, encoding: .utf8) } ?? #"{"outcome":"failed"}"#)
  }
}
