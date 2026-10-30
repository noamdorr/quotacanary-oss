import Foundation
@testable import QuotaCanaryCore
import Testing

/// The searchable logo list (QUO-241, absorbing QUO-267): search narrows,
/// only a deliberate pick changes the provider or drops a typed credential.
@Suite struct ProviderPickerTests {
  let rows = [ProviderID.apollo, .hunter, .openrouter, .tavily]

  @Test func typingFiltersWithoutCommittingASelection() {
    var draft = ConnectDraft(provider: .openrouter)
    draft.key = "typed-key"
    let filtered = ProviderSearch.filter("hun", among: rows)
    #expect(filtered == [.hunter])
    // The highlight moves to a listed row; the pick and the key stay put.
    #expect(ProviderPicker.highlight(current: draft.provider, in: filtered) == .hunter)
    #expect(draft.provider == .openrouter)
    #expect(draft.key == "typed-key")
  }

  /// QUO-347: the list fits its rows, so a narrowed search collapses it,
  /// and scrolls past six.
  @Test func listShowsUpToSixRowsThenScrolls() {
    #expect(ProviderPicker.visibleRows(0) == 0)
    #expect(ProviderPicker.visibleRows(1) == 1)
    #expect(ProviderPicker.visibleRows(6) == 6)
    #expect(ProviderPicker.visibleRows(120) == 6)
  }

  @Test func zeroMatchesHighlightNothingAndKeepThePick() {
    let filtered = ProviderSearch.filter("no such tool", among: rows)
    #expect(filtered.isEmpty)
    #expect(ProviderPicker.highlight(current: .openrouter, in: filtered) == nil)
    #expect(ProviderPicker.move(nil, by: 1, in: filtered) == nil)
  }

  @Test func onlyChoosingAnotherProviderClearsTheCredential() {
    var draft = ConnectDraft(provider: .twilio)
    draft.credentialInputs = ["accountSid": "AC1", "authToken": "t"]
    #expect(draft.choose(.twilio) == false)
    #expect(draft.credentialInputs == ["accountSid": "AC1", "authToken": "t"])
    #expect(draft.choose(.hunter) == true)
    #expect(draft.credentialInputs.isEmpty)
    draft.key = "hunter-key"
    #expect(draft.choose(.hunter) == false)
    #expect(draft.key == "hunter-key")
    draft.choose(.apollo)
    #expect(draft.key.isEmpty)
  }

  @Test func arrowsStartAtThePickAndStopAtTheEnds() {
    #expect(ProviderPicker.highlight(current: .openrouter, in: rows) == .openrouter)
    #expect(ProviderPicker.move(.openrouter, by: 1, in: rows) == .tavily)
    #expect(ProviderPicker.move(.tavily, by: 1, in: rows) == .tavily)
    #expect(ProviderPicker.move(.apollo, by: -1, in: rows) == .apollo)
    #expect(ProviderPicker.move(.hunter, by: -1, in: rows) == .apollo)
    // A highlight the search filtered out restarts at the top.
    #expect(ProviderPicker.move(.prospeo, by: 1, in: rows) == .apollo)
  }
}

/// QUO-277: the Name field starts as the suggested name, follows the tool
/// until the person edits it, then keeps their text.
@Suite struct ConnectDraftNameTests {
  @Test func theNameFollowsTheToolUntilEdited() {
    var draft = ConnectDraft(provider: .apollo)
    #expect(draft.name(suggested: "Apollo") == "Apollo")
    draft.choose(.hunter)
    #expect(draft.name(suggested: "Hunter 2") == "Hunter 2")
    draft.setName("Client work", suggested: "Hunter 2")
    draft.choose(.apollo)
    #expect(draft.name(suggested: "Apollo") == "Client work")
  }

  @Test func typingTheSuggestionBackFollowsAgain() {
    var draft = ConnectDraft(provider: .hunter)
    draft.setName("Hunter", suggested: "Hunter")
    draft.choose(.apollo)
    #expect(draft.name(suggested: "Apollo") == "Apollo")
  }

  @Test func anEmptiedFieldStaysEmptyAndResetFollowsAgain() {
    var draft = ConnectDraft(provider: .hunter)
    draft.setName("", suggested: "Hunter")
    draft.choose(.apollo)
    #expect(draft.name(suggested: "Apollo") == "")
    draft.reset()
    #expect(draft.name(suggested: "Apollo") == "Apollo")
  }
}
