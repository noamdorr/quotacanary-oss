import Foundation

/// Counts decoded response bytes as URLSession delivers them, before retaining
/// them or writing them to disk. Content-Length is only an early rejection.
/// Each request owns its session and serial delegate queue, including redirects.
final class BoundedHTTP: NSObject, URLSessionDataDelegate, @unchecked Sendable {
  private let maximumBytes: Int
  private let destination: URL?
  private let requiredStatus: Int?
  private let allowsRedirect: @Sendable (URL, URL) -> Bool
  private var file: FileHandle?
  private var body = Data()
  private var received = 0
  private var response: HTTPURLResponse?
  private var failure: Error?
  private var continuation: CheckedContinuation<HTTPResponse, Error>?
  // Cancellation can arrive before start or from outside the delegate queue.
  private let lock = NSLock()
  private var task: URLSessionDataTask?
  private var cancelled = false

  private init(
    maximumBytes: Int, destination: URL?, requiredStatus: Int?,
    allowsRedirect: @escaping @Sendable (URL, URL) -> Bool
  ) throws {
    self.maximumBytes = maximumBytes
    self.destination = destination
    self.requiredStatus = requiredStatus
    self.allowsRedirect = allowsRedirect
    if let destination {
      try Data().write(to: destination, options: .withoutOverwriting)
      do {
        file = try FileHandle(forWritingTo: destination)
      } catch {
        try? FileManager.default.removeItem(at: destination)
        throw error
      }
    }
  }

  static func send(
    _ request: URLRequest, configuration: URLSessionConfiguration, maximumBytes: Int,
    to destination: URL? = nil, requiredStatus: Int? = nil,
    allowsRedirect: @escaping @Sendable (URL, URL) -> Bool
  ) async throws -> HTTPResponse {
    let receiver = try BoundedHTTP(
      maximumBytes: maximumBytes, destination: destination, requiredStatus: requiredStatus,
      allowsRedirect: allowsRedirect
    )
    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        receiver.start(request, configuration: configuration, continuation: continuation)
      }
    } onCancel: {
      receiver.cancel()
    }
  }

  private func start(
    _ request: URLRequest, configuration: URLSessionConfiguration,
    continuation: CheckedContinuation<HTTPResponse, Error>
  ) {
    lock.lock()
    defer { lock.unlock() }
    self.continuation = continuation
    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    let task = session.dataTask(with: request)
    self.task = task
    task.resume()
    if cancelled { task.cancel() }
  }

  private func cancel() {
    lock.lock()
    defer { lock.unlock() }
    cancelled = true
    task?.cancel()
  }

  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    guard let previous = response.url, let url = request.url, allowsRedirect(previous, url) else {
      failure = TransportFailure()
      completionHandler(nil)
      return
    }
    completionHandler(request)
  }

  func urlSession(
    _ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    guard let http = response as? HTTPURLResponse,
          requiredStatus == nil || http.statusCode == requiredStatus,
          failure == nil else {
      failure = TransportFailure()
      completionHandler(.cancel)
      return
    }
    guard dataTask.originalRequest?.httpMethod == "HEAD" || response.expectedContentLength <= maximumBytes else {
      failure = TransportFailure(oversized: true)
      completionHandler(.cancel)
      return
    }
    self.response = http
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard failure == nil else { return }
    guard data.count <= maximumBytes - received else {
      failure = TransportFailure(oversized: true)
      dataTask.cancel()
      return
    }
    received += data.count
    do {
      if let file { try file.write(contentsOf: data) } else { body.append(data) }
    } catch {
      failure = error
      dataTask.cancel()
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    defer { session.finishTasksAndInvalidate() }
    do { try file?.close() } catch { failure = failure ?? error }
    file = nil
    if let error = failure ?? error {
      if let destination { try? FileManager.default.removeItem(at: destination) }
      continuation?.resume(throwing: error)
    } else if let response {
      var headers: [String: String] = [:]
      for (key, value) in response.allHeaderFields {
        if let key = key as? String, let value = value as? String { headers[key.lowercased()] = value }
      }
      continuation?.resume(returning: HTTPResponse(status: response.statusCode, body: body, headers: headers))
    } else {
      if let destination { try? FileManager.default.removeItem(at: destination) }
      continuation?.resume(throwing: TransportFailure())
    }
    continuation = nil
  }
}
