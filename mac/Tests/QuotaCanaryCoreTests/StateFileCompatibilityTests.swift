import Foundation
@testable import QuotaCanaryCore
import Testing

/// connections.json as the release before the catalog reader wrote it
/// (StateCoding.encode on 2026-10-10, master with QUO-186): five enum ids, a
/// pool with a cap, saved settings, an alert mark and a failure streak. It
/// must keep loading unchanged now that `provider` is a catalog-validated
/// string, and re-encoding it must produce the same bytes.
let fiveIDStateFile = #"""
{
  "connections" : [
    {
      "alertMarks" : {

      },
      "credentialRef" : "A1",
      "id" : "A1",
      "lastReading" : {
        "balances" : [
          {
            "balance" : 12.5,
            "pool" : {
              "creditType" : "credits",
              "label" : "Credits",
              "unit" : "usd"
            }
          }
        ],
        "checkedAt" : 721692800
      },
      "monitoring" : {
        "consecutiveFailures" : 0,
        "credentialAlertSent" : false,
        "failureAlertSent" : false
      },
      "name" : "OpenRouter",
      "poolSettings" : {

      },
      "provider" : "openrouter"
    },
    {
      "alertMarks" : {
        "verifications" : "low"
      },
      "credentialRef" : "B2",
      "id" : "B2",
      "lastReading" : {
        "balances" : [
          {
            "balance" : 520,
            "pool" : {
              "cap" : 1000,
              "creditType" : "searches",
              "label" : "Searches",
              "unit" : "credits"
            }
          },
          {
            "balance" : 500,
            "pool" : {
              "cap" : 1000,
              "creditType" : "verifications",
              "label" : "Verifications",
              "unit" : "credits"
            }
          }
        ],
        "checkedAt" : 721692900
      },
      "monitoring" : {
        "consecutiveFailures" : 2,
        "credentialAlertSent" : false,
        "failureAlertSent" : false
      },
      "name" : "Hunter",
      "poolSettings" : {
        "verifications" : {
          "critical" : 100,
          "low" : 300,
          "monitored" : true
        }
      },
      "provider" : "hunter"
    },
    {
      "alertMarks" : {

      },
      "credentialRef" : "C3",
      "id" : "C3",
      "monitoring" : {
        "consecutiveFailures" : 0,
        "credentialAlertSent" : false,
        "failureAlertSent" : false
      },
      "name" : "Tavily",
      "poolSettings" : {

      },
      "provider" : "tavily"
    },
    {
      "alertMarks" : {

      },
      "credentialRef" : "D4",
      "id" : "D4",
      "lastReading" : {
        "balances" : [
          {
            "balance" : 488,
            "pool" : {
              "cap" : 500,
              "creditType" : "dialer",
              "label" : "Dialer Minutes",
              "unit" : "minutes"
            }
          }
        ],
        "checkedAt" : 721693000
      },
      "monitoring" : {
        "consecutiveFailures" : 0,
        "credentialAlertSent" : false,
        "failureAlertSent" : false
      },
      "name" : "Apollo",
      "poolSettings" : {
        "dialer" : {
          "critical" : 30,
          "low" : 120,
          "monitored" : false
        }
      },
      "provider" : "apollo"
    },
    {
      "alertMarks" : {

      },
      "credentialRef" : "E5",
      "id" : "E5",
      "lastReading" : {
        "balances" : [
          {
            "balance" : 900,
            "pool" : {
              "cap" : 1000,
              "creditType" : "credits",
              "label" : "Credits",
              "unit" : "credits"
            }
          }
        ],
        "checkedAt" : 721693100
      },
      "monitoring" : {
        "consecutiveFailures" : 0,
        "credentialAlertSent" : false,
        "failureAlertSent" : false
      },
      "name" : "Client work",
      "poolSettings" : {

      },
      "provider" : "prospeo"
    }
  ],
  "version" : 1
}
"""#

@Suite struct StateFileCompatibilityTests {
  @Test func aStateFileWithTheFiveOldIDsLoadsUnchanged() throws {
    let connections = try StateCoding.decode(Data(fiveIDStateFile.utf8))
    #expect(connections.map(\.provider) == [.openrouter, .hunter, .tavily, .apollo, .prospeo])
    #expect(connections.map(\.provider.rawValue) == ["openrouter", "hunter", "tavily", "apollo", "prospeo"])
    #expect(connections.map(\.name) == ["OpenRouter", "Hunter", "Tavily", "Apollo", "Client work"])
    let hunter = connections[1]
    #expect(hunter.lastReading?.balances.map(\.balance) == [520, 500])
    #expect(hunter.lastReading?.balances.map(\.pool.cap) == [1000, 1000])
    #expect(hunter.poolSettings == ["verifications": PoolSettings(monitored: true, low: 300, critical: 100)])
    #expect(hunter.alertMarks == ["verifications": .low])
    #expect(hunter.monitoring.consecutiveFailures == 2)
    #expect(connections[2].lastReading == nil)
    #expect(connections[3].poolSettings["dialer"]?.monitored == false)
    // Pool rows still come from the (now catalog-backed) provider definition.
    #expect(hunter.poolRows.map(\.pool.creditType) == ["searches", "verifications"])
    #expect(connections[4].poolRows.map(\.pool.label) == ["Credits"])
  }

  @Test func reEncodingTheOldFileIsByteIdentical() throws {
    let connections = try StateCoding.decode(Data(fiveIDStateFile.utf8))
    #expect(String(decoding: try StateCoding.encode(connections), as: UTF8.self) == fiveIDStateFile)
  }

  @Test func anIDFromANewerCatalogStillLoadsAndNamesItself() throws {
    // Downgrade case: a tool this build does not know. Tolerant decoding keeps
    // the file loadable; the connection shows its id and has no catalog pools.
    let json = fiveIDStateFile.replacingOccurrences(of: #""provider" : "prospeo""#, with: #""provider" : "futuretool""#)
    let connections = try StateCoding.decode(Data(json.utf8))
    #expect(connections[4].provider == ProviderID("futuretool"))
    #expect(connections[4].provider.displayName == "futuretool")
    #expect(connections[4].poolRows.map(\.pool.creditType) == ["credits"]) // from the saved reading only
  }
}
