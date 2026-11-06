@testable import QuotaCanary
import QuotaCanaryCore
import Testing

/// QUO-447: a connections file kept aside at launch is said, with where.
@MainActor @Suite struct LoadNoticeTests {
  @Test(arguments: [false, true])
  func aSetAsideFileIsNamedInThePanel(keepingOpenRouter: Bool) async {
    let model = AppModel(service: await Scenarios.setAsideService(keepingOpenRouter: keepingOpenRouter), system: .preview())
    #expect(model.loadNotice?.contains("~/Library/Application Support/QuotaCanary/connections-unreadable-") == true)
    #expect(model.connections.count == (keepingOpenRouter ? 1 : 0))
    #expect(model.errorMessage == nil)
  }

  @Test func aCleanLaunchHasNoNotice() async {
    let model = AppModel(service: Scenarios.syntheticService(), system: .preview())
    #expect(model.loadNotice == nil)
  }
}
