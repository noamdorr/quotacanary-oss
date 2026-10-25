import Foundation
@testable import QuotaCanaryCore
import Testing

private let base = Date(timeIntervalSince1970: 1_767_225_600)
private func at(hours: Double) -> Date { base.addingTimeInterval(hours * 3600) }
private let searches = ProviderID.hunter.pools[0]
private let verifications = ProviderID.hunter.pools[1]
private let key = PoolKey(connectionID: "c1", creditType: searches.creditType)

private func reading(_ searchesLeft: Double, _ verificationsLeft: Double? = nil, hours: Double) -> Reading {
  var balances = [PoolBalance(pool: searches, balance: searchesLeft)]
  if let verificationsLeft { balances.append(PoolBalance(pool: verifications, balance: verificationsLeft)) }
  return Reading(balances: balances, checkedAt: at(hours: hours))
}

@Suite struct ReadingHistoryTests {
  @Test func appendKeepsOnePointPerPoolPerCheckOldestFirst() {
    var history = ReadingHistory()
    history.append(reading(100, 50, hours: 0), connectionID: "c1")
    history.append(reading(90, 50, hours: 1), connectionID: "c1")
    history.append(reading(500, hours: 1), connectionID: "c2")
    #expect(history.points(for: key) == [
      HistoryPoint(balance: 100, recordedAt: at(hours: 0)),
      HistoryPoint(balance: 90, recordedAt: at(hours: 1)),
    ])
    #expect(history.points(for: PoolKey(connectionID: "c1", creditType: verifications.creditType)).map(\.balance) == [50, 50])
    #expect(history.points(for: PoolKey(connectionID: "c2", creditType: searches.creditType)).map(\.balance) == [500])
    #expect(history.points(for: PoolKey(connectionID: "c3", creditType: searches.creditType)).isEmpty)
  }

  @Test func appendPrunesPointsOlderThan30Days() {
    var history = ReadingHistory()
    history.append(reading(100, hours: 0), connectionID: "c1")
    history.append(reading(99, hours: 24 * 29), connectionID: "c1")
    #expect(history.points(for: key).count == 2) // 29 days: kept
    history.append(reading(98, hours: 24 * 30 + 1), connectionID: "c1")
    #expect(history.points(for: key).map(\.balance) == [99, 98]) // the day-0 point is gone
  }

  @Test func removeDropsEveryPoolOfAConnection() {
    var history = ReadingHistory()
    history.append(reading(100, 50, hours: 0), connectionID: "c1")
    history.append(reading(500, hours: 0), connectionID: "c2")
    history.remove(connectionID: "c1")
    #expect(history.points(for: key).isEmpty)
    #expect(history.points(for: PoolKey(connectionID: "c1", creditType: verifications.creditType)).isEmpty)
    #expect(history.points(for: PoolKey(connectionID: "c2", creditType: searches.creditType)).count == 1)
  }

  @Test func recentIsTheRawSevenDayWindowOldestFirst() {
    var history = ReadingHistory()
    history.append(reading(100, hours: 0), connectionID: "c1")
    history.append(reading(98, hours: 24 * 8), connectionID: "c1")
    history.append(reading(99, hours: 24 * 7 + 1), connectionID: "c1")
    #expect(history.recent(for: key, now: at(hours: 24 * 8 + 1)).map(\.balance) == [99, 98])
    #expect(history.recent(for: key, now: at(hours: 24 * 20)).isEmpty)
  }

  /// Like the web's pool_history_sampled RPC: the newest point per 6-hour
  /// bucket over the last 7 days, plus the newest point overall.
  @Test func sampledKeepsNewestPerSixHourBucketOverSevenDays() {
    var history = ReadingHistory()
    // Four checks in one bucket (hours 0 to 5), then one per bucket.
    for (index, hour) in [0.0, 0.25, 0.5, 5.0].enumerated() {
      history.append(reading(100 - Double(index), hours: hour), connectionID: "c1")
    }
    history.append(reading(90, hours: 6), connectionID: "c1")
    history.append(reading(80, hours: 12), connectionID: "c1")
    let now = at(hours: 13)
    #expect(history.sampled(for: key, now: now).map(\.balance) == [97, 90, 80])
    // The window moves with `now`: 8 days later only the newest overall survives.
    #expect(history.sampled(for: key, now: at(hours: 24 * 8 + 13)).map(\.balance) == [80])
    #expect(history.sampled(for: PoolKey(connectionID: "none", creditType: "x"), now: now).isEmpty)
  }

  @Test func jsonFileStoreTreatsAMissingFileAsEmptyAndRoundTrips() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("qc-history-\(UUID().uuidString)")
    let store = JSONFileReadingHistoryStore(url: dir.appendingPathComponent("history.json"))
    defer { try? FileManager.default.removeItem(at: dir) }
    #expect(try store.load() == ReadingHistory())
    var history = ReadingHistory()
    history.append(reading(100, 50, hours: 0), connectionID: "c1")
    try store.save(history)
    #expect(try store.load() == history)
    #expect(JSONFileReadingHistoryStore.defaultURL().lastPathComponent == "history.json")
    #expect(JSONFileReadingHistoryStore.defaultURL().deletingLastPathComponent()
      == JSONFileConnectionStore.defaultURL().deletingLastPathComponent())
  }
}
