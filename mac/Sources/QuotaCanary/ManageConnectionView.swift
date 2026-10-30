import AppKit
import QuotaCanaryCore
import SwiftUI

/// A connection's name, plus its provider in small type when the name alone
/// does not say which provider it is ("Client work  Hunter").
struct ConnectionTitle: View {
  let connection: Connection
  var font: Font = .subheadline.weight(.semibold)

  var body: some View {
    HStack(spacing: 6) {
      ProviderLogo(provider: connection.provider)
      HStack(alignment: .firstTextBaseline, spacing: 5) {
        Text(connection.name).font(font).lineLimit(1).truncationMode(.tail)
        if Self.showsProvider(connection) {
          Text(connection.provider.displayName)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .fixedSize()
        }
      }
    }
    .accessibilityElement(children: .combine)
  }

  static func showsProvider(_ connection: Connection) -> Bool {
    !connection.name.localizedCaseInsensitiveContains(connection.provider.displayName)
  }
}

/// Existing entry points now select the connection in the full stack window.
@MainActor
enum ManageConnectionWindow {
  static func show(model: AppModel, connectionID: String) {
    StackWindow.show(model: model, connectionID: connectionID)
  }
}

/// Rename, replace the key, or remove one connection.
struct ManageConnectionView: View {
  var model: AppModel
  let connectionID: String
  @State private var nameDraft: String
  @State private var nameResult: Result<Void, Message>?
  @State private var keyDraft = ""
  /// The replace-key values of a multi-value credential, by field name.
  @State private var credentialDrafts: [String: String] = [:]
  @State private var keyResult: Result<Void, Message>?
  @State private var replacing = false
  @State private var confirmingRemove: Bool
  @State private var removeError: String?
  private let onClose: () -> Void
  private let embedded: Bool

  struct Message: Error { let text: String }

  init(
    model: AppModel, connectionID: String, nameDraft: String? = nil, confirmingRemove: Bool = false,
    embedded: Bool = false,
    onClose: @escaping () -> Void = {}
  ) {
    self.model = model
    self.connectionID = connectionID
    let current = model.connections.first { $0.id == connectionID }
    _nameDraft = State(initialValue: nameDraft ?? current?.name ?? "")
    _confirmingRemove = State(initialValue: confirmingRemove)
    self.onClose = onClose
    self.embedded = embedded
  }

  private var connection: Connection? { model.connections.first { $0.id == connectionID } }

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      if let connection {
        if !embedded { ConnectionTitle(connection: connection, font: .headline) }
        nameSection(connection)
        keySection(connection)
        WatchedBalancesSection(model: model, connection: connection)

        Divider()
        removeSection
      }
    }
    .padding(embedded ? 0 : 20)
    .frame(width: embedded ? nil : 340, alignment: .leading)
  }

  // MARK: Name

  private func nameSection(_ connection: Connection) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(Copy.nameField).font(.subheadline.weight(.semibold))
      HStack {
        TextField(Copy.nameField, text: $nameDraft, prompt: Text(connection.provider.displayName))
          .labelsHidden()
          .textFieldStyle(.roundedBorder)
          .onSubmit { rename(connection) }
          .onChange(of: nameDraft) { nameResult = nil }
        Button(Copy.renameButton) { rename(connection) }
          .disabled(!canRename(connection))
      }
      if let error = liveNameError(connection) {
        ErrorLine(message: error)
      } else if case let .failure(message) = nameResult {
        ErrorLine(message: message.text)
      } else if case .success = nameResult {
        Note(text: Copy.nameSaved)
      }
    }
  }

  private func isUnchanged(_ connection: Connection) -> Bool {
    ConnectionNames.normalized(nameDraft) == connection.name
  }

  private func liveNameError(_ connection: Connection) -> String? {
    isUnchanged(connection) ? nil : model.renameError(id: connection.id, draft: nameDraft)
  }

  private func canRename(_ connection: Connection) -> Bool {
    !isUnchanged(connection) && liveNameError(connection) == nil
  }

  private func rename(_ connection: Connection) {
    guard canRename(connection) else { return }
    if let error = model.rename(id: connection.id, to: nameDraft) {
      nameResult = .failure(Message(text: error))
    } else {
      nameDraft = model.connections.first { $0.id == connection.id }?.name ?? nameDraft
      nameResult = .success(())
    }
  }

  // MARK: Key

  private func keySection(_ connection: Connection) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(Copy.replaceKeyTitle).font(.subheadline.weight(.semibold))
      if connection.provider.credentialFields.isEmpty {
        HStack {
          SecureField(Copy.replaceKeyPlaceholder(connection.provider.displayName), text: $keyDraft)
            .textFieldStyle(.roundedBorder)
            .onSubmit { replace(connection) }
            .onChange(of: keyDraft) { keyResult = nil }
            .disabled(model.isBusy)
          Button(Copy.updateKeyButton) { replace(connection) }
            .disabled(model.isBusy || newKey(connection).isEmpty)
        }
      } else {
        CredentialInputs(fields: connection.provider.credentialFields, values: $credentialDrafts) { replace(connection) }
          .onChange(of: credentialDrafts) { keyResult = nil }
          .disabled(model.isBusy)
        Button(Copy.updateKeyButton) { replace(connection) }
          .disabled(model.isBusy || newKey(connection).isEmpty)
      }
      Note(text: Copy.replaceKeyNote(connection.provider.displayName))
      if replacing {
        HStack(spacing: 6) {
          ProgressView().controlSize(.small)
          Note(text: Copy.connecting)
        }
      } else if case let .failure(message) = keyResult {
        ErrorLine(message: message.text)
      } else if case .success = keyResult {
        Note(text: Copy.keyUpdated)
      }
    }
  }

  /// The key the form would send; empty until every field is filled.
  private func newKey(_ connection: Connection) -> String {
    ConnectionNames.normalized(connection.provider.credential(key: keyDraft, inputs: credentialDrafts))
  }

  private func replace(_ connection: Connection) {
    let key = newKey(connection)
    guard !model.isBusy, !key.isEmpty else { return }
    replacing = true
    keyResult = nil
    Task {
      let error = await model.replaceKey(id: connection.id, key: key)
      replacing = false
      if let error {
        keyResult = .failure(Message(text: error))
      } else {
        keyDraft = ""
        credentialDrafts = [:]
        keyResult = .success(())
      }
    }
  }

  // MARK: Remove

  private var removeSection: some View {
    VStack(alignment: .leading, spacing: 8) {
      if confirmingRemove {
        Text(Copy.removeConfirmPrompt)
          .font(.callout)
          .fixedSize(horizontal: false, vertical: true)
        HStack {
          Spacer()
          Button(Copy.cancelButton) { confirmingRemove = false }
            .keyboardShortcut(.cancelAction)
          Button(Copy.removeConfirmButton, role: .destructive, action: remove)
            .disabled(model.isBusy)
        }
      } else {
        HStack {
          Button(Copy.removeButton, role: .destructive) {
            removeError = nil
            confirmingRemove = true
          }
          .disabled(model.isBusy)
          Spacer()
          if !embedded {
            Button(Copy.closeButton, action: onClose)
              .keyboardShortcut(.cancelAction)
          }
        }
      }
      ErrorLine(message: removeError)
    }
  }

  private func remove() {
    confirmingRemove = false
    removeError = model.remove(id: connectionID)
    if removeError == nil { onClose() }
  }
}

private struct Note: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.caption)
      .foregroundStyle(.secondary)
      .fixedSize(horizontal: false, vertical: true)
  }
}
