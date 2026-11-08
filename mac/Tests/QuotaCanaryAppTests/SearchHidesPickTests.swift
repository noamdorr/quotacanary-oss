@testable import QuotaCanary
import QuotaCanaryCore
import Testing

/// QUO-442: a search can never leave the key pointed at a tool the list does not show.
@MainActor @Suite struct SearchHidesPickTests {
  private func make() -> (AppModel, ScriptedTransport, ScriptedTransport) {
    let openRouter = ScriptedTransport([Scenarios.openRouterOK])
    let tavily = ScriptedTransport([.respond(status: 200, body: SyntheticBodies.tavily)])
    let service = MonitoringService(
      credentials: InMemoryCredentialStore(), store: InMemoryConnectionStore(),
      transport: RoutedTransport([OpenRouter.creditsURL.host!: openRouter, Tavily.usageURL.host!: tavily])
    )
    return (AppModel(service: service, system: .preview()), openRouter, tavily)
  }

  @Test func aKeyPastedAfterSearchingForTavilyIsNotSentToOpenRouter() async {
    let (model, openRouter, tavily) = make()
    model.provider = .openrouter
    model.providerSearch = "tavily"
    model.keyInput = "tvly-SECRET"
    #expect(!model.keyEntryOpen)
    await model.connect()
    #expect(openRouter.requests.isEmpty)
    #expect(tavily.requests.isEmpty)
    #expect(model.connections.isEmpty)
  }

  @Test func pickingTheVisibleRowOpensTheFormAndTheKeyGoesOnlyToTavily() async {
    let (model, openRouter, tavily) = make()
    model.providerSearch = "tavily"
    model.provider = .tavily
    model.keyInput = "tvly-SECRET"
    #expect(model.keyEntryOpen)
    await model.connect()
    #expect(openRouter.requests.isEmpty)
    #expect(tavily.requests.count == 1)
  }

  @Test func aSearchStillListingThePickLeavesTheFormUsable() {
    let (model, _, _) = make()
    model.provider = .openrouter
    model.providerSearch = "open"
    #expect(model.keyEntryOpen)
    model.providerSearch = "  "
    #expect(model.keyEntryOpen)
  }

  @Test func searchingAloneKeepsATypedKey() {
    let (model, _, _) = make()
    model.provider = .openrouter
    model.keyInput = "typed"
    model.providerSearch = "tavily"
    #expect(model.keyInput == "typed")
    #expect(model.provider == .openrouter)
  }

  /// QUO-456: with nothing picked, Connect has nowhere to send a key.
  @Test func connectCannotFireWithNothingPicked() async {
    let (model, openRouter, tavily) = make()
    model.keyInput = "stray-key"
    #expect(model.provider == nil)
    #expect(!model.keyEntryOpen)
    await model.connect()
    #expect(openRouter.requests.isEmpty)
    #expect(tavily.requests.isEmpty)
    #expect(model.connections.isEmpty)
  }
}
