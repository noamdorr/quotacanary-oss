import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  SIGNATURE_HEADER,
  SIGNATURE_TOLERANCE_SECONDS,
  buildSignatureHeader,
  generateWebhookSigningSecret,
  verifyWebhookSignature,
} from "./signing"

const SECRET = "qcwh_testsecret"
const BODY = '{"event":"quota.alert.low","id":"evt-1"}'
const AT = 1_780_000_000

function headerAt(seconds: number, body = BODY, secret = SECRET) {
  return buildSignatureHeader({ secret, body, timestampSeconds: seconds })
}

describe("generateWebhookSigningSecret", () => {
  it("prefixes the secret and carries 32 bytes of entropy", () => {
    const secret = generateWebhookSigningSecret()
    expect(secret.startsWith("qcwh_")).toBe(true)
    // 32 random bytes, base64url (no padding) => 43 characters.
    expect(secret.slice("qcwh_".length)).toHaveLength(43)
    expect(secret).toMatch(/^qcwh_[A-Za-z0-9_-]+$/)
  })

  it("never repeats", () => {
    const secrets = new Set(
      Array.from({ length: 50 }, () => generateWebhookSigningSecret())
    )
    expect(secrets.size).toBe(50)
  })
})

describe("buildSignatureHeader", () => {
  // Pinning the exact digest is the point: the header is a public contract, so
  // a change to the signed string has to break a test rather than every
  // receiver in the wild.
  it("signs '<timestamp>.<raw body>' with HMAC-SHA256", () => {
    const expected = createHmac("sha256", SECRET)
      .update(`${AT}.${BODY}`)
      .digest("hex")

    expect(headerAt(AT)).toBe(`t=${AT},v1=${expected}`)
  })

  it("is deterministic for the same secret, body and timestamp", () => {
    expect(headerAt(AT)).toBe(headerAt(AT))
  })

  it("changes when the body changes by one byte", () => {
    expect(headerAt(AT, `${BODY} `)).not.toBe(headerAt(AT))
  })

  it("changes when the timestamp changes", () => {
    expect(headerAt(AT + 1)).not.toBe(headerAt(AT))
  })

  it("changes when the secret changes", () => {
    expect(headerAt(AT, BODY, "qcwh_other")).not.toBe(headerAt(AT))
  })

  it("exposes the header name it is sent under", () => {
    expect(SIGNATURE_HEADER).toBe("quotacanary-signature")
  })
})

describe("verifyWebhookSignature", () => {
  const verify = (
    header: string | null | undefined,
    opts: { body?: string; nowSeconds?: number; secret?: string } = {}
  ) =>
    verifyWebhookSignature({
      secret: opts.secret ?? SECRET,
      header,
      body: opts.body ?? BODY,
      nowSeconds: opts.nowSeconds ?? AT,
    })

  it("accepts a signature it just produced", () => {
    expect(verify(headerAt(AT))).toEqual({ ok: true })
  })

  it("rejects a body tampered with in transit", () => {
    expect(
      verify(headerAt(AT), { body: '{"event":"quota.alert.critical"}' })
    ).toEqual({ ok: false, reason: "mismatch" })
  })

  it("rejects a signature made with a different secret", () => {
    expect(verify(headerAt(AT, BODY, "qcwh_attacker"))).toEqual({
      ok: false,
      reason: "mismatch",
    })
  })

  it("rejects a replay once the timestamp falls outside the tolerance", () => {
    const stale = AT - SIGNATURE_TOLERANCE_SECONDS - 1
    expect(verify(headerAt(stale), { nowSeconds: AT })).toEqual({
      ok: false,
      reason: "stale",
    })
  })

  it("accepts a delivery sitting exactly on the tolerance boundary", () => {
    const edge = AT - SIGNATURE_TOLERANCE_SECONDS
    expect(verify(headerAt(edge), { nowSeconds: AT })).toEqual({ ok: true })
  })

  // A receiver's clock can run behind ours, so a delivery may look "future"
  // dated. The tolerance is symmetric to keep that from failing every send.
  it("rejects a timestamp too far in the future", () => {
    const ahead = AT + SIGNATURE_TOLERANCE_SECONDS + 1
    expect(verify(headerAt(ahead), { nowSeconds: AT })).toEqual({
      ok: false,
      reason: "stale",
    })
  })

  it("cannot be replayed with a fresh timestamp glued onto an old signature", () => {
    const captured = headerAt(AT - 3600)
    const v1 = captured.split("v1=")[1]
    expect(verify(`t=${AT},v1=${v1}`, { nowSeconds: AT })).toEqual({
      ok: false,
      reason: "mismatch",
    })
  })

  it("reports a missing header", () => {
    expect(verify(null)).toEqual({ ok: false, reason: "missing" })
    expect(verify("")).toEqual({ ok: false, reason: "missing" })
  })

  it.each([
    ["no v1 element", `t=${AT}`],
    ["no timestamp", `v1=${"a".repeat(64)}`],
    ["a non-numeric timestamp", `t=soon,v1=${"a".repeat(64)}`],
    ["junk", "nonsense"],
    ["a truncated digest", `t=${AT},v1=abc`],
    ["a non-hex digest", `t=${AT},v1=${"z".repeat(64)}`],
  ])("reports %s as malformed", (_label, header) => {
    expect(verify(header)).toEqual({ ok: false, reason: "malformed" })
  })

  it("tolerates whitespace and extra elements around the parts it needs", () => {
    expect(
      verify(`t=${AT}, v1=${headerAt(AT).split("v1=")[1]}, v0=ignored`)
    ).toEqual({ ok: true })
  })

  // Accepting any matching v1 is what lets a future overlap-window rotation
  // send two signatures without every receiver having to change first.
  it("accepts a header carrying several v1 elements when one matches", () => {
    const good = headerAt(AT).split("v1=")[1]
    expect(verify(`t=${AT},v1=${"a".repeat(64)},v1=${good}`)).toEqual({
      ok: true,
    })
  })
})
