import Foundation
@testable import QuotaCanaryCore
import Testing

/// The bundled copy of catalog/tools.json: the same file the web interpreter
/// reads (QUO-189), so the picker and the readers never fork from it.
@Suite struct CatalogTests {
  @Test func bundledCatalogIsByteIdenticalToTheRepoRootFile() throws {
    // mac/Tests/QuotaCanaryCoreTests/CatalogTests.swift -> <repo>/catalog/tools.json
    let repoRoot = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    let source = try Data(contentsOf: repoRoot.appendingPathComponent("catalog/tools.json"))
    let bundled = try #require(Catalog.bundledData())
    #expect(source == bundled, "run mac/scripts/sync-catalog.sh")
  }

  @Test func bundledCatalogParsesEveryTool() throws {
    let catalog = try Catalog.load(try #require(Catalog.bundledData()))
    #expect(catalog.tools.count == 108)
    #expect(Set(catalog.tools.map(\.id)).count == catalog.tools.count)
    let hunter = try #require(catalog.tools.first { $0.id == "hunter" })
    #expect(hunter.name == "Hunter")
    #expect(hunter.topupUrl == "https://hunter.io/welcome/upgrade")
    #expect(hunter.request.method == .get)
    #expect(hunter.request.url == "https://api.hunter.io/v2/account")
    #expect(hunter.auth == CatalogEntry.Auth(in: .header, name: "Authorization", format: "Bearer {key}"))
    #expect(hunter.pools.map(\.creditType) == ["searches", "verifications"])
    #expect(hunter.pools[0].limit == "data.requests.searches.available")
    #expect(hunter.pools[0].used == "data.requests.searches.used")
    #expect(hunter.pools[0].balance == nil)
  }

  @Test func unknownKeysAndTheSchemaPointerAreIgnored() throws {
    let json = #"{"$schema":"./tools.schema.json","extra":1,"tools":[{"id":"x","name":"X","future":true,"request":{"method":"GET","url":"https://x.test/"},"auth":{"in":"path"},"pools":[{"creditType":"c","label":"C","unit":"credits","balance":"left","later":0}]}]}"#
    let catalog = try Catalog.load(Data(json.utf8))
    #expect(catalog.tools.map(\.id) == ["x"])
    #expect(catalog.tools[0].auth.format == "{key}") // default
    #expect(catalog.tools[0].errors == nil)
  }

  @Test func bodyErrorDecodesEveryWhenShapeAndDefaultsOnTo2xx() throws {
    func tool(_ bodyError: String) -> String {
      #"{"tools":[{"id":"x","name":"X","request":{"method":"GET","url":"https://x.test/"},"auth":{"in":"path"},"bodyError":\#(bodyError),"pools":[{"creditType":"c","label":"C","unit":"credits","balance":"b"}]}]}"#
    }
    func rule(_ bodyError: String) throws -> CatalogEntry.BodyError? {
      try Catalog.load(Data(tool(bodyError).utf8)).tools[0].bodyError
    }
    #expect(try rule(#"{"when":{"path":"success","equals":false},"messagePaths":["message"],"fallback":"error"}"#)
      == .init(when: .equals(path: "success", false), messagePaths: ["message"], fallback: .error))
    #expect(try rule(#"{"when":{"path":"status","notEquals":"success"},"messagePaths":["message"],"fallback":"invalid_key"}"#)
      == .init(when: .notEquals(path: "status", "success"), messagePaths: ["message"], fallback: .invalidKey))
    #expect(try rule(#"{"when":{"path":"error","truthy":true},"messagePaths":["m"],"on":"any"}"#)
      == .init(when: .truthy(path: "error"), messagePaths: ["m"], on: .any))
    #expect(try rule(#"{"messagePaths":["error","message"],"on":"non2xx"}"#) == .init(messagePaths: ["error", "message"], on: .non2xx))
    #expect(try rule(#"{"messagePaths":["error"]}"#)?.on == .twoXX)
    #expect(try rule(#"{"when":{"path":"error","equals":true},"keyRejectedWhen":{"path":"error_code","equals":"BAD"},"messagePaths":["error_code"]}"#)
      == .init(when: .equals(path: "error", true), messagePaths: ["error_code"], keyRejectedWhen: .init(path: "error_code", equals: "BAD")))

    // The seven bundled entries that use it all decode (QUO-193's conversions, kickbox, BuiltWith and Prospeo).
    let bundled = try Catalog.load(try #require(Catalog.bundledData()))
    #expect(bundled.tools.filter { $0.bodyError != nil }.count == 12)
  }

  @Test func malformedBodyErrorRulesAreRefused() {
    let cases: [(String, String)] = [
      (#"{"messagePaths":["message"],"fallback":"error"}"#, "fallback needs a when"),
      (#"{"messagePaths":["m"],"keyRejectedWhen":{"path":"c","equals":"X"}}"#, "keyRejectedWhen needs a when"),
      (#"{"when":{"path":"e","truthy":true},"messagePaths":["m"],"keyRejectedWhen":{"path":"","equals":"X"}}"#, "empty JSON path"),
      (#"{"messagePaths":[]}"#, "messagePaths"),
      (#"{"messagePaths":[""]}"#, "empty JSON path"),
      (#"{"when":{"path":"","equals":false},"messagePaths":["m"]}"#, "empty JSON path"),
      (#"{"when":{"path":"s","equals":false,"truthy":true},"messagePaths":["m"]}"#, "exactly one"),
      (#"{"when":{"path":"s"},"messagePaths":["m"]}"#, "exactly one"),
      (#"{"when":{"path":"s","truthy":false},"messagePaths":["m"]}"#, "truthy must be true"),
      (#"{"messagePaths":["m"],"on":"5xx"}"#, "on"),
    ]
    for (bodyError, reason) in cases {
      let json = #"{"tools":[{"id":"x","name":"X","request":{"method":"GET","url":"https://x.test/"},"auth":{"in":"path"},"bodyError":\#(bodyError),"pools":[{"creditType":"c","label":"C","unit":"credits","balance":"b"}]}]}"#
      do {
        _ = try Catalog.load(Data(json.utf8))
        Issue.record("accepted a bodyError that should fail on: \(reason)")
      } catch let error as CatalogError {
        #expect(error.reason.contains(reason), "\(error.reason) should mention \(reason)")
      } catch {
        Issue.record("unexpected error type \(error)")
      }
    }
  }

  @Test func malformedCatalogsAreRefusedWithAReason() {
    let cases: [(String, String)] = [
      ("<html>", "not JSON"),
      (#"{"tools":[{"id":"x","name":"X","request":{"method":"PUT","url":"https://x.test/"},"auth":{"in":"path"},"pools":[{"creditType":"c","label":"C","unit":"credits","balance":"b"}]}]}"#, "method"),
      (#"{"tools":[{"id":"x","name":"X","request":{"method":"GET","url":"http://x.test/"},"auth":{"in":"path"},"pools":[{"creditType":"c","label":"C","unit":"credits","balance":"b"}]}]}"#, "https"),
      (#"{"tools":[{"id":"x","name":"X","topupUrl":"http://x.test/buy","request":{"method":"GET","url":"https://x.test/"},"auth":{"in":"path"},"pools":[{"creditType":"c","label":"C","unit":"credits","balance":"b"}]}]}"#, "topupUrl"),
      (#"{"tools":[{"id":"x","name":"X","request":{"method":"GET","url":"https://x.test/"},"auth":{"in":"header"},"pools":[{"creditType":"c","label":"C","unit":"credits","balance":"b"}]}]}"#, "auth.name"),
      (#"{"tools":[{"id":"x","name":"X","request":{"method":"GET","url":"https://x.test/"},"auth":{"in":"path"},"pools":[{"creditType":"c","label":"C","unit":"credits"}]}]}"#, "balance path or a limit path"),
      (#"{"tools":[{"id":"x","name":"X","request":{"method":"GET","url":"https://x.test/"},"auth":{"in":"path"},"pools":[]}]}"#, "pools"),
      (#"{"tools":[{"id":"x","name":"X","request":{"method":"GET","url":"https://x.test/"},"auth":{"in":"path"},"errors":{"4xx":"http"},"pools":[{"creditType":"c","label":"C","unit":"credits","balance":"b"}]}]}"#, "errors"),
      (#"{"tools":[{"id":"x","name":"X","request":{"method":"GET","url":"https://x.test/"},"auth":{"in":"path"},"pools":[{"creditType":"c","label":"C","unit":"tokens","balance":"b"}]}]}"#, "unit"),
      (#"{"tools":[{"id":"x","name":"X","request":{"method":"GET","url":"https://x.test/"},"auth":{"in":"path"},"pools":[{"creditType":"c","label":"C","unit":"credits","balance":"b"}]},{"id":"x","name":"X2","request":{"method":"GET","url":"https://x.test/"},"auth":{"in":"path"},"pools":[{"creditType":"c","label":"C","unit":"credits","balance":"b"}]}]}"#, "unique"),
    ]
    for (json, reason) in cases {
      do {
        _ = try Catalog.load(Data(json.utf8))
        Issue.record("accepted a catalog that should fail on: \(reason)")
      } catch let error as CatalogError {
        #expect(error.reason.contains(reason), "\(error.reason) should mention \(reason)")
      } catch {
        Issue.record("unexpected error type \(error)")
      }
    }
  }
}
