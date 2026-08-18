import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

// The header generic webhook deliveries are signed with. Lowercase to match
// the other outbound headers (node:http lowercases them anyway).
export const SIGNATURE_HEADER = "quotacanary-signature"

// How far a delivery's timestamp may sit from the receiver's clock before it
// should be rejected as a replay. Symmetric, so a receiver running slightly
// ahead of us does not reject every live delivery. Quoted in the public docs.
export const SIGNATURE_TOLERANCE_SECONDS = 300

// Mirrors the qc_live_ API-token prefix so a secret is recognizable in a
// receiver's config. 32 random bytes is the HMAC-SHA256 block-equivalent, well
// past the point where guessing beats attacking something else.
const SECRET_PREFIX = "qcwh_"

export function generateWebhookSigningSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(32).toString("base64url")}`
}

// Hex SHA-256 is 64 characters. Anything else cannot be one of our digests, so
// it is malformed input rather than a failed comparison.
const DIGEST_PATTERN = /^[0-9a-f]{64}$/

function digest(
  secret: string,
  timestampSeconds: number,
  body: string
): string {
  // The timestamp is inside the signed string, not merely alongside it: that is
  // what stops a captured signature being replayed under a fresh `t`.
  return createHmac("sha256", secret)
    .update(`${timestampSeconds}.${body}`)
    .digest("hex")
}

// `t=<unix seconds>,v1=<hex hmac-sha256 of "<t>.<raw body>">`
export function buildSignatureHeader(opts: {
  secret: string
  body: string
  timestampSeconds: number
}): string {
  const t = Math.floor(opts.timestampSeconds)
  return `t=${t},v1=${digest(opts.secret, t, opts.body)}`
}

export type SignatureVerification =
  | { ok: true }
  | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" }

// The reference implementation the public docs describe. Exported so the
// contract is exercised by tests rather than only prose - a receiver that
// follows the docs and one that calls this must agree.
export function verifyWebhookSignature(opts: {
  secret: string
  header: string | null | undefined
  body: string
  nowSeconds: number
  toleranceSeconds?: number
}): SignatureVerification {
  if (!opts.header) return { ok: false, reason: "missing" }

  let timestamp: number | null = null
  const signatures: string[] = []
  for (const element of opts.header.split(",")) {
    const [key, ...rest] = element.trim().split("=")
    const value = rest.join("=")
    if (key === "t" && /^\d+$/.test(value)) timestamp = Number(value)
    // Every v1 is collected, not just the first: an overlap-window rotation
    // can send more than one and a receiver accepts the delivery if any match.
    else if (key === "v1" && DIGEST_PATTERN.test(value)) signatures.push(value)
  }
  if (timestamp === null || signatures.length === 0) {
    return { ok: false, reason: "malformed" }
  }

  const tolerance = opts.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS
  if (Math.abs(opts.nowSeconds - timestamp) > tolerance) {
    return { ok: false, reason: "stale" }
  }

  const expected = Buffer.from(digest(opts.secret, timestamp, opts.body), "hex")
  // Constant-time, so a receiver cannot be walked toward a valid digest one
  // byte at a time. The lengths already match: both sides are 32-byte digests.
  const matched = signatures.some((candidate) =>
    timingSafeEqual(Buffer.from(candidate, "hex"), expected)
  )
  return matched ? { ok: true } : { ok: false, reason: "mismatch" }
}
