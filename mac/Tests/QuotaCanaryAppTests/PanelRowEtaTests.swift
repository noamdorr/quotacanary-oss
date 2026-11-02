@testable import QuotaCanary
import QuotaCanaryCore
import Testing

/// QUO-401: each panel row carries the short run-out time beside its amount.
@MainActor @Suite struct PanelRowEtaTests {
  private let eta = BurnEta(short: "in ~2 days", long: "Runs out in about 2 days.")

  private func row(_ model: AppModel) throws -> PoolRow {
    try #require(model.connections.first?.poolRows.first)
  }

  @Test func captionHidesOnAnUnmonitoredRowAndStaysOnAMutedOne() async throws {
    let model = await SnapshotStacks.model(.hunter, system: .preview())
    var row = try row(model)
    #expect(PoolRowView.etaCaption(row, eta: eta) == "in ~2 days")
    #expect(PoolRowView.etaCaption(row, eta: nil) == nil)
    let collecting = BurnEta(short: Copy.etaCollectingShort, long: Copy.etaCollectingLong)
    #expect(PoolRowView.etaCaption(row, eta: collecting) == nil)
    row.mute = Mute(until: nil, balance: 0, severity: .empty)
    #expect(PoolRowView.etaCaption(row, eta: eta) == "in ~2 days")
    row.mute = nil
    row.settings.monitored = false
    #expect(PoolRowView.etaCaption(row, eta: eta) == nil)
  }

  @Test func voiceOverReadsTheLongEstimate() async throws {
    let model = await SnapshotStacks.model(.hunter, system: .preview())
    var row = try row(model)
    #expect(PoolRowView.summary(row, eta: eta).hasSuffix(", Runs out in about 2 days."))
    #expect(!PoolRowView.summary(row).contains("Runs out"))
    row.settings.monitored = false
    #expect(!PoolRowView.summary(row, eta: eta).contains("Runs out"))
  }

  /// The website hero: a gold low row first that empties tomorrow, nothing
  /// red, so the bird is gold. "tomorrow" is shorter than "in ~2 days", which
  /// leaves the pool label room at panel width (QUO-406).
  @Test func siteHeroLeadsWithAGoldRowThatEmptiesTomorrow() async throws {
    let model = await SnapshotStacks.model(.showcaseSite)
    let rows = model.connections.flatMap(\.poolRows)
    #expect(!rows.contains { $0.status == .critical || $0.status == .empty })
    guard case let .local(connection, top, _) = try #require(model.shown.panel.attention.first) else {
      Issue.record("hero leads with a failure row")
      return
    }
    #expect(connection.provider == .apollo)
    #expect(top.status == .low)
    #expect(top.pool.label == "AI Credits")
    #expect(model.eta(for: top)?.short == "tomorrow")
  }

  /// QUO-405: the site's notification image is this alert. If the text
  /// changes, re-render "notification-site" and update the site's alt text
  /// (site/src/lib/copy.ts) and site/test/homepage-picks.test.mjs.
  @Test func showcaseHandsMacOSTheAlertTheWebsiteShows() async throws {
    let apollo = try #require(await SnapshotStacks.notifications(.showcase).first { $0.title == "Apollo" })
    #expect(apollo.body == "Lead Credits low: 1,000 of 10,000 left")
  }
}
