import { randomBytes } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"
import { decrypt, encrypt, keyHint } from "./crypto"

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
})

// Flips the first byte of one base64-encoded part and reassembles the payload,
// preserving the structure and the part's real length.
function mutatePart(payload: string, index: 0 | 1 | 2): string {
  const parts = payload.split(":")
  const buf = Buffer.from(parts[index], "base64")
  buf[0] ^= 0xff
  parts[index] = buf.toString("base64")
  return parts.join(":")
}

describe("crypto", () => {
  it("round-trips a plaintext", () => {
    const secret = "nb_live_abcd1234efgh5678"
    expect(decrypt(encrypt(secret))).toBe(secret)
  })

  // Encrypting "" yields an empty base64 ciphertext part, which decrypt's
  // "Malformed ciphertext" guard (`!dataB64`) rejects. This documents the real
  // behavior of the (unchangeable) implementation: empty strings do not
  // round-trip.
  it("does not round-trip an empty string (empty ciphertext is rejected)", () => {
    expect(() => decrypt(encrypt(""))).toThrow()
  })

  it("round-trips unicode/multibyte plaintext", () => {
    const secret = "🔑 café—münchen"
    expect(decrypt(encrypt(secret))).toBe(secret)
  })

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"))
  })

  it("rejects tampered ciphertext", () => {
    const tampered = mutatePart(encrypt("secret"), 2)
    expect(() => decrypt(tampered)).toThrow()
  })

  it("rejects a tampered auth tag", () => {
    const tampered = mutatePart(encrypt("secret"), 1)
    expect(() => decrypt(tampered)).toThrow()
  })

  it("rejects a tampered IV", () => {
    const tampered = mutatePart(encrypt("secret"), 0)
    expect(() => decrypt(tampered)).toThrow()
  })

  it("rejects malformed payloads", () => {
    expect(() => decrypt("only:two")).toThrow()
    expect(() => decrypt("")).toThrow()
  })

  it("rejects decryption with the wrong key", () => {
    const payload = encrypt("secret")
    const originalKey = process.env.ENCRYPTION_KEY
    try {
      process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
      expect(() => decrypt(payload)).toThrow()
    } finally {
      process.env.ENCRYPTION_KEY = originalKey
    }
  })

  it("keyHint returns the last 4 chars", () => {
    expect(keyHint("abcd1234wxyz")).toBe("wxyz")
  })
})
