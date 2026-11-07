import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { requestHandler } from "../server.mjs"

function handle(target) {
  const result = {}
  requestHandler(
    { url: target, headers: { host: "quotacanary.com" } },
    {
      setHeader() {},
      writeHead(status, headers) {
        Object.assign(result, { status, headers })
      },
      end(body) {
        result.body = body
      },
    }
  )
  return result
}

describe("untrusted HTTP request targets", () => {
  it("rejects ambiguous or invalid targets and keeps serving health checks", () => {
    for (const target of ["//[", "//[/", "/one/..//example.invalid/mac/", "//download//example.invalid/mac/", "/\\example.invalid/", "https://example.invalid/"]) {
      assert.equal(handle(target).status, 400, target)
      assert.equal(handle("/healthz").body, "ok")
    }
  })

  it("keeps ordinary relative redirects and queries", () => {
    const result = handle("/directory/?next=https://example.invalid")
    assert.equal(result.status, 301)
    assert.equal(result.headers.Location, "/directory?next=https://example.invalid")
  })
})
