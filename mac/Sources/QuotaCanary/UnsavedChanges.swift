import AppKit
import QuotaCanaryCore

/// One window's unsaved balance edits (QUO-263). Owned by the window, not the
/// editor view, so selecting another balance (which rebuilds the inspector)
/// keeps every draft until Save or Discard.
@MainActor
final class DraftStore: ObservableObject {
  @Published var drafts: BalanceDrafts
  /// A Save from the close prompt that could not complete.
  @Published var closeError: String?
  /// The balance a Save from the close prompt could not validate.
  @Published var attention: PoolKey?

  init(_ drafts: [PoolKey: PoolSettingsDraft] = [:]) {
    self.drafts = BalanceDrafts(drafts)
  }
}

extension AppModel {
  /// Saved settings of every local balance, which every draft compares against.
  var savedPoolSettings: [PoolKey: PoolSettings] {
    Dictionary(connections.flatMap(\.poolRows).map { ($0.key, $0.settings) }) { first, _ in first }
  }
}

/// Native close confirmation: the close button, Escape and Cmd-W all route
/// through `performClose`, so `windowShouldClose` sees every user close.
/// Save / Discard / Cancel decisions live in `BalanceDrafts.resolveClose`.
@MainActor
final class UnsavedChangesGuard: NSObject, NSWindowDelegate {
  private let model: AppModel
  private let store: DraftStore
  private let onAttention: (PoolKey) -> Void

  init(model: AppModel, store: DraftStore, onAttention: @escaping (PoolKey) -> Void = { _ in }) {
    self.model = model
    self.store = store
    self.onAttention = onAttention
  }

  func windowShouldClose(_ sender: NSWindow) -> Bool {
    // Commit a field still being edited, so Cmd-W right after typing counts it.
    sender.makeFirstResponder(nil)
    let saved = model.savedPoolSettings
    guard store.drafts.needsCloseConfirmation(saved) else { return true }
    guard sender.attachedSheet == nil else { return false }
    let alert = NSAlert()
    alert.messageText = Copy.unsavedCloseTitle
    alert.informativeText = Copy.unsavedCloseMessage(store.drafts.dirtyKeys(saved).count)
    alert.addButton(withTitle: Copy.saveButton)
    alert.addButton(withTitle: Copy.discardButton)
    alert.addButton(withTitle: Copy.cancelButton)
    alert.beginSheetModal(for: sender) { [weak self, weak sender] response in
      guard let self, let sender else { return }
      let choice: BalanceDrafts.CloseChoice = switch response {
      case .alertFirstButtonReturn: .save
      case .alertSecondButtonReturn: .discard
      default: .cancel
      }
      self.resolve(choice, window: sender)
    }
    return false
  }

  /// `close()` skips `windowShouldClose`, so nothing outlives the window.
  func windowWillClose(_ notification: Notification) {
    store.drafts.discard()
    store.closeError = nil
    store.attention = nil
  }

  private func resolve(_ choice: BalanceDrafts.CloseChoice, window: NSWindow) {
    let outcome = store.drafts.resolveClose(choice, saved: model.savedPoolSettings) {
      model.saveSettings($0)
    }
    switch outcome {
    case .close:
      window.close()
    case .stay(.invalid(let key)):
      store.attention = key
      onAttention(key)
    case .stay(.failed(let message)):
      store.closeError = message
    case .stay:
      break
    }
  }
}
