import type { LookupAddress } from "node:dns"
import { request as httpsRequest } from "node:https"
import type { LookupFunction } from "node:net"

// Answers every resolution with the addresses the SSRF checks already approved.
// Node resolves the hostname a second time when it opens the socket, and that
// gap is the DNS-rebinding window: the resolver can hand back a private address
// after validation passed. Pinning removes the second lookup. The whole
// validated set is kept so Node can still fail over between a host's A and AAAA
// records. The hostname itself is untouched, so SNI and certificate
// verification still run against it.
export function pinnedLookup(pinned: LookupAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    if (options?.all) callback(null, pinned)
    else callback(null, pinned[0].address, pinned[0].family)
  }
}

// POSTs to `url` over TLS, connecting to `addresses` instead of re-resolving.
// Resolves with the response status, or null when the request never produced
// one (TLS failure, socket error, timeout). Redirects are never followed:
// node:http does not follow them, so a 3xx comes back as its own status.
export function postToPinnedAddress(opts: {
  url: string
  addresses: LookupAddress[]
  headers: Record<string, string>
  body: string
  timeoutMs: number
}): Promise<{ status: number } | null> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (result: { status: number } | null) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const req = httpsRequest(
      opts.url,
      {
        method: "POST",
        headers: opts.headers,
        lookup: pinnedLookup(opts.addresses),
        // A pooled agent is keyed by hostname, so a later delivery could
        // inherit a socket this one pinned. One-off connection instead.
        agent: false,
        signal: AbortSignal.timeout(opts.timeoutMs),
      },
      (res) => {
        const status = res.statusCode ?? 0
        // The body is never read; don't buffer a hostile stream to learn that.
        res.destroy()
        settle({ status })
      }
    )

    req.on("error", () => settle(null))
    req.end(opts.body)
  })
}
