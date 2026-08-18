import { EventEmitter } from "node:events"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { postToPinnedAddress } from "./pinned-post"

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock("node:https", () => ({ request }))

type Handler = (res: EventEmitter & { statusCode?: number }) => void

// A stand-in for the ClientRequest: records what was written, and lets a test
// drive the response or the error path by hand.
function fakeRequest() {
  const req = Object.assign(new EventEmitter(), {
    end: vi.fn(),
    destroy: vi.fn(),
  })
  let handler: Handler = () => {}
  request.mockImplementation((_url, _opts, cb: Handler) => {
    handler = cb
    return req
  })
  return {
    req,
    respond(statusCode: number) {
      const res = Object.assign(new EventEmitter(), {
        statusCode,
        destroy: vi.fn(),
      })
      handler(res)
      return res
    },
    options: () => request.mock.calls[0][1] as Record<string, unknown>,
    url: () => request.mock.calls[0][0] as string,
  }
}

function post(overrides: Record<string, unknown> = {}) {
  return postToPinnedAddress({
    url: "https://hooks.example.com/hook",
    addresses: [{ address: "93.184.216.34", family: 4 }],
    headers: { "content-type": "application/json" },
    body: '{"a":1}',
    timeoutMs: 10_000,
    ...overrides,
  })
}

describe("postToPinnedAddress", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("connects to the pinned address without a second DNS resolution", async () => {
    const fake = fakeRequest()
    const sent = post()
    fake.respond(200)
    await sent

    const lookup = fake.options().lookup as (
      hostname: string,
      options: { all?: boolean },
      cb: (err: null, address: unknown, family?: number) => void
    ) => void

    // The rebinding window is Node re-resolving the hostname when it opens the
    // socket. The pinned lookup answers from the validated address instead, for
    // whatever hostname it is handed.
    const all = await new Promise((resolve) =>
      lookup("hooks.example.com", { all: true }, (_e, addresses) =>
        resolve(addresses)
      )
    )
    expect(all).toEqual([{ address: "93.184.216.34", family: 4 }])

    const one = await new Promise((resolve) =>
      lookup("hooks.example.com", {}, (_e, address, family) =>
        resolve([address, family])
      )
    )
    expect(one).toEqual(["93.184.216.34", 4])
  })

  it("keeps every validated address so Node can still fail over", async () => {
    const fake = fakeRequest()
    const sent = post({
      addresses: [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1::1", family: 6 },
      ],
    })
    fake.respond(200)
    await sent

    const lookup = fake.options().lookup as (
      hostname: string,
      options: { all?: boolean },
      cb: (err: null, address: unknown) => void
    ) => void

    // The guard rejects the host unless every resolved address is public, so
    // handing back the whole set costs nothing and preserves A/AAAA failover.
    const all = await new Promise((resolve) =>
      lookup("hooks.example.com", { all: true }, (_e, addresses) =>
        resolve(addresses)
      )
    )
    expect(all).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1::1", family: 6 },
    ])
  })

  it("keeps the hostname on the request so TLS still verifies the certificate", async () => {
    const fake = fakeRequest()
    const sent = post()
    fake.respond(200)
    await sent

    // Swapping the IP into the URL or forcing `servername` would pin the
    // connection but hand the attacker a working TLS target.
    expect(fake.url()).toBe("https://hooks.example.com/hook")
    expect(fake.options()).not.toHaveProperty("servername")
    expect(fake.options().host).toBeUndefined()
    expect(fake.options().rejectUnauthorized).toBeUndefined()
  })

  it("sends the body as a POST with the given headers, timeout, and no pooled socket", async () => {
    const fake = fakeRequest()
    const sent = post()
    fake.respond(200)
    await sent

    expect(fake.options()).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
      agent: false,
    })
    expect(fake.options().signal).toBeInstanceOf(AbortSignal)
    expect(fake.req.end).toHaveBeenCalledWith('{"a":1}')
  })

  it("resolves with the response status and drops the response body", async () => {
    const fake = fakeRequest()
    const sent = post()
    const res = fake.respond(204)

    expect(await sent).toEqual({ status: 204 })
    expect(res.destroy).toHaveBeenCalled()
  })

  it("reports a redirect as its status rather than following it", async () => {
    const fake = fakeRequest()
    const sent = post()
    fake.respond(302)

    expect(await sent).toEqual({ status: 302 })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it("resolves null when the request fails", async () => {
    const fake = fakeRequest()
    const sent = post()
    fake.req.emit("error", new Error("socket hang up"))

    expect(await sent).toBeNull()
  })

  it("ignores a socket error that arrives after the response", async () => {
    const fake = fakeRequest()
    const sent = post()
    fake.respond(200)
    fake.req.emit("error", new Error("ECONNRESET"))

    expect(await sent).toEqual({ status: 200 })
  })
})
