// Key generation and signing for Mac updates (QUO-139). Run through
// scripts/update-keys.sh and scripts/sign-update.sh, not directly.
//
//   swift update-tool.swift keygen <private-key-path>
//   swift update-tool.swift sign <private-key-path> <archive> <version> <minimum-macos> <url> [notes]
//
// The private key file holds the base64 of the raw 32-byte Ed25519 key. The
// app verifies with the matching public key compiled into
// QuotaCanaryCore/Updates.swift (UpdateFeed.publicKeyBase64). What each
// signature covers must match UpdateFeed.entryMessage and Updater exactly.
import CryptoKit
import Foundation

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data((message + "\n").utf8))
  exit(1)
}

func loadKey(_ path: String) -> Curve25519.Signing.PrivateKey {
  guard let text = try? String(contentsOfFile: path, encoding: .utf8),
        let raw = Data(base64Encoded: text.trimmingCharacters(in: .whitespacesAndNewlines)),
        let key = try? Curve25519.Signing.PrivateKey(rawRepresentation: raw)
  else { fail("Can't read an Ed25519 private key from \(path)") }
  return key
}

let args = Array(CommandLine.arguments.dropFirst())
switch args.first {
case "keygen" where args.count == 2:
  let path = args[1]
  if FileManager.default.fileExists(atPath: path) { fail("Refusing to overwrite \(path)") }
  let key = Curve25519.Signing.PrivateKey()
  let contents = Data((key.rawRepresentation.base64EncodedString() + "\n").utf8)
  guard FileManager.default.createFile(atPath: path, contents: contents, attributes: [.posixPermissions: 0o600])
  else { fail("Couldn't write \(path)") }
  print(key.publicKey.rawRepresentation.base64EncodedString())

case "sign" where args.count == 6 || args.count == 7:
  let key = loadKey(args[1])
  guard let archive = FileManager.default.contents(atPath: args[2]) else { fail("Can't read \(args[2])") }
  let version = args[3], minimum = args[4], url = args[5]
  let sha256 = SHA256.hash(data: archive).map { String(format: "%02x", $0) }.joined()
  let message = Data("quotacanary-mac-update\n\(version)\n\(minimum)\n\(sha256)".utf8)
  guard let archiveSignature = try? key.signature(for: archive),
        let feedSignature = try? key.signature(for: message)
  else { fail("Signing failed") }
  var entry: [String: String] = [
    "version": version,
    "minimumSystemVersion": minimum,
    "url": url,
    "sha256": sha256,
    "signature": archiveSignature.base64EncodedString(),
    "feedSignature": feedSignature.base64EncodedString(),
  ]
  if args.count == 7, !args[6].isEmpty { entry["notes"] = args[6] }
  let json = try! JSONSerialization.data(withJSONObject: entry, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
  print(String(decoding: json, as: UTF8.self))

default:
  fail("usage: update-tool.swift keygen <key> | sign <key> <archive> <version> <minimum-macos> <url> [notes]")
}
