@testable import QuotaCanary
import QuotaCanaryCore
import Testing

/// QUO-441: five brand-new connections with their whole small allowance left
/// leave Needs attention empty, the bird plain and the notification center quiet.
@MainActor @Suite struct SmallPlanDefaultsTests {
  @Test func fiveFullSmallPlansShowNothingAndNotifyNobody() async {
    let model = await SnapshotStacks.model(.smallPlans)
    #expect(model.shown.panel.attention.isEmpty)
    #expect(model.shown.severity == .none)
    #expect(model.shown.poolsAtRisk == 0)
    #expect(await SnapshotStacks.notifications(.smallPlans).isEmpty)
  }
}
