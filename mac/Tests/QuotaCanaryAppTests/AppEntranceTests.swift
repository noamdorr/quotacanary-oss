@testable import QuotaCanary
import Testing

/// QUO-443: a first launch shows the connect form, and opening the app again shows the window.
@Suite struct AppEntranceTests {
  @Test func aFirstLaunchOpensThePopover() {
    #expect(Entrance.atLaunch(arguments: ["QuotaCanary"], hasConnections: false) == .popover)
  }

  @Test func aLaunchWithConnectionsStaysSilent() {
    #expect(Entrance.atLaunch(arguments: ["QuotaCanary"], hasConnections: true) == .nothing)
  }

  @Test func theWindowStandsInWhenTheBirdIsMissing() {
    #expect(Entrance.popover.resolved(statusItemFound: true) == .popover)
    #expect(Entrance.popover.resolved(statusItemFound: false) == .stackWindow)
    #expect(Entrance.nothing.resolved(statusItemFound: false) == .nothing)
  }

  @Test func reopeningShowsTheWindow() {
    #expect(Entrance.onReopen(arguments: ["QuotaCanary"]) == .stackWindow)
  }

  @Test(arguments: ["--demo", "--design-preview", "--settings-preview"])
  func modesThatOpenTheirOwnWindowsAreLeftAlone(flag: String) {
    for connected in [false, true] {
      #expect(Entrance.atLaunch(arguments: ["QuotaCanary", flag], hasConnections: connected) == .nothing)
    }
    #expect(Entrance.onReopen(arguments: ["QuotaCanary", flag]) == .nothing)
  }
}
