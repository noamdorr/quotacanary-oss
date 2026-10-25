import CryptoKit
import Foundation

/// Named fixture scenarios (QUO-313): the one set of in-memory fixtures the
/// unit tests, the snapshot renderer, `--demo`, `--design-preview`, the window
/// checks and synthetic mode all build from. Every transport here answers from
/// memory; nothing contacts a provider.
public enum Scenarios {
  public typealias Step = ScriptedTransport.Step

  /// The frozen reference instant for every snapshot. Only `StackScenario.demo`
  /// writes it, once, so a live `--demo` run reads "Checked just now" (QUO-51).
  nonisolated(unsafe) public static var checkedAt = Date(timeIntervalSince1970: 1_790_337_600)
  public static let openRouterOK = Step.respond(status: 200, body: SyntheticBodies.openRouter)
  public static let hunterOK = Step.respond(status: 200, body: SyntheticBodies.hunter)
  /// Every provider refuses the key: synthetic mode's `fail` variant.
  static let rejected = Step.respond(status: 401, body: "{}")

  /// In-memory stores plus one scripted transport per provider host; each
  /// script's last step repeats. Catalog hosts come from the entry's URL.
  @MainActor
  public static func syntheticService(
    openRouter: [Step] = [openRouterOK], hunter: [Step] = [hunterOK],
    tavily: [Step] = [.respond(status: 200, body: SyntheticBodies.tavily)],
    apollo: [Step] = [.respond(status: 200, body: SyntheticBodies.apollo)],
    prospeo: [Step] = [.respond(status: 200, body: SyntheticBodies.prospeo)]
  ) -> MonitoringService {
    MonitoringService(
      credentials: InMemoryCredentialStore(),
      store: InMemoryConnectionStore(),
      transport: RoutedTransport([
        OpenRouter.creditsURL.host!: ScriptedTransport(openRouter),
        host(.hunter): ScriptedTransport(hunter),
        Tavily.usageURL.host!: ScriptedTransport(tavily),
        Apollo.usageURL.host!: ScriptedTransport(apollo),
        host(.prospeo): ScriptedTransport(prospeo),
      ])
    )
  }

  /// Synthetic mode's `fail` variant: every scripted provider rejects the key.
  @MainActor
  public static func rejectingService() -> MonitoringService {
    syntheticService(openRouter: [rejected], hunter: [rejected], tavily: [rejected], apollo: [rejected], prospeo: [rejected])
  }

  private static func host(_ provider: ProviderID) -> String {
    URL(string: ProviderRegistry.current.entry(provider)!.request.url)!.host!
  }

}

// MARK: Updates (QUO-139)

extension Scenarios {
  /// Two updaters that have each run the real check for 0.2.0 against a fake
  /// network with a throwaway key: one feed signed by the key the app trusts
  /// (ready to install), one signed by another key (refused). `downloads` is
  /// emptied first.
  @MainActor
  public static func checkedUpdaters(downloads: URL) async -> (ready: Updater, badSignature: Updater) {
    let key = Curve25519.Signing.PrivateKey()
    let archive = Data("snapshot update archive".utf8)
    try? FileManager.default.removeItem(at: downloads)
    func updater(signedBy signer: Curve25519.Signing.PrivateKey) -> Updater {
      let entry = try? UpdateEntry.signed(
        version: "0.2.0", url: "https://updates.example.test/QuotaCanary-0.2.0.zip", archive: archive, key: signer
      )
      let transport = FakeUpdateTransport(
        feed: .respond(status: 200, body: (try? JSONEncoder().encode(entry)) ?? Data()),
        archive: .respond(status: 200, body: archive)
      )
      return Updater(
        transport: transport, installer: FakeUpdateInstaller(), clock: ManualClock(now: Date()),
        preferences: InMemoryPreferencesStore(Preferences(updatePromptAnswered: true)), currentVersion: "0.1.0",
        publicKey: key.publicKey, downloads: downloads
      )
    }
    let ready = updater(signedBy: key)
    await ready.checkNow()
    let bad = updater(signedBy: Curve25519.Signing.PrivateKey())
    await bad.checkNow()
    return (ready, bad)
  }
}

/// A scripted scenario: what each provider answers, and the connections the
/// app makes through its connect form, in order. The app runs the connects
/// through `AppModel`; tests run them straight on the service.
public struct ScriptedScenario: Sendable {
  public struct Connect: Sendable {
    public let provider: ProviderID
    public let name: String?
    /// Leaves the balance checklist (QUO-283) up instead of taking its defaults.
    public let keepsChoice: Bool

    public init(_ provider: ProviderID, name: String? = nil, keepsChoice: Bool = false) {
      self.provider = provider
      self.name = name
      self.keepsChoice = keepsChoice
    }
  }

  public let openRouter: [Scenarios.Step]
  public let hunter: [Scenarios.Step]
  public let connects: [Connect]

  public init(
    openRouter: [Scenarios.Step] = [Scenarios.openRouterOK], hunter: [Scenarios.Step] = [Scenarios.hunterOK],
    connects: [Connect]
  ) {
    self.openRouter = openRouter
    self.hunter = hunter
    self.connects = connects
  }

  /// The key every scripted connect types.
  public static let key = "synthetic-key"

  @MainActor
  public func service() -> MonitoringService {
    Scenarios.syntheticService(openRouter: openRouter, hunter: hunter)
  }

  /// The connects run straight on a fresh service, each taking the balance
  /// checklist's defaults as the connect form does (QUO-283).
  @MainActor
  public func connected() async throws -> MonitoringService {
    let service = service()
    for connect in connects {
      let fresh = try await service.connect(provider: connect.provider, key: Self.key, name: connect.name)
      if !connect.keepsChoice, WatchedBalances.offersChoice(fresh) {
        _ = try service.updateWatched(id: fresh.id, creditTypes: fresh.poolRows.map(\.key.creditType))
      }
    }
    return service
  }
}

extension ScriptedScenario {
  /// OpenRouter $12.50 at default thresholds (low).
  public static let openRouter = ScriptedScenario(connects: [Connect(.openrouter)])
  /// Hunter searches with a zero cap (not in plan) and 480 verifications left
  /// (critical at 500).
  public static let hunter = ScriptedScenario(connects: [Connect(.hunter)])
  /// The two above together.
  public static let mixed = ScriptedScenario(connects: [Connect(.openrouter), Connect(.hunter)])
  /// Hunter first, then OpenRouter, to exercise connection ordering.
  public static let hunterThenOpenRouter = ScriptedScenario(connects: [Connect(.hunter), Connect(.openrouter)])
  /// Healthy searches only: the Hunter stopped reporting verifications (unknown).
  public static let edge = ScriptedScenario(
    hunter: [.respond(status: 200, body: #"{"data":{"requests":{"searches":{"used":25,"available":25}}}}"#)],
    connects: [Connect(.openrouter), Connect(.hunter)]
  )
  /// Tavily (plan low, pay-as-you-go off, key cap healthy) plus Prospeo.
  public static let tavily = ScriptedScenario(connects: [Connect(.tavily), Connect(.prospeo)])
  /// Apollo: dynamic pools, one not in plan, dialer in minutes.
  public static let apollo = ScriptedScenario(connects: [Connect(.apollo)])
  /// Two Hunter accounts told apart by name; the second has more left (QUO-129).
  public static let twoHunter = ScriptedScenario(
    hunter: [
      Scenarios.hunterOK,
      .respond(status: 200, body: #"{"data":{"requests":{"searches":{"used":40,"available":500},"verifications":{"used":120,"available":1000}}}}"#),
    ],
    connects: [Connect(.hunter), Connect(.hunter, name: "Client work")]
  )
  /// The balance checklist right after a two-balance connect (QUO-283).
  public static let checklist = ScriptedScenario(connects: [Connect(.hunter, keepsChoice: true)])

  /// OpenRouter connects, then every later check answers `step`: a failed
  /// refresh, a check that never answers, a rejected key, a rate limit.
  public static func openRouterThen(_ step: Scenarios.Step) -> ScriptedScenario {
    ScriptedScenario(openRouter: [Scenarios.openRouterOK, step], connects: [Connect(.openrouter)])
  }

  /// Every named scenario, for tests that cover them all.
  public static let named: [(String, ScriptedScenario)] = [
    ("openRouter", .openRouter), ("hunter", .hunter), ("mixed", .mixed),
    ("hunterThenOpenRouter", .hunterThenOpenRouter), ("edge", .edge), ("tavily", .tavily), ("apollo", .apollo),
    ("twoHunter", .twoHunter), ("checklist", .checklist),
  ]
}

/// Canned provider responses for the synthetic mode and snapshots.
public enum SyntheticBodies {
  public static let openRouter = #"{"data":{"total_credits":20,"total_usage":7.5}}"#
  /// Shaped like Hunter's real /v2/account response: a plan without searches.
  public static let hunter =
    #"{"data":{"requests":{"searches":{"used":0,"available":0},"verifications":{"used":520,"available":1000}}}}"#
  /// Shaped like Tavily's /usage: plan nearly spent, pay-as-you-go switched
  /// off (limit 0), and a key with its own 500-credit cap.
  public static let tavily =
    #"{"key":{"usage":90,"limit":500,"search_usage":60,"extract_usage":30},"account":{"current_plan":"Bootstrap","plan_usage":14820,"plan_limit":15000,"paygo_usage":0,"paygo_limit":0}}"#
  /// Shaped like Apollo's documented credit_usage_stats response: AI credits
  /// and conversations not in plan (limit 0), dialer in minutes.
  public static let apollo =
    #"{"credit_usage_stats":{"lead_credit":{"limit":10000,"consumed":2500,"left_over":7500},"export_credit":{"limit":5000,"consumed":250,"left_over":4750},"direct_dial_credit":{"limit":1000,"consumed":120,"left_over":880},"ai_credit":{"limit":0,"consumed":0,"left_over":0},"conversation_credit":{"limit":0,"consumed":0,"left_over":0},"dialer":{"limit":500,"consumed":12,"left_over":488}},"current_credit_cycle":{"start_date":"2026-09-01T00:00:00.000Z","end_date":"2026-10-01T00:00:00.000Z"}}"#
  /// Shaped like Prospeo's /account-information.
  public static let prospeo =
    #"{"error":false,"response":{"current_plan":"STARTER","remaining_credits":1840,"used_credits":160}}"#
}
