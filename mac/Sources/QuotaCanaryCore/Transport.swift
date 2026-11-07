import Foundation

public struct HTTPResponse: Equatable, Sendable {
  public var status: Int
  public var body: Data
  /// Response headers with lowercased names (People Data Labs reads its
  /// balance from `x-totallimit-remaining`). Read a named header through
  /// `header(_:)`, since HTTP header names are case-insensitive.
  public var headers: [String: String]

  public init(status: Int, body: Data, headers: [String: String] = [:]) {
    self.status = status
    self.body = body
    self.headers = headers
  }

  public func header(_ name: String) -> String? {
    headers.first { $0.key.caseInsensitiveCompare(name) == .orderedSame }?.value
  }
}

public struct TransportFailure: Error {
  let oversized: Bool
  public init() { oversized = false }
  init(oversized: Bool) { self.oversized = oversized }
}

/// One HTTP request: the only shape that crosses the transport seam (QUO-314).
public struct HTTPRequest: Equatable, Sendable {
  public var method: String
  public var url: URL
  public var headers: [String: String]
  /// Sent verbatim; nil sends no body.
  public var body: Data?
  /// Seconds, for an endpoint slower than the transport's default
  /// (Firecrawl's credit usage, Move to account); nil uses the default.
  public var timeout: TimeInterval?

  public init(
    _ method: String, _ url: URL, headers: [String: String] = [:], body: Data? = nil, timeout: TimeInterval? = nil
  ) {
    self.method = method
    self.url = url
    self.headers = headers
    self.body = body
    self.timeout = timeout
  }
}

/// The only way provider code reaches the network. Throws on transport failure.
public protocol ProviderTransport: AnyObject, Sendable {
  func send(_ request: HTTPRequest) async throws -> HTTPResponse
}

public extension ProviderTransport {
  func get(_ url: URL, headers: [String: String]) async throws -> HTTPResponse {
    try await send(HTTPRequest("GET", url, headers: headers))
  }

  /// A POST, with the body sent verbatim or empty. Only for read endpoints
  /// that the provider documents as POST (Apollo's credit usage stats, a
  /// catalog entry's `request.body`); never for a write.
  func post(_ url: URL, headers: [String: String], body: Data? = nil) async throws -> HTTPResponse {
    try await send(HTTPRequest("POST", url, headers: headers, body: body))
  }

  /// A HEAD, for a provider whose balance lives in response headers
  /// (People Data Labs). The body is empty.
  func head(_ url: URL, headers: [String: String]) async throws -> HTTPResponse {
    try await send(HTTPRequest("HEAD", url, headers: headers))
  }
}

/// Provider responses are small account/usage documents. Reject oversized
/// answers before buffering or parsing them, including custom timeout calls.
public final class URLSessionTransport: ProviderTransport {
  static let maximumResponseBytes = 1024 * 1024
  private let defaultTimeout: TimeInterval

  public init(timeout: TimeInterval = 15) { defaultTimeout = timeout }

  public func send(_ request: HTTPRequest) async throws -> HTTPResponse {
    var urlRequest = URLRequest(url: request.url)
    urlRequest.httpMethod = request.method
    urlRequest.httpBody = request.body
    for (name, value) in request.headers { urlRequest.setValue(value, forHTTPHeaderField: name) }
    let timeout = request.timeout ?? defaultTimeout
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = timeout
    config.timeoutIntervalForResource = timeout
    config.urlCache = nil
    let origin = request.url
    return try await BoundedHTTP.send(urlRequest, configuration: config, maximumBytes: Self.maximumResponseBytes) {
      ProviderRedirectPolicy.allows(from: origin, to: $1)
    }
  }
}

/// The same policy applies to every redirect hop in one request. Never
/// forward headers, URL credentials or bodies outside that request's origin.
enum ProviderRedirectPolicy {
  static func allows(from origin: URL, to destination: URL) -> Bool {
    guard let scheme = origin.scheme?.lowercased(),
          scheme == "https" || scheme == "http",
          destination.scheme?.lowercased() == scheme,
          let host = origin.host?.lowercased(),
          destination.host?.lowercased() == host else { return false }
    let defaultPort = scheme == "https" ? 443 : 80
    return (origin.port ?? defaultPort) == (destination.port ?? defaultPort)
  }
}

/// Replays scripted steps in order, then repeats the last one.
/// Used by tests and by the synthetic UI mode.
/// `@unchecked`: a test double, scripted and read by one test at a time.
public final class ScriptedTransport: ProviderTransport, @unchecked Sendable {
  public enum Step: Sendable {
    case respond(status: Int, body: String, headers: [String: String] = [:])
    case fail
    /// Suspends the request until the test calls `gate.open()`, then answers
    /// with the gate's response. For testing results that land late.
    case held(Gate)
    /// Never answers; throws once the calling task is cancelled (as URLSession does).
    case hang
  }

  public private(set) var requests: [(url: URL, headers: [String: String], method: String, body: Data?)] = []
  /// The per-request timeout of each request, parallel to `requests`: nil for
  /// every call that did not ask for one.
  public private(set) var timeouts: [TimeInterval?] = []
  /// Every request with its body, in the shape the hosted API tests read.
  public var sent: [(url: URL, method: String, headers: [String: String], body: Data?)] {
    requests.map { ($0.url, $0.method, $0.headers, $0.body) }
  }
  private var steps: [Step]

  public init(_ steps: [Step]) {
    self.steps = steps
  }

  public func script(_ steps: [Step]) {
    self.steps = steps
  }

  public func send(_ request: HTTPRequest) async throws -> HTTPResponse {
    requests.append((request.url, request.headers, request.method, request.body))
    timeouts.append(request.timeout)
    guard let step = steps.first else { throw TransportFailure() }
    if steps.count > 1 { steps.removeFirst() }
    switch step {
    case let .respond(status, body, responseHeaders):
      return HTTPResponse(status: status, body: Data(body.utf8), headers: responseHeaders)
    case .fail: throw TransportFailure()
    case let .held(gate):
      await gate.wait()
      return HTTPResponse(status: gate.status, body: Data(gate.body.utf8))
    case .hang:
      while true {
        try await Task.sleep(nanoseconds: 3_600_000_000_000)
      }
    }
  }
}

extension ScriptedTransport {
  /// A request parked mid-flight. `arrived` turns true once a request is
  /// waiting on it; `open()` lets it answer.
  public final class Gate: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Void, Never>?
    private var isOpen = false
    private var hasArrived = false
    let status: Int
    let body: String

    public init(status: Int, body: String) {
      self.status = status
      self.body = body
    }

    public var arrived: Bool {
      lock.lock()
      defer { lock.unlock() }
      return hasArrived
    }

    public func open() {
      lock.lock()
      isOpen = true
      let waiting = continuation
      continuation = nil
      lock.unlock()
      waiting?.resume()
    }

    func wait() async {
      await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
        lock.lock()
        hasArrived = true
        if isOpen {
          lock.unlock()
          c.resume()
        } else {
          continuation = c
          lock.unlock()
        }
      }
    }
  }
}

/// Sends each request to the scripted transport for its host, so one fake
/// network can serve several providers. Unknown hosts fail like a dead network.
public final class RoutedTransport: ProviderTransport {
  public let routes: [String: ScriptedTransport]

  public init(_ routes: [String: ScriptedTransport]) {
    self.routes = routes
  }

  public func send(_ request: HTTPRequest) async throws -> HTTPResponse {
    try await route(request.url).send(request)
  }

  private func route(_ url: URL) throws -> ScriptedTransport {
    guard let host = url.host, let route = routes[host] else { throw TransportFailure() }
    return route
  }
}
