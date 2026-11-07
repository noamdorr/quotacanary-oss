import Foundation
import Network
import Testing
@testable import QuotaCanaryCore

@Suite("Provider transport redirects")
struct TransportRedirectTests {
  @Test(arguments: [false, true], [false, true])
  func crossOriginReceivesNoRequest(changeHost: Bool, customTimeout: Bool) async throws {
    let target = try await RedirectServer.start()
    defer { target.stop() }
    let source = try await RedirectServer.start()
    defer { source.stop() }
    let destinationURL = changeHost
      ? source.url(host: "localhost", path: "/target?api_key=synthetic-url-secret")
      : target.url(path: "/target?api_key=synthetic-url-secret")
    var destination = URLComponents(url: destinationURL, resolvingAgainstBaseURL: false)!
    destination.user = "synthetic-user"
    destination.password = "synthetic-password"
    source.redirect(to: destination.url!)
    let transport = URLSessionTransport()
    do {
      _ = try await transport.send(HTTPRequest(
        "POST", source.url(path: "/start?key=synthetic-url-secret"),
        headers: ["X-API-Key": "synthetic-custom-secret", "Authorization": "Bearer synthetic-auth-secret"],
        body: Data("key=synthetic-body-secret".utf8), timeout: customTimeout ? 4 : nil
      ))
      Issue.record("Cross-origin redirect must throw a typed transport failure")
    } catch {
      #expect(error is TransportFailure)
    }
    #expect(source.requests.count == 1)
    #expect(target.requests.isEmpty)
    // A rejected request must not poison other requests using the same session.
    #expect(try await transport.get(source.url(path: "/direct"), headers: [:]).status == 200)
  }

  @Test(arguments: [302, 303, 307, 308])
  func sameOriginPreservesNativeSemantics(status: Int) async throws {
    let server = try await RedirectServer.start()
    defer { server.stop() }
    server.redirect(to: server.url(path: "/target?key=synthetic-url-secret"), status: status)
    let transport = URLSessionTransport()
    let result = try await transport.post(
      server.url(path: "/start"),
      headers: ["X-API-Key": "synthetic-custom-secret", "Authorization": "Bearer synthetic-auth-secret"],
      body: Data("key=synthetic-body-secret".utf8)
    )
    #expect(result.status == 200)
    let redirected = try #require(server.requests.last)
    let preservesBody = status == 307 || status == 308
    let method = preservesBody ? "POST" : "GET"
    #expect(redirected.contains("\(method) /target?key=synthetic-url-secret HTTP/1.1"))
    #expect(redirected.lowercased().contains("x-api-key: synthetic-custom-secret"))
    #expect(server.requests[0].lowercased().contains("authorization: bearer synthetic-auth-secret"))
    // CFNetwork strips Authorization on redirect, even within the same origin.
    #expect(!redirected.lowercased().contains("authorization:"))
    #expect(redirected.hasSuffix("key=synthetic-body-secret") == preservesBody)
    #expect(try await transport.get(server.url(path: "/direct"), headers: [:]).status == 200)
    #expect(server.requests.count == 3)
  }

  @Test(arguments: [false, true])
  func providerRejectsOversizedBytesWithoutTrustingHeaders(customTimeout: Bool) async throws {
    let server = try await RedirectServer.start()
    defer { server.stop() }
    let transport = URLSessionTransport()
    let path = server.url(path: "/bytes")
    let count = URLSessionTransport.maximumResponseBytes + 1
    let payload = String(repeating: "a", count: count)
    for wire in ["Content-Length: \(count)\r\n\r\n" + String(repeating: "a", count: 4096), "\r\n" + payload,
                 "Transfer-Encoding: chunked\r\n\r\n" + String(count, radix: 16) + "\r\n" + payload + "\r\n0\r\n\r\n"] {
      server.respond(with: Data(("HTTP/1.1 200 OK\r\nConnection: close\r\n" + wire).utf8), keepOpen: wire.hasPrefix("Content-Length"))
      await #expect(throws: TransportFailure.self) {
        try await transport.send(HTTPRequest("GET", path, timeout: customTimeout ? 4 : nil))
      }
    }
    server.respond(with: Data("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nX-Remaining: 7\r\n\r\nok".utf8))
    let good = try await transport.get(path, headers: [:])
    #expect(good.body == Data("ok".utf8))
    #expect(good.header("x-remaining") == "7")
  }

  @Test func compressedProviderBodyIsLimitedAfterDecoding() async throws {
    let server = try await RedirectServer.start()
    defer { server.stop() }
    let input = FileManager.default.temporaryDirectory.appendingPathComponent("qc-gzip-\(UUID())")
    defer { try? FileManager.default.removeItem(at: input) }
    try Data(repeating: 65, count: URLSessionTransport.maximumResponseBytes + 1).write(to: input)
    let gzip = Process()
    gzip.executableURL = URL(fileURLWithPath: "/usr/bin/gzip")
    gzip.arguments = ["-c", input.path]
    let output = Pipe()
    gzip.standardOutput = output
    try gzip.run()
    let compressed = output.fileHandleForReading.readDataToEndOfFile()
    gzip.waitUntilExit()
    #expect(gzip.terminationStatus == 0)
    #expect(compressed.count < 4096)
    let header = "HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\nContent-Length: \(compressed.count)\r\n\r\n"
    server.respond(with: Data(header.utf8) + compressed)
    await #expect(throws: TransportFailure.self) {
      try await URLSessionTransport().get(server.url(path: "/compressed"), headers: [:])
    }
  }

  @Test func oversizedFeedAndArchiveRejectAndRemovePartialFiles() async throws {
    let server = try await RedirectServer.start()
    defer { server.stop() }
    let url = server.url(path: "/bytes")
    let transport = URLSessionUpdateTransport(feedURL: url)
    let destination = FileManager.default.temporaryDirectory.appendingPathComponent("qc-bounded-\(UUID()).zip")
    defer { try? FileManager.default.removeItem(at: destination) }
    let large = Data(repeating: 65, count: UpdateFeed.maximumFeedBytes + 1)
    server.respond(with: Data("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n".utf8) + large)
    await #expect(throws: TransportFailure.self) { try await transport.fetch(url, headers: [:]) }
    // Exercise actual streamed file bytes at a small cap without writing 64 MB.
    await #expect(throws: TransportFailure.self) {
      try await BoundedHTTP.send(URLRequest(url: url), configuration: .ephemeral,
                                 maximumBytes: 1000, to: destination) { _, _ in false }
    }
    #expect(!FileManager.default.fileExists(atPath: destination.path))
    server.respond(with: Data("HTTP/1.1 200 OK\r\nContent-Length: \(UpdateFeed.maximumArchiveBytes + 1)\r\n\r\n".utf8) + Data(repeating: 65, count: 4096), keepOpen: true)
    await #expect(throws: TransportFailure.self) { try await transport.download(url, headers: [:], to: destination) }
    #expect(!FileManager.default.fileExists(atPath: destination.path))
    server.respond(with: Data("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok".utf8))
    try await transport.download(url, headers: [:], to: destination)
    #expect(try Data(contentsOf: destination) == Data("ok".utf8))
  }

  @Test func developmentFeedAndArchiveNeverRedirectOffOrigin() async throws {
    let source = try await RedirectServer.start()
    defer { source.stop() }
    let target = try await RedirectServer.start()
    defer { target.stop() }
    source.redirect(to: target.url(path: "/target"))
    let url = source.url(path: "/start")
    let transport = URLSessionUpdateTransport(feedURL: url)
    let file = FileManager.default.temporaryDirectory.appendingPathComponent("qc-redirect-\(UUID())")
    defer { try? FileManager.default.removeItem(at: file) }
    await #expect(throws: TransportFailure.self) { try await transport.fetch(url, headers: [:]) }
    await #expect(throws: TransportFailure.self) { try await transport.download(url, headers: [:], to: file) }
    #expect(target.requests.isEmpty)
    #expect(!FileManager.default.fileExists(atPath: file.path))
  }

  @Test(arguments: [
    ("https://api.example/start", "http://api.example/target", false),
    ("https://api.example/start", "https://api.example:443/target", true),
    ("http://api.example/start", "http://API.EXAMPLE:80/target", true),
    ("https://api.example/start", "https://api.example:444/target", false),
    ("https://api.example/start", "https://other.example/target", false),
    ("https://api.example/start", "file:///target", false),
  ])
  func originDecision(origin: String, destination: String, allowed: Bool) {
    #expect(ProviderRedirectPolicy.allows(from: URL(string: origin)!, to: URL(string: destination)!) == allowed)
  }
}

/// An actual loopback HTTP server, so these tests exercise URLSession's redirect
/// delegate rather than mocking the transport or URLProtocol redirect behavior.
private final class RedirectServer: @unchecked Sendable {
  private let listener: NWListener
  private let queue = DispatchQueue(label: "QuotaCanary.redirect-test")
  private var captured: [String] = []
  private var destination: URL?
  private var redirectStatus = 307
  private var wire: Data?
  private var keepOpen = false
  private var connections: [NWConnection] = []

  private init() throws {
    let parameters = NWParameters.tcp
    parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
    listener = try NWListener(using: parameters)
  }

  static func start() async throws -> RedirectServer {
    let server = try RedirectServer()
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      server.listener.stateUpdateHandler = { state in
        switch state {
        case .ready:
          server.listener.stateUpdateHandler = nil
          continuation.resume()
        case let .failed(error):
          server.listener.stateUpdateHandler = nil
          continuation.resume(throwing: error)
        default: break
        }
      }
      server.listener.newConnectionHandler = { connection in
        server.connections.append(connection)
        connection.start(queue: server.queue)
        server.receive(connection, accumulated: Data())
      }
      server.listener.start(queue: server.queue)
    }
    return server
  }

  func url(host: String = "127.0.0.1", path: String) -> URL {
    URL(string: "http://\(host):\(listener.port!.rawValue)\(path)")!
  }

  var requests: [String] { queue.sync { captured } }
  func redirect(to url: URL, status: Int = 307) {
    queue.sync { destination = url; redirectStatus = status }
  }
  func respond(with wire: Data, keepOpen: Bool = false) {
    queue.sync { self.wire = wire; self.keepOpen = keepOpen }
  }
  func stop() {
    queue.sync {
      listener.newConnectionHandler = nil
      listener.cancel()
      connections.forEach { $0.cancel() }
    }
  }

  private func receive(_ connection: NWConnection, accumulated: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, complete, error in
      var buffer = accumulated
      if let data { buffer.append(data) }
      let request = String(decoding: buffer, as: UTF8.self)
      if let separator = request.range(of: "\r\n\r\n") {
        let headers = request[..<separator.lowerBound].components(separatedBy: "\r\n")
        let length = headers.first { $0.lowercased().hasPrefix("content-length:") }
          .flatMap { Int($0.split(separator: ":", maxSplits: 1)[1].trimmingCharacters(in: .whitespaces)) } ?? 0
        if request[separator.upperBound...].utf8.count >= length {
          self.captured.append(request)
          if let wire = self.wire {
            let keepOpen = self.keepOpen
            connection.send(content: wire, completion: .contentProcessed { _ in if !keepOpen { connection.cancel() } })
            return
          }
          let response: String
          if headers[0].contains(" /start"), let destination = self.destination {
            response = "HTTP/1.1 \(self.redirectStatus) Redirect\r\nLocation: \(destination.absoluteString)\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
          } else {
            response = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok"
          }
          connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in connection.cancel() })
          return
        }
      }
      if !complete && error == nil { self.receive(connection, accumulated: buffer) }
      else { connection.cancel() }
    }
  }
}
