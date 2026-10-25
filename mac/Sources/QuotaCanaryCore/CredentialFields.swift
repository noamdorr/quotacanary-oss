import Foundation

/// One input of a credential that takes more than one value (QUO-251).
/// Mirrors a `tools.credential_fields` entry on the web: `name` is the JSON
/// key, `isSecret` picks a secure field over a plain one.
public struct CredentialField: Equatable, Sendable {
  public let name: String
  public let label: String
  public let isSecret: Bool

  public init(name: String, label: String, isSecret: Bool) {
    self.name = name
    self.label = label
    self.isSecret = isSecret
  }
}

/// A multi-value credential is stored as ONE Keychain secret: a JSON object
/// keyed by field name, the same shape the web encrypts
/// (`buildCredentialSecret` in src/lib/credentials.ts), so the string can move
/// to an account unchanged. Single-key providers have no fields and keep
/// storing the bare key.
public enum CredentialFields {
  /// The secret for `values` (keyed by field name), or nil when any field is
  /// blank or missing.
  public static func secret(_ fields: [CredentialField], values: [String: String]) -> String? {
    var object: [String: String] = [:]
    for field in fields {
      let value = (values[field.name] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      guard !value.isEmpty else { return nil }
      object[field.name] = value
    }
    guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes]) else {
      return nil
    }
    return String(data: data, encoding: .utf8)
  }

  /// Port of `credentialPair` (src/lib/adapters/shared.ts): the two named
  /// values of a stored secret, or nil when either is missing or blank. A
  /// secret that is not JSON is read as `first:second`, as the web does.
  public static func pair(_ secret: String, _ first: String, _ second: String) -> (String, String)? {
    let trimmed: (Any?) -> String = { ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
    if let data = secret.data(using: .utf8),
       let parsed = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) {
      let record = parsed as? [String: Any] ?? [:]
      let a = trimmed(record[first])
      let b = trimmed(record[second])
      return a.isEmpty || b.isEmpty ? nil : (a, b)
    }
    guard let separator = secret.firstIndex(of: ":"), separator != secret.startIndex else { return nil }
    let a = trimmed(String(secret[..<separator]))
    let b = trimmed(String(secret[secret.index(after: separator)...]))
    return a.isEmpty || b.isEmpty ? nil : (a, b)
  }

  /// A path segment escaped like the web's `encodeURIComponent`.
  static func pathSegment(_ value: String) -> String {
    value.addingPercentEncoding(withAllowedCharacters: unreserved) ?? value
  }

  private static let unreserved = CharacterSet(
    charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()"
  )

  /// The `Authorization` value for HTTP Basic over two values.
  static func basic(_ user: String, _ password: String) -> String {
    "Basic \(Data("\(user):\(password)".utf8).base64EncodedString())"
  }
}
