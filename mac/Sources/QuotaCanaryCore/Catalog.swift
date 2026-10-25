import Foundation

/// One tool of the shared adapter catalog (catalog/tools.json at the repo
/// root, schema catalog/tools.schema.json). The web's TypeScript interpreter
/// (src/lib/adapters/catalog.ts) reads the same file; QUO-179 decision 10.
/// Unknown keys are ignored so a newer catalog still loads here.
public struct CatalogEntry: Decodable, Equatable, Sendable {
  public enum Method: String, Decodable, Sendable {
    case get = "GET"
    case post = "POST"
  }

  public struct Request: Decodable, Equatable, Sendable {
    public var method: Method
    /// Absolute https URL. With `auth.in == .path` it contains `{key}`.
    public var url: String
    /// Static headers sent as-is beside the auth header.
    public var headers: [String: String]?
    /// Raw request body, sent verbatim.
    public var body: String?

    public init(method: Method, url: String, headers: [String: String]? = nil, body: String? = nil) {
      self.method = method
      self.url = url
      self.headers = headers
      self.body = body
    }
  }

  public enum Placement: String, Decodable, Sendable {
    case header
    case query
    case path
  }

  public struct Auth: Decodable, Equatable, Sendable {
    public var `in`: Placement
    /// Header or query parameter name; absent for path.
    public var name: String?
    /// Header value template; `{key}` is replaced by the raw key.
    public var format: String

    public init(in placement: Placement, name: String? = nil, format: String = "{key}") {
      self.in = placement
      self.name = name
      self.format = format
    }

    private enum CodingKeys: String, CodingKey {
      case `in`, name, format
    }

    public init(from decoder: Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      `in` = try c.decode(Placement.self, forKey: .in)
      name = try c.decodeIfPresent(String.self, forKey: .name)
      format = try c.decodeIfPresent(String.self, forKey: .format) ?? "{key}"
    }
  }

  public enum ErrorKind: String, Decodable, Sendable {
    case invalidKey = "invalid_key"
    case http
  }

  public struct RejectWhen: Decodable, Equatable, Sendable {
    public var path: String
    public var equals: Bool

    public init(path: String, equals: Bool) {
      self.path = path
      self.equals = equals
    }
  }

  /// A vendor-reported error in the body (QUO-193): a flag at `when.path`
  /// selects the first non-empty string in `messagePaths`, or, with no
  /// `when`, that string is itself the trigger.
  public struct BodyError: Decodable, Equatable, Sendable {
    /// The three fixed flag shapes. A missing value is "not equal" and falsy.
    public enum When: Decodable, Equatable, Sendable {
      case equals(path: String, Bool)
      case notEquals(path: String, String)
      case truthy(path: String)

      public var path: String {
        switch self {
        case let .equals(path, _), let .notEquals(path, _), let .truthy(path): return path
        }
      }

      private enum CodingKeys: String, CodingKey {
        case path, equals, notEquals, truthy
      }

      public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let path = try c.decode(String.self, forKey: .path)
        let shapes = [c.contains(.equals), c.contains(.notEquals), c.contains(.truthy)].filter { $0 }.count
        guard shapes == 1 else {
          throw DecodingError.dataCorruptedError(
            forKey: .path, in: c, debugDescription: "needs exactly one of equals, notEquals or truthy"
          )
        }
        if c.contains(.equals) {
          self = try .equals(path: path, c.decode(Bool.self, forKey: .equals))
        } else if c.contains(.notEquals) {
          self = try .notEquals(path: path, c.decode(String.self, forKey: .notEquals))
        } else {
          guard try c.decode(Bool.self, forKey: .truthy) else {
            throw DecodingError.dataCorruptedError(forKey: .truthy, in: c, debugDescription: "truthy must be true")
          }
          self = .truthy(path: path)
        }
      }
    }

    /// With `when` only: what a fired flag with no message reports.
    public enum Fallback: String, Decodable, Sendable {
      case error
      case invalidKey = "invalid_key"
    }

    /// Which responses carry the body to read.
    public enum On: String, Decodable, Sendable {
      case twoXX = "2xx"
      case non2xx
      case any
    }

    /// With `when` only: a body whose value at `path` is this string is a rejected key.
    public struct KeyRejectedWhen: Decodable, Equatable, Sendable {
      public var path: String
      public var equals: String

      public init(path: String, equals: String) {
        self.path = path
        self.equals = equals
      }
    }

    public var when: When?
    /// Tried in order; the first non-empty string is the error.
    public var messagePaths: [String]
    public var keyRejectedWhen: KeyRejectedWhen?
    public var fallback: Fallback?
    public var on: On

    public init(
      when: When? = nil, messagePaths: [String], keyRejectedWhen: KeyRejectedWhen? = nil, fallback: Fallback? = nil,
      on: On = .twoXX
    ) {
      self.when = when
      self.messagePaths = messagePaths
      self.keyRejectedWhen = keyRejectedWhen
      self.fallback = fallback
      self.on = on
    }

    private enum CodingKeys: String, CodingKey {
      case when, messagePaths, keyRejectedWhen, fallback, on
    }

    public init(from decoder: Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      when = try c.decodeIfPresent(When.self, forKey: .when)
      messagePaths = try c.decode([String].self, forKey: .messagePaths)
      keyRejectedWhen = try c.decodeIfPresent(KeyRejectedWhen.self, forKey: .keyRejectedWhen)
      fallback = try c.decodeIfPresent(Fallback.self, forKey: .fallback)
      on = try c.decodeIfPresent(On.self, forKey: .on) ?? .twoXX
    }
  }

  /// One reading per pool. Exactly one of two shapes: a `balance` path (with
  /// optional `limit` or `used`), or a `limit` path (with optional `used`).
  public struct PoolSpec: Decodable, Equatable, Sendable {
    public var creditType: String
    public var label: String
    public var unit: CreditUnit
    public var balance: String?
    public var limit: String?
    public var used: String?

    public init(
      creditType: String, label: String, unit: CreditUnit, balance: String? = nil, limit: String? = nil,
      used: String? = nil
    ) {
      self.creditType = creditType
      self.label = label
      self.unit = unit
      self.balance = balance
      self.limit = limit
      self.used = used
    }
  }

  public var id: String
  /// Display name, also used in error copy.
  public var name: String
  /// Where the user buys more credits; mirrors the hosted tools.topup_url.
  public var topupUrl: String?
  public var request: Request
  public var auth: Auth
  /// Per-status overrides on top of the default {401: invalid_key}.
  public var errors: [String: ErrorKind]?
  /// When a 2xx body carries a non-empty string here, the vendor reported an error.
  public var errorPath: String?
  /// When the value at `path` equals this boolean, the key was rejected.
  public var rejectWhen: RejectWhen?
  /// A vendor-reported error in the body, checked before `errorPath`.
  public var bodyError: BodyError?
  public var pools: [PoolSpec]

  public init(
    id: String, name: String, topupUrl: String? = nil, request: Request, auth: Auth,
    errors: [String: ErrorKind]? = nil, errorPath: String? = nil, rejectWhen: RejectWhen? = nil,
    bodyError: BodyError? = nil, pools: [PoolSpec]
  ) {
    self.id = id
    self.name = name
    self.topupUrl = topupUrl
    self.request = request
    self.auth = auth
    self.errors = errors
    self.errorPath = errorPath
    self.rejectWhen = rejectWhen
    self.bodyError = bodyError
    self.pools = pools
  }

  /// The constraints the zod schema enforces beyond JSON shape.
  func validate() -> String? {
    if id.isEmpty { return "a tool has an empty id" }
    if name.isEmpty { return "\(id): empty name" }
    if !request.url.hasPrefix("https://") { return "\(id): request.url must start with https://" }
    if let topupUrl, !topupUrl.hasPrefix("https://") { return "\(id): topupUrl must start with https://" }
    if auth.in != .path, auth.name?.isEmpty ?? true { return "\(id): auth.name is required for header and query placement" }
    if pools.isEmpty { return "\(id): pools must not be empty" }
    for pool in pools {
      if pool.creditType.isEmpty || pool.label.isEmpty { return "\(id): a pool needs a creditType and a label" }
      if pool.balance == nil && pool.limit == nil { return "\(id): a pool needs a balance path or a limit path" }
      for path in [pool.balance, pool.limit, pool.used] where path?.isEmpty == true {
        return "\(id): empty JSON path"
      }
    }
    for status in errors?.keys ?? [:].keys where !Self.isStatus(status) {
      return "\(id): errors key \(status) is not a 3-digit status"
    }
    if errorPath?.isEmpty == true || rejectWhen?.path.isEmpty == true { return "\(id): empty JSON path" }
    if let bodyError {
      if bodyError.messagePaths.isEmpty { return "\(id): bodyError.messagePaths must not be empty" }
      if bodyError.when?.path.isEmpty == true || bodyError.messagePaths.contains("") { return "\(id): empty JSON path" }
      if bodyError.when == nil, bodyError.fallback != nil { return "\(id): bodyError.fallback needs a when" }
      if bodyError.when == nil, bodyError.keyRejectedWhen != nil { return "\(id): bodyError.keyRejectedWhen needs a when" }
      if bodyError.keyRejectedWhen?.path.isEmpty == true { return "\(id): empty JSON path" }
    }
    return nil
  }

  private static func isStatus(_ key: String) -> Bool {
    key.count == 3 && key.allSatisfy(\.isNumber) && ("1"..."5").contains(String(key.prefix(1)))
  }
}

public struct CatalogError: Error, Equatable, Sendable {
  public var reason: String
}

/// The catalog file: `{ "$schema"?, "tools": [...] }`.
public struct Catalog: Decodable, Equatable, Sendable {
  public var tools: [CatalogEntry]

  public init(tools: [CatalogEntry]) {
    self.tools = tools
  }

  /// Decodes and validates. Throws `CatalogError` with the first problem.
  public static func load(_ data: Data) throws -> Catalog {
    let catalog: Catalog
    do {
      catalog = try JSONDecoder().decode(Catalog.self, from: data)
    } catch let error as DecodingError {
      throw CatalogError(reason: describe(error))
    } catch {
      throw CatalogError(reason: "not JSON")
    }
    for entry in catalog.tools {
      if let reason = entry.validate() { throw CatalogError(reason: reason) }
    }
    if Set(catalog.tools.map(\.id)).count != catalog.tools.count {
      throw CatalogError(reason: "tool ids must be unique")
    }
    return catalog
  }

  /// `load` over the bundled bytes, a missing file being one more failure.
  public static func load(bundledData data: Data?) -> Result<Catalog, CatalogError> {
    guard let data else { return .failure(CatalogError(reason: "bundled tools.json not found")) }
    return Result { try load(data) }.mapError { $0 as? CatalogError ?? CatalogError(reason: "\($0)") }
  }

  /// The bundled copy of catalog/tools.json. Resolved relative to the running
  /// binary, never through `Bundle.module`, whose generated accessor embeds
  /// the build machine's absolute path in the binary (see ProviderLogo).
  public static func bundledData() -> Data? {
    for url in bundledCandidates() {
      if let data = try? Data(contentsOf: url) { return data }
    }
    return nil
  }

  private static func bundledCandidates() -> [URL] {
    var candidates: [URL] = []
    // The packaged app: bundle.sh copies the file into Contents/Resources.
    if let resources = Bundle.main.resourceURL { candidates.append(resources.appendingPathComponent("tools.json")) }
    // A SwiftPM build: the resource bundle sits beside the executable.
    if let executable = Bundle.main.executableURL {
      candidates.append(
        executable.deletingLastPathComponent().appendingPathComponent("QuotaCanary_QuotaCanaryCore.bundle/tools.json")
      )
    }
    #if DEBUG
      // `swift test` runs inside SwiftPM's helper, whose main bundle is not ours.
      candidates.append(URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Resources/tools.json"))
    #endif
    return candidates
  }

  private static func describe(_ error: DecodingError) -> String {
    func path(_ context: DecodingError.Context) -> String {
      context.codingPath.map { $0.intValue.map(String.init) ?? $0.stringValue }.joined(separator: ".")
    }
    switch error {
    case let .dataCorrupted(context):
      return context.codingPath.isEmpty ? "not JSON" : "\(path(context)): \(context.debugDescription)"
    case let .keyNotFound(key, context): return "\(path(context)): missing \(key.stringValue)"
    case let .typeMismatch(_, context): return "\(path(context)): \(context.debugDescription)"
    case let .valueNotFound(_, context): return "\(path(context)): \(context.debugDescription)"
    @unknown default: return "undecodable"
    }
  }
}
