import Foundation
import Security

public enum CredentialStoreError: Error, Equatable {
  case notFound
  case status(Int32)
}

/// Where credentials live. Implementations must never write secrets anywhere else.
public protocol CredentialStore: AnyObject {
  func save(_ secret: String, ref: String) throws
  func read(ref: String) throws -> String
  /// Deleting a missing item is not an error.
  func delete(ref: String) throws
  /// Removes every item this store owns, including ones no connection points
  /// at any more. Nothing left is not an error.
  func deleteAll() throws
}

/// Login-keychain generic passwords, non-synchronizing. Unsigned SwiftPM
/// builds cannot use the data-protection keychain (-34018), so this uses the
/// default keychain.
public final class KeychainCredentialStore: CredentialStore {
  public static let defaultService = "com.quotacanary.mac"
  private let service: String

  public init(service: String = KeychainCredentialStore.defaultService) {
    self.service = service
  }

  private func query(_ ref: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: ref,
      kSecAttrSynchronizable as String: kCFBooleanFalse as Any,
    ]
  }

  public func save(_ secret: String, ref: String) throws {
    let data = Data(secret.utf8)
    var add = query(ref)
    add[kSecValueData as String] = data
    let status = SecItemAdd(add as CFDictionary, nil)
    if status == errSecDuplicateItem {
      let update = SecItemUpdate(query(ref) as CFDictionary, [kSecValueData as String: data] as CFDictionary)
      guard update == errSecSuccess else { throw CredentialStoreError.status(update) }
      return
    }
    guard status == errSecSuccess else { throw CredentialStoreError.status(status) }
  }

  public func read(ref: String) throws -> String {
    var q = query(ref)
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(q as CFDictionary, &item)
    if status == errSecItemNotFound { throw CredentialStoreError.notFound }
    guard status == errSecSuccess, let data = item as? Data, let secret = String(data: data, encoding: .utf8) else {
      throw CredentialStoreError.status(status)
    }
    return secret
  }

  public func delete(ref: String) throws {
    let status = SecItemDelete(query(ref) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw CredentialStoreError.status(status)
    }
  }

  public func deleteAll() throws {
    // One query without an account: delete until nothing matches, because the
    // legacy keychain may remove only one item per call.
    let all: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrSynchronizable as String: kCFBooleanFalse as Any,
    ]
    for _ in 0..<1000 {
      let status = SecItemDelete(all as CFDictionary)
      if status == errSecItemNotFound { return }
      guard status == errSecSuccess else { throw CredentialStoreError.status(status) }
    }
  }
}

/// In-memory store for tests and the synthetic UI mode. `failing` simulates
/// an unavailable keychain.
public final class InMemoryCredentialStore: CredentialStore {
  public private(set) var items: [String: String] = [:]
  public var failing = false

  public init() {}

  public func save(_ secret: String, ref: String) throws {
    if failing { throw CredentialStoreError.status(-25308) }
    items[ref] = secret
  }

  public func read(ref: String) throws -> String {
    if failing { throw CredentialStoreError.status(-25308) }
    guard let secret = items[ref] else { throw CredentialStoreError.notFound }
    return secret
  }

  public func delete(ref: String) throws {
    if failing { throw CredentialStoreError.status(-25308) }
    items[ref] = nil
  }

  public func deleteAll() throws {
    if failing { throw CredentialStoreError.status(-25308) }
    items = [:]
  }
}
