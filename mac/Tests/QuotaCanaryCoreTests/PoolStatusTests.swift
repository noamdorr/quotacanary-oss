import Foundation
@testable import QuotaCanaryCore
import Testing

private let credits = Pool(creditType: "verifications", label: "Verifications", unit: .credits, cap: 1000)
private let usd = OpenRouter.creditsPool
private let thresholds = PoolSettings(monitored: true, low: 100, critical: 20)

private func status(_ balance: Double, pool: Pool = credits, _ settings: PoolSettings = thresholds) -> PoolStatus {
  PoolStatus.of(PoolBalance(pool: pool, balance: balance), settings: settings)
}

@Suite struct PoolStatusTests {
  @Test func thresholdComparisonsAreInclusive() {
    #expect(status(100.01) == .healthy)
    #expect(status(100) == .low)
    #expect(status(20.01) == .low)
    #expect(status(20) == .critical)
    #expect(status(0.01) == .critical)
  }

  @Test func emptyTakesPrecedenceAtZeroOrBelow() {
    #expect(status(0) == .empty)
    #expect(status(-3) == .empty)
    // Even when critical is 0 (so "at or below critical" would also match).
    #expect(status(0, PoolSettings(monitored: true, low: 10, critical: 0)) == .empty)
    #expect(status(0.5, PoolSettings(monitored: true, low: 10, critical: 0)) == .low)
  }

  @Test func zeroCapIsUnavailableNotEmpty() {
    let noAllowance = Pool(creditType: "searches", label: "Searches", unit: .credits, cap: 0)
    #expect(status(0, pool: noAllowance) == .unavailable)
    #expect(status(-5, pool: noAllowance) == .unavailable)
  }

  @Test func missingReadingIsUnknownNeverHealthy() {
    #expect(PoolStatus.of(nil, settings: thresholds) == .unknown)
  }

  @Test func usdPoolHasNoCapAndUsesAbsoluteThresholds() {
    let settings = ProviderID.openrouter.defaultSettings
    #expect(usd.cap == nil)
    #expect(status(15, pool: usd, settings) == .low)
    #expect(status(5, pool: usd, settings) == .critical)
    #expect(status(15.01, pool: usd, settings) == .healthy)
    #expect(Format.amount(12.5, pool: usd, locale: Locale(identifier: "en_US")) == "$12.50")
    #expect(Format.amount(480, pool: credits, locale: Locale(identifier: "en_US")) == "480 of 1,000")
  }

  @Test func onlyMonitoredWarningsAlert() {
    let key = PoolKey(connectionID: "c", creditType: "x")
    func row(_ status: PoolStatus, monitored: Bool) -> PoolRow {
      PoolRow(key: key, pool: credits, balance: 1, settings: PoolSettings(monitored: monitored, low: 2, critical: 1), status: status)
    }
    for status in [PoolStatus.low, .critical, .empty] {
      #expect(row(status, monitored: true).alerts)
      #expect(!row(status, monitored: false).alerts)
    }
    for status in [PoolStatus.healthy, .unavailable, .unknown] {
      #expect(!row(status, monitored: true).alerts)
    }
  }

  @Test func providerDefaultsComeFromTheWebCatalog() {
    #expect(ProviderID.hunter.defaultSettings == PoolSettings(monitored: true, low: 1500, critical: 500))
    #expect(ProviderID.openrouter.defaultSettings == PoolSettings(monitored: true, low: 15, critical: 5))
    for provider in ProviderID.allCases {
      #expect(Thresholds.validate(provider.defaultSettings) == nil)
    }
    #expect(ProviderID.hunter.pools.map(\.creditType) == ["searches", "verifications"])
    #expect(ProviderID.openrouter.pools.map(\.creditType) == ["credits"])
    // seed.sql: Tavily critical 100 with an explicit low of 300; Apollo and
    // Prospeo critical 500 with the 3x backfill low.
    #expect(ProviderID.tavily.defaultSettings == PoolSettings(monitored: true, low: 300, critical: 100))
    #expect(ProviderID.apollo.defaultSettings == PoolSettings(monitored: true, low: 1500, critical: 500))
    #expect(ProviderID.prospeo.defaultSettings == PoolSettings(monitored: true, low: 1500, critical: 500))
    #expect(ProviderID.tavily.pools.map(\.creditType) == ["plan", "paygo"])
    #expect(ProviderID.apollo.pools.map(\.creditType) == ["lead_credit", "export_credit", "direct_dial_credit", "ai_credit"])
    #expect(ProviderID.prospeo.pools.map(\.creditType) == ["credits"])
  }

  @Test func hunterRowsKeepBothPoolsVisibleWhenOneIsNotReported() {
    let reading = Reading(
      balances: [PoolBalance(pool: Pool(creditType: "searches", label: "Searches", unit: .credits, cap: 25), balance: 0)],
      checkedAt: Date(timeIntervalSince1970: 0)
    )
    let connection = Connection(
      id: "h", provider: .hunter, name: "Hunter", credentialRef: "h", lastReading: reading,
      poolSettings: ["verifications": PoolSettings(monitored: false, low: 50, critical: 10)]
    )
    let rows = connection.poolRows
    #expect(rows.map(\.key) == [
      PoolKey(connectionID: "h", creditType: "searches"), PoolKey(connectionID: "h", creditType: "verifications"),
    ])
    #expect(rows.map(\.status) == [.empty, .unknown])
    #expect(rows[1].balance == nil)
    // The saved choice holds even though the pool is not in this reading.
    #expect(rows[1].settings == PoolSettings(monitored: false, low: 50, critical: 10))
    #expect(rows[0].settings == ProviderID.hunter.defaultSettings)
  }

  @Test func neverCheckedConnectionShowsEveryCatalogPoolAsUnknown() {
    let connection = Connection(id: "h", provider: .hunter, name: "Hunter", credentialRef: "h", lastReading: nil)
    #expect(connection.poolRows.map(\.status) == [.unknown, .unknown])
  }
}

@Suite struct ThresholdValidationTests {
  @Test func legacyPairsAreValidatedWithoutRederiving() {
    #expect(Thresholds.validate(PoolSettings(monitored: true, low: 1500, critical: 200)) == nil)
    #expect(Thresholds.validate(PoolSettings(monitored: true, low: 5, critical: 5)) == .notANumber)
  }

  @Test(arguments: [0, -1, Double.nan, .infinity, -.infinity])
  func rejectsInvalidThreshold(bad: Double) {
    #expect(Thresholds.validate(PoolSettings(monitored: true, low: bad, critical: 0)) == .notANumber)
  }

  @Test func derivesCriticalOnSave() throws {
    for (input, expected) in [(900.0, 300.0), (1000, 333), (15, 5), (3, 1), (2.99, 1), (2, 0.67), (0.01, 0)] {
      let saved = try PoolSettingsDraft(monitored: true, low: String(input)).validated().get()
      #expect(saved.low == input)
      #expect(saved.critical == expected)
      #expect(Thresholds.validate(saved) == nil)
    }
    let saved = try PoolSettingsDraft(monitored: true, low: "900").validated().get()
    #expect(status(900.01, saved) == .healthy)
    #expect(status(900, saved) == .low)
    #expect(status(300.01, saved) == .low)
    #expect(status(300, saved) == .critical)
  }

  @Test func invalidDraftsUseOneMessage() {
    for bad in ["0", "-1", "", " ", "ten", "nan", "inf", "$5"] {
      let draft = PoolSettingsDraft(monitored: true, low: bad)
      #expect(draft.error == .notANumber)
      #expect(draft.error?.message == "Enter a number above zero.")
    }
  }
}
