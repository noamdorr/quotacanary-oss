import QuotaCanaryCore
import Testing

/// Unsaved monitoring and Warn below edits survive moving between balances,
/// report themselves, and end in an explicit Save or Discard.
@Suite struct BalanceDraftsTests {
  let a = PoolKey(connectionID: "c1", creditType: "credits")
  let b = PoolKey(connectionID: "c2", creditType: "credits")
  let gone = PoolKey(connectionID: "removed", creditType: "credits")
  let original = PoolSettings(monitored: true, low: 900, critical: 300)

  var saved: [PoolKey: PoolSettings] { [a: original, b: original] }

  @Test func draftSurvivesSelectingAnotherBalanceAndComingBack() {
    var drafts = BalanceDrafts()
    drafts.set(PoolSettingsDraft(monitored: false, low: "500"), for: a, saved: original)
    // Selecting B reads and edits only B.
    #expect(drafts.draft(for: b, saved: original) == PoolSettingsDraft(original))
    drafts.set(PoolSettingsDraft(monitored: true, low: "50"), for: b, saved: original)
    // Back on A, the edit is intact.
    #expect(drafts.draft(for: a, saved: original) == PoolSettingsDraft(monitored: false, low: "500"))
  }

  @Test func reportsDirtyBalancesAndIgnoresEditsBackToSaved() {
    var drafts = BalanceDrafts()
    #expect(drafts.dirtyKeys(saved).isEmpty)
    let unchanged = drafts.set(PoolSettingsDraft(original), for: a, saved: original)
    #expect(!unchanged)
    #expect(drafts.dirtyKeys(saved).isEmpty)
    let changed = drafts.set(PoolSettingsDraft(monitored: true, low: "901"), for: a, saved: original)
    #expect(changed)
    #expect(drafts.dirtyKeys(saved) == [a])
    #expect(drafts.isDirty(a, saved: original))
    #expect(!drafts.isDirty(b, saved: original))
    // Typing the saved value back is not an unsaved change.
    drafts.set(PoolSettingsDraft(original), for: a, saved: original)
    #expect(drafts.dirtyKeys(saved).isEmpty)
  }

  @Test func draftsForRemovedBalancesAreNotDirty() {
    var drafts = BalanceDrafts()
    drafts.set(PoolSettingsDraft(monitored: true, low: "5"), for: gone, saved: original)
    #expect(drafts.dirtyKeys(saved).isEmpty)
  }

  @Test func discardRestoresSavedValues() {
    var drafts = BalanceDrafts()
    drafts.set(PoolSettingsDraft(monitored: false, low: "1"), for: a, saved: original)
    drafts.set(PoolSettingsDraft(monitored: false, low: "2"), for: b, saved: original)
    drafts.discard([a])
    #expect(drafts.draft(for: a, saved: original) == PoolSettingsDraft(original))
    #expect(drafts.dirtyKeys(saved) == [b])
    drafts.discard()
    #expect(drafts.draft(for: b, saved: original) == PoolSettingsDraft(original))
    #expect(drafts.dirtyKeys(saved).isEmpty)
  }

  @Test func noInvalidDraftsMeansNoSummary() {
    var drafts = BalanceDrafts()
    #expect(drafts.invalidKeys(saved).isEmpty)
    #expect(drafts.firstInvalid(saved) == nil)
    drafts.set(PoolSettingsDraft(monitored: true, low: "30"), for: a, saved: original)
    #expect(drafts.invalidKeys(saved).isEmpty)
    #expect(drafts.firstInvalid(saved) == nil)
  }

  @Test func invalidDraftsAreCountedAndFirstIsDeterministic() {
    var drafts = BalanceDrafts()
    // Set in reverse order: the first invalid is by key, not by edit order.
    drafts.set(PoolSettingsDraft(monitored: true, low: "ten"), for: b, saved: original)
    drafts.set(PoolSettingsDraft(monitored: true, low: "x"), for: a, saved: original)
    drafts.set(PoolSettingsDraft(monitored: true, low: "oops"), for: gone, saved: original)
    #expect(drafts.invalidKeys(saved) == [a, b])
    #expect(drafts.firstInvalid(saved) == a)
    // Typing a valid number clears just that one.
    drafts.set(PoolSettingsDraft(monitored: true, low: "5"), for: a, saved: original)
    #expect(drafts.invalidKeys(saved) == [b])
    #expect(drafts.firstInvalid(saved) == b)
  }

  @Test func invalidDraftIsCountedWhateverIsOnScreen() {
    // A search hides balance B; the invalid draft on B still blocks Save and counts.
    var drafts = BalanceDrafts()
    drafts.set(PoolSettingsDraft(monitored: true, low: "ten"), for: b, saved: original)
    drafts.set(PoolSettingsDraft(monitored: true, low: "40"), for: a, saved: original)
    #expect(drafts.invalidKeys(saved) == [b])
    // A surface that saves only A counts nothing, matching what its Save writes.
    #expect(drafts.invalidKeys([a: original]).isEmpty)
  }

  @Test func saveWritesEveryDirtyDraftInOneWrite() {
    var drafts = BalanceDrafts()
    drafts.set(PoolSettingsDraft(monitored: false, low: "500"), for: a, saved: original)
    drafts.set(PoolSettingsDraft(monitored: true, low: "30"), for: b, saved: original)
    drafts.set(PoolSettingsDraft(monitored: true, low: "7"), for: gone, saved: original)
    var writes: [[PoolKey: PoolSettings]] = []
    let outcome = drafts.save(saved: saved) { writes.append($0); return nil }
    #expect(outcome == .saved)
    #expect(writes == [[
      a: PoolSettings(monitored: false, low: 500, critical: 166),
      b: PoolSettings(monitored: true, low: 30, critical: 10),
    ]])
    #expect(drafts.dirtyKeys(saved).isEmpty)
  }

  @Test func saveCanBeScopedToOneBalance() {
    var drafts = BalanceDrafts()
    drafts.set(PoolSettingsDraft(monitored: true, low: "500"), for: a, saved: original)
    drafts.set(PoolSettingsDraft(monitored: true, low: "30"), for: b, saved: original)
    var written: [PoolKey: PoolSettings] = [:]
    let outcome = drafts.save([a], saved: saved) { written = $0; return nil }
    #expect(outcome == .saved)
    #expect(Array(written.keys) == [a])
    #expect(drafts.dirtyKeys(saved) == [b])
  }

  @Test func invalidOrFailedSaveKeepsEveryDraft() {
    var drafts = BalanceDrafts()
    drafts.set(PoolSettingsDraft(monitored: true, low: "500"), for: a, saved: original)
    drafts.set(PoolSettingsDraft(monitored: true, low: "ten"), for: b, saved: original)
    var wrote = false
    let invalid = drafts.save(saved: saved) { _ in wrote = true; return nil }
    #expect(invalid == .invalid(b))
    #expect(!wrote)
    drafts.set(PoolSettingsDraft(monitored: true, low: "40"), for: b, saved: original)
    let failed = drafts.save(saved: saved) { _ in "Disk full" }
    #expect(failed == .failed("Disk full"))
    #expect(drafts.dirtyKeys(saved) == [a, b])
  }

  @Test func closingWithoutEditsNeedsNoPrompt() {
    var drafts = BalanceDrafts()
    #expect(!drafts.needsCloseConfirmation(saved))
    drafts.set(PoolSettingsDraft(monitored: false, low: "900"), for: a, saved: original)
    #expect(drafts.needsCloseConfirmation(saved))
  }

  @Test func closeChoicesHaveExplicitOutcomes() {
    let edit = PoolSettingsDraft(monitored: false, low: "500")
    var drafts = BalanceDrafts()
    drafts.set(edit, for: a, saved: original)

    // Cancel keeps the window and the draft.
    let cancelled = drafts.resolveClose(.cancel, saved: saved) { _ in nil }
    #expect(cancelled == .stay(nil))
    #expect(drafts.draft(for: a, saved: original) == edit)

    // Save writes, then closes.
    var saving = drafts
    var written: [PoolKey: PoolSettings] = [:]
    let savedThenClosed = saving.resolveClose(.save, saved: saved) { written = $0; return nil }
    #expect(savedThenClosed == .close)
    #expect(written[a]?.monitored == false)
    #expect(saving.dirtyKeys(saved).isEmpty)

    // Discard closes without writing and restores saved values.
    var wrote = false
    let discarded = drafts.resolveClose(.discard, saved: saved) { _ in wrote = true; return nil }
    #expect(discarded == .close)
    #expect(!wrote)
    #expect(drafts.draft(for: a, saved: original) == PoolSettingsDraft(original))
  }

  @Test func saveOnCloseThatCannotSaveStaysOpen() {
    var drafts = BalanceDrafts()
    drafts.set(PoolSettingsDraft(monitored: true, low: "0"), for: a, saved: original)
    let invalid = drafts.resolveClose(.save, saved: saved) { _ in nil }
    #expect(invalid == .stay(.invalid(a)))
    drafts.set(PoolSettingsDraft(monitored: true, low: "10"), for: a, saved: original)
    let failed = drafts.resolveClose(.save, saved: saved) { _ in "Nope" }
    #expect(failed == .stay(.failed("Nope")))
    #expect(drafts.isDirty(a, saved: original))
  }
}
