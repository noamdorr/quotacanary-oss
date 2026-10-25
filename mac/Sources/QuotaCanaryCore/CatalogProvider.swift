import Foundation

/// Reads a balance for any catalog entry. Port of src/lib/adapters/catalog.ts:
/// the same request building, status mapping, body checks and pool rules, so
/// the catalog proves itself here the way it does on the web.
///
/// Mac-only differences, both deliberate: HTTP 429 is `rateLimited` unless
/// the entry overrides it (every Mac adapter does this, QUO-133), and a
/// vendor-reported error is `reportedError` carrying the vendor's string for
/// the row, as the web shows it; diagnostics export only the case name.
public enum CatalogProvider {
  /// Rejected keys and throttling unless the entry says otherwise; every
  /// other failing status renders as "<name> returned <status>."
  static let defaultErrors: [String: CatalogEntry.ErrorKind] = ["401": .invalidKey]

  public static func read(_ entry: CatalogEntry, key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let request = try request(entry, key: key)
    let response: HTTPResponse
    do {
      response = try await transport.send(request)
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parse(entry, response)
  }

  /// The key never lands anywhere the entry did not ask for: one header, one
  /// query parameter, or the `{key}` slot in the path, percent-encoded there.
  public static func request(_ entry: CatalogEntry, key: String) throws -> HTTPRequest {
    var headers = entry.request.headers ?? [:]
    var url = entry.request.url
    switch entry.auth.in {
    case .header:
      headers[entry.auth.name ?? ""] = entry.auth.format.replacingOccurrences(of: "{key}", with: key)
    case .query:
      let separator = url.contains("?") ? "&" : "?"
      url += "\(separator)\(entry.auth.name ?? "")=\(encode(key))"
    case .path:
      url = url.replacingOccurrences(of: "{key}", with: encode(key))
    }
    guard let resolved = URL(string: url) else { throw ProviderReadError.unreachable }
    return HTTPRequest(
      entry.request.method.rawValue, resolved, headers: headers, body: entry.request.body.map { Data($0.utf8) }
    )
  }

  public static func parse(_ entry: CatalogEntry, _ response: HTTPResponse) throws -> [PoolBalance] {
    let status = String(response.status)
    let kind = entry.errors?[status] ?? defaultErrors[status]
    switch kind {
    case .invalidKey: throw ProviderReadError.keyRejected
    case .http: throw failingStatus(entry, response)
    case nil:
      if response.status == 429 { throw ProviderReadError.rateLimited }
      guard (200..<300).contains(response.status) else { throw failingStatus(entry, response) }
    }
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    if let rule = entry.bodyError, rule.on != .non2xx, let error = bodyError(rule, in: json) {
      throw error
    }
    if let errorPath = entry.errorPath, let message = value(at: errorPath, in: json) as? String, !message.isEmpty {
      throw ProviderReadError.reportedError(message)
    }
    if let reject = entry.rejectWhen, let flag = value(at: reject.path, in: json) as? NSNumber,
       CFGetTypeID(flag) == CFBooleanGetTypeID(), flag.boolValue == reject.equals {
      throw ProviderReadError.keyRejected
    }
    let balances = entry.pools.compactMap { balance(of: $0, in: json) }
    guard !balances.isEmpty else {
      // Named after the first pool's primary path, like the hand-written ports.
      throw ProviderReadError.missingField(entry.pools.first.flatMap { $0.balance ?? $0.limit } ?? "pools")
    }
    return balances
  }

  /// A failing status reads its body only for a bodyError rule that asks to;
  /// otherwise, or when the rule does not fire, it is the status itself. A
  /// body that is not JSON reads as empty, as the web's undefined does.
  static func failingStatus(_ entry: CatalogEntry, _ response: HTTPResponse) -> ProviderReadError {
    if let rule = entry.bodyError, rule.on != .twoXX {
      let json = (try? JSONSerialization.jsonObject(with: response.body)) ?? NSNull()
      if let error = bodyError(rule, in: json) { return error }
    }
    return .httpStatus(response.status)
  }

  /// The web's readBodyError: with `when`, the flag decides, then the first
  /// non-empty string in the chain or the fallback; without, the first
  /// non-empty string, if any. Nil when the rule does not apply.
  static func bodyError(_ rule: CatalogEntry.BodyError, in json: Any) -> ProviderReadError? {
    if let when = rule.when, !fires(when, in: json) { return nil }
    if let rejected = rule.keyRejectedWhen, value(at: rejected.path, in: json) as? String == rejected.equals {
      return .keyRejected
    }
    for path in rule.messagePaths {
      if let message = value(at: path, in: json) as? String, !message.isEmpty { return .reportedError(message) }
    }
    guard rule.when != nil else { return nil }
    return rule.fallback == .invalidKey ? .keyRejected : .reportedError(nil)
  }

  /// JavaScript's `===`, `!==` and `Boolean()` over a JSONSerialization value.
  static func fires(_ when: CatalogEntry.BodyError.When, in json: Any) -> Bool {
    let found = value(at: when.path, in: json)
    switch when {
    case let .equals(_, expected):
      guard let flag = found as? NSNumber, CFGetTypeID(flag) == CFBooleanGetTypeID() else { return false }
      return flag.boolValue == expected
    case let .notEquals(_, unexpected):
      return (found as? String) != unexpected
    case .truthy:
      switch found {
      case nil, is NSNull: return false
      case let string as String: return !string.isEmpty
      case let number as NSNumber:
        return CFGetTypeID(number) == CFBooleanGetTypeID() ? number.boolValue : !(number.doubleValue == 0 || number.doubleValue.isNaN)
      default: return true
      }
    }
  }

  /// The pool rules shared with the web. `Pool.cap` is the web's balanceLimit.
  static func balance(of spec: CatalogEntry.PoolSpec, in json: Any) -> PoolBalance? {
    func number(_ path: String?) -> Double? {
      path.flatMap { ProviderJSON.finiteOrNil(value(at: $0, in: json)) }
    }
    let used = number(spec.used)
    var pool = Pool(creditType: spec.creditType, label: spec.label, unit: spec.unit, cap: nil)
    guard let balancePath = spec.balance else {
      // Limit given, balance absent: used defaults to 0, a limit of 0 is kept
      // (a known allowance the plan lacks).
      guard let limit = number(spec.limit) else { return nil }
      pool.cap = limit
      return PoolBalance(pool: pool, balance: limit - (used ?? 0))
    }
    guard let balance = number(balancePath) else { return nil }
    if spec.limit != nil {
      if let limit = number(spec.limit), limit > 0 { pool.cap = limit }
    } else if let used, balance + used > 0 {
      // The web reports balance + used as-is. Here cap 0 means "not in plan"
      // (PoolStatus.unavailable), which an exhausted account is not, so a
      // derived total of 0 stays capless and reads as empty.
      pool.cap = balance + used
    }
    return PoolBalance(pool: pool, balance: balance)
  }

  /// Dotted keys; a numeric segment indexes an array, `0` on a bare-array body
  /// (the web's readPath gets this from JavaScript's array-as-object rule).
  static func value(at path: String, in json: Any) -> Any? {
    var current: Any? = json
    for segment in path.split(separator: ".", omittingEmptySubsequences: false) {
      if let array = current as? [Any] {
        guard let index = Int(segment), array.indices.contains(index) else { return nil }
        current = array[index]
      } else if let object = current as? [String: Any] {
        current = object[String(segment)]
      } else {
        return nil
      }
    }
    return current
  }

  /// encodeURIComponent: everything but A-Z a-z 0-9 - _ . ! ~ * ' ( ) is escaped.
  static func encode(_ key: String) -> String {
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-_.!~*'()")
    return key.addingPercentEncoding(withAllowedCharacters: allowed) ?? key
  }
}
