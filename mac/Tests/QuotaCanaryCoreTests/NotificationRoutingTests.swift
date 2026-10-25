import Foundation
@testable import QuotaCanaryCore
import Testing

// QUO-266: what a notification click opens. Identity rides in userInfo and is
// resolved against what exists at click time.

private func key(_ connection: String, _ credit: String) -> PoolKey {
  PoolKey(connectionID: connection, creditType: credit)
}

@Suite struct NotificationRoutingTests {
  @Test func userInfoRoundTripsABalanceTarget() {
    let target = NotificationTarget(connectionID: "hu-1", creditType: "verifications")
    #expect(NotificationTarget(userInfo: target.userInfo) == target)
  }

  @Test func userInfoRoundTripsAConnectionOnlyTarget() {
    let target = NotificationTarget(connectionID: "hu-1")
    #expect(NotificationTarget(userInfo: target.userInfo) == target)
    #expect(target.userInfo.count == 1)
  }

  @Test func foreignOrEmptyUserInfoHasNoTarget() {
    #expect(NotificationTarget(userInfo: [:]) == nil)
    #expect(NotificationTarget(userInfo: ["other": "x"]) == nil)
    #expect(NotificationTarget(userInfo: ["quotacanary.connection": ""]) == nil)
  }

  @Test func exactBalanceIsSelected() {
    let route = NotificationRoute.resolve(
      NotificationTarget(connectionID: "b", creditType: "searches"),
      available: [key("a", "searches"), key("b", "verifications"), key("b", "searches")]
    )
    #expect(route == .select(key("b", "searches")))
  }

  @Test func connectionOnlyTargetSelectsItsFirstBalance() {
    let route = NotificationRoute.resolve(
      NotificationTarget(connectionID: "b"), available: [key("a", "x"), key("b", "verifications"), key("b", "searches")]
    )
    #expect(route == .select(key("b", "verifications")))
  }

  @Test func vanishedBalanceOnALiveConnectionSelectsTheConnection() {
    let route = NotificationRoute.resolve(
      NotificationTarget(connectionID: "b", creditType: "gone"), available: [key("b", "searches")]
    )
    #expect(route == .select(key("b", "searches")))
  }

  @Test func removedConnectionFallsBackToPlainOpen() {
    let route = NotificationRoute.resolve(
      NotificationTarget(connectionID: "removed", creditType: "searches"), available: [key("a", "searches")]
    )
    #expect(route == .openOnly)
  }

  @Test func noTargetOpensPlainly() {
    #expect(NotificationRoute.resolve(nil, available: [key("a", "searches")]) == .openOnly)
  }

  @Test func monitoringAlertTargetsTheConnection() {
    let connection = Connection(id: "hu-9", provider: .hunter, name: "Hunter", credentialRef: "hu-9", lastReading: nil)
    let alert = MonitoringContent.make(connection: connection, kind: .credentials, reason: .keyRejected)
    #expect(alert.target == NotificationTarget(connectionID: "hu-9"))
  }
}
