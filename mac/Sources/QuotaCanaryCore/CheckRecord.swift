import Foundation
import os

/// What the last provider call for one connection actually did (QUO-279):
/// method, host + path, HTTP status, duration and a redacted slice of the
/// response body. Kept in memory only, shown in the balance inspector for a
/// failed check and included in the diagnostics export.
///
/// Redaction happens when the record is built, so nothing downstream can
/// forget it: the key (also percent-encoded, and each value of a multi-value
/// credential), every auth-style request header value and its token, and
/// anything shaped like an email are replaced before the body is cut to
/// `bodyLimit`. Response JSON is parsed before redaction; unparseable bodies
/// are omitted. The URL keeps host and path only, never the query. The
/// service drops the body of a check that read fine (`withoutBody`): an
/// account response can carry names and addresses and the export is meant to
/// be shared.
public struct CheckRecord: Codable, Equatable, Sendable {
  public static let bodyLimit = 2048

  public var method: String
  public var host: String
  public var path: String
  /// Nil when the transport failed before any answer.
  public var status: Int?
  public var durationMs: Int
  public var body: String
  public var checkedAt: Date

  public init(method: String, host: String, path: String, status: Int?, durationMs: Int, body: String, checkedAt: Date) {
    self.method = method
    self.host = host
    self.path = path
    self.status = status
    self.durationMs = durationMs
    self.body = body
    self.checkedAt = checkedAt
  }

  public var withoutBody: CheckRecord {
    var copy = self
    copy.body = ""
    return copy
  }

  /// The body as one short line for the inspector.
  public var excerpt: String {
    let line = body.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    return line.count > 160 ? String(line.prefix(160)) + "..." : line
  }

  /// "HTTP 400 · {...}", or "no response" when nothing came back.
  public var summary: String {
    guard let status else { return Copy.lastCheckNoResponse }
    return excerpt.isEmpty ? "HTTP \(status)" : "HTTP \(status) · \(excerpt)"
  }

  /// Everything the Copy button puts on the clipboard.
  public var clipboardText: String {
    var lines = ["\(method) \(host)\(path)", status.map { "HTTP \($0)" } ?? Copy.lastCheckNoResponse, "\(durationMs) ms"]
    if !body.isEmpty { lines.append(body) }
    return lines.joined(separator: "\n")
  }

  /// Builds a redacted record. `secrets` are the strings that must never
  /// appear: pass the key and the sent header values.
  static func make(
    method: String, url: URL, status: Int?, durationMs: Int, body: Data?, secrets: [String], now: Date
  ) -> CheckRecord {
    let redacted = { (text: String) in scrub(text, secrets: secrets) }
    let projectID = deepgramProjectID(in: url)
    let bodySecrets = projectID.map {
      secrets + [$0, $0.addingPercentEncoding(withAllowedCharacters: Deepgram.idAllowed) ?? $0]
    } ?? secrets
    var text = ""
    // The projects listing has no request ID to match against a provider echo.
    // Failed listing bodies are omitted rather than exposing a project ID.
    let unknownDeepgramProject = url.host == "api.deepgram.com" && projectID == nil
    if let body, !unknownDeepgramProject, let safeBody = sanitizedBody(body, secrets: bodySecrets) {
      text = safeBody
      if text.count > bodyLimit { text = String(text.prefix(bodyLimit)) + "..." }
    }
    let path: String
    if url.host == "api.deepgram.com", url.path.hasPrefix("/v1/projects/") {
      path = projectID == nil ? "/v1/projects/[project]" : "/v1/projects/[project]/balances"
    } else {
      path = redacted(url.path)
    }
    return CheckRecord(
      method: method, host: url.host ?? "", path: path, status: status,
      durationMs: durationMs, body: text, checkedAt: now
    )
  }

  /// The ID is private even though it is part of Deepgram's request URL.
  /// Read it from the encoded path so IDs containing a slash stay one value.
  private static func deepgramProjectID(in url: URL) -> String? {
    guard url.host == "api.deepgram.com",
          let path = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath,
          path.hasPrefix("/v1/projects/"), path.hasSuffix("/balances") else { return nil }
    let encoded = String(path.dropFirst("/v1/projects/".count).dropLast("/balances".count))
    return encoded.isEmpty ? nil : encoded.removingPercentEncoding
  }

  /// Every string that identifies the credential: the key as stored, its
  /// percent-encoded form, and the parts of a multi-value secret (a JSON
  /// object or `a:b`).
  static func secrets(key: String, headers: [String: String] = [:]) -> [String] {
    var found = [key, CatalogProvider.encode(key)]
    if let data = key.data(using: .utf8),
       let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      found += object.values.compactMap { $0 as? String }
    } else if key.contains(":") {
      found += key.split(separator: ":").map(String.init)
    }
    let plain: Set<String> = ["accept", "content-type", "user-agent"]
    for (name, value) in headers where !plain.contains(name.lowercased()) {
      found.append(value)
      // "Bearer abc" and "Basic <base64>": the token alone can be echoed too.
      if let token = value.split(separator: " ").last.map(String.init), token != value { found.append(token) }
    }
    return found.filter { !$0.isEmpty }
      .sorted { $0.count > $1.count }
  }

  /// Redact decoded JSON values and keys, then serialize them again. This catches
  /// JSON string escapes that cannot match a raw search of the response bytes.
  /// Unknown formats are discarded because their escaping rules are unknown.
  private static func sanitizedBody(_ body: Data, secrets: [String]) -> String? {
    guard String(data: body, encoding: .utf8) != nil,
          let json = try? JSONSerialization.jsonObject(with: body, options: .fragmentsAllowed) else { return nil }
    let safe = sanitize(json, secrets: secrets)
    guard let data = try? JSONSerialization.data(withJSONObject: safe, options: [.fragmentsAllowed, .sortedKeys]) else {
      return nil
    }
    return String(data: data, encoding: .utf8)
  }

  private static func sanitize(_ value: Any, secrets: [String]) -> Any {
    if let object = value as? [String: Any] {
      var safe: [String: Any] = [:]
      for (key, field) in object {
        let name = scrub(key, secrets: secrets)
        safe[name] = sensitiveField(key) ? "[redacted]" : sanitize(field, secrets: secrets)
      }
      return safe
    }
    if let array = value as? [Any] { return array.map { sanitize($0, secrets: secrets) } }
    if let string = value as? String {
      let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
      if (trimmed.hasPrefix("{") || trimmed.hasPrefix("[")),
         let nested = sanitizedBody(Data(string.utf8), secrets: secrets) { return nested }
      // A malformed serialized value, or another layer of JSON escaping, may
      // hide a credential from literal replacement.
      if trimmed.hasPrefix("{") || trimmed.hasPrefix("[") ||
         string.range(of: #"\\(?:u[0-9a-fA-F]{4}|["\\/bfnrt])"#, options: .regularExpression) != nil {
        return "[redacted]"
      }
      return scrub(string, secrets: secrets)
    }
    if let number = value as? NSNumber, secrets.contains(number.stringValue) { return "[redacted]" }
    return value
  }

  private static func sensitiveField(_ name: String) -> Bool {
    let normalized = name.lowercased().filter(\.isLetter)
    return ["password", "passwd", "secret", "token", "apikey", "accesskey", "authorization", "credential", "privatekey"]
      .contains { normalized.contains($0) }
  }

  static func scrub(_ text: String, secrets: [String]) -> String {
    var result = Diagnostics.redact(text, secrets: secrets)
    for secret in secrets where !secret.isEmpty {
      let strict = secret.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? secret
      let unreserved = CatalogProvider.encode(secret)
      let encodedValues = [strict, unreserved].flatMap { [$0, $0.replacingOccurrences(of: "%20", with: "+")] }
      for encoded in encodedValues where encoded != secret {
        result = result.replacingOccurrences(of: encoded, with: "[redacted]", options: .caseInsensitive)
      }
    }
    return result.replacingOccurrences(of: emailPattern, with: "[email]", options: .regularExpression)
  }

  private static let emailPattern = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"
}

/// One log line per provider call, for Console.app on this Mac. The body is
/// `.private`, so a sysdiagnose shows `<private>` there.
enum CheckLog {
  static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.quotacanary.mac", category: "check")

  static func log(_ record: CheckRecord) {
    logger.info(
      "\(record.method, privacy: .public) \(record.host, privacy: .public)\(record.path, privacy: .public) status=\(record.status.map(String.init) ?? "none", privacy: .public) \(record.durationMs, privacy: .public)ms body=\(record.body, privacy: .private)"
    )
  }
}

/// Wraps a transport for the length of one read, keeping the last call it
/// made as a redacted `CheckRecord` and logging each call.
public final class RecordingTransport: ProviderTransport, @unchecked Sendable {
  private let base: ProviderTransport
  private let key: String
  private let now: () -> Date
  private let lock = NSLock()
  private var last: CheckRecord?

  public init(_ base: ProviderTransport, key: String, now: @escaping () -> Date = Date.init) {
    self.base = base
    self.key = key
    self.now = now
  }

  /// The last call made through this wrapper.
  public var record: CheckRecord? {
    lock.lock()
    defer { lock.unlock() }
    return last
  }

  private func run(
    _ method: String, _ url: URL, _ headers: [String: String], _ call: () async throws -> HTTPResponse
  ) async throws -> HTTPResponse {
    let clock = ContinuousClock()
    let start = clock.now
    do {
      let response = try await call()
      finish(method, url, headers, start, clock, response)
      return response
    } catch {
      finish(method, url, headers, start, clock, nil)
      throw error
    }
  }

  private func finish(
    _ method: String, _ url: URL, _ headers: [String: String], _ start: ContinuousClock.Instant,
    _ clock: ContinuousClock, _ response: HTTPResponse?
  ) {
    let elapsed = start.duration(to: clock.now).components
    let ms = Int(elapsed.seconds) * 1000 + Int(elapsed.attoseconds / 1_000_000_000_000_000)
    let record = CheckRecord.make(
      method: method, url: url, status: response?.status, durationMs: ms, body: response?.body,
      secrets: CheckRecord.secrets(key: key, headers: headers), now: now()
    )
    lock.lock()
    last = record
    lock.unlock()
    CheckLog.log(record)
  }

  public func send(_ request: HTTPRequest) async throws -> HTTPResponse {
    try await run(request.method, request.url, request.headers) { try await base.send(request) }
  }
}
