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
  public init() {}
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

/// `@unchecked`: the only mutable state, the session cache, is behind `lock`.
public final class URLSessionTransport: ProviderTransport, @unchecked Sendable {
  private let session: URLSession
  private let defaultTimeout: TimeInterval
  /// One extra session per distinct non-default timeout. The resource timeout
  /// is set with the request timeout, or it would cap a longer request at the
  /// default.
  private let lock = NSLock()
  private var sessionsByTimeout: [TimeInterval: URLSession] = [:]

  public init(timeout: TimeInterval = 15) {
    defaultTimeout = timeout
    session = Self.makeSession(timeout: timeout)
  }

  private static func makeSession(timeout: TimeInterval) -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = timeout
    config.timeoutIntervalForResource = timeout
    config.urlCache = nil
    return URLSession(configuration: config)
  }

  private func session(timeout: TimeInterval) -> URLSession {
    if timeout == defaultTimeout { return session }
    lock.lock()
    defer { lock.unlock() }
    if let existing = sessionsByTimeout[timeout] { return existing }
    let created = Self.makeSession(timeout: timeout)
    sessionsByTimeout[timeout] = created
    return created
  }

  public func send(_ request: HTTPRequest) async throws -> HTTPResponse {
    var urlRequest = URLRequest(url: request.url)
    urlRequest.httpMethod = request.method
    urlRequest.httpBody = request.body
    return try await send(urlRequest, headers: request.headers, session: request.timeout.map(session(timeout:)))
  }

  private func send(_ request: URLRequest, headers: [String: String], session: URLSession? = nil) async throws -> HTTPResponse {
    let session = session ?? self.session
    var request = request
    for (name, value) in headers {
      request.setValue(value, forHTTPHeaderField: name)
    }
    let redirects = ProviderRedirectPolicy(origin: request.url!)
    let (data, response) = try await session.data(for: request, delegate: redirects)
    guard !redirects.rejected else { throw TransportFailure() }
    guard let http = response as? HTTPURLResponse else { throw TransportFailure() }
    var responseHeaders: [String: String] = [:]
    for (name, value) in http.allHeaderFields {
      if let name = name as? String, let value = value as? String { responseHeaders[name.lowercased()] = value }
    }
    return HTTPResponse(status: http.statusCode, body: data, headers: responseHeaders)
  }
}

/// A delegate belongs to one request, including all of its redirect hops. Never
/// forward headers, URL credentials or bodies outside that request's origin.
final class ProviderRedirectPolicy: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  private let origin: URL
  private let lock = NSLock()
  private var didReject = false

  init(origin: URL) { self.origin = origin }

  var rejected: Bool {
    lock.lock()
    defer { lock.unlock() }
    return didReject
  }

  static func allows(from origin: URL, to destination: URL) -> Bool {
    guard let scheme = origin.scheme?.lowercased(),
          scheme == "https" || scheme == "http",
          destination.scheme?.lowercased() == scheme,
          let host = origin.host?.lowercased(),
          destination.host?.lowercased() == host else { return false }
    let defaultPort = scheme == "https" ? 443 : 80
    return (origin.port ?? defaultPort) == (destination.port ?? defaultPort)
  }

  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    guard let url = request.url, Self.allows(from: origin, to: url) else {
      lock.lock()
      didReject = true
      lock.unlock()
      completionHandler(nil)
      return
    }
    completionHandler(request)
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
