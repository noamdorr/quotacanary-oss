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
