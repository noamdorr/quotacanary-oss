import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { CONNECTIONS_API_ERRORS, POOLS_API_ERRORS } from "./error-docs"

// The public docs error table renders from POOLS_API_ERRORS. This pins that
// table to what the route can actually return, so a new jsonError() call
// (or a dropped one) fails here instead of drifting in /docs. QUO-36.
const route = readFileSync(
  resolve(process.cwd(), "src/app/api/v1/pools/route.ts"),
  "utf8"
)

const returned = [
  ...route.matchAll(/jsonError\(\s*(\d{3}),\s*"([a-z_]+)"/g),
].map(([, status, code]) => `${status} ${code}`)

describe("pools API error docs", () => {
  it("finds the error responses in the route source", () => {
    expect(returned.length).toBeGreaterThan(0)
  })

  it("documents every error the route returns, and nothing it does not", () => {
    const documented = POOLS_API_ERRORS.map((e) => `${e.status} ${e.code}`)
    expect([...documented].sort()).toEqual([...returned].sort())
  })

  it("documents each error once", () => {
    const codes = POOLS_API_ERRORS.map((e) => e.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

// Same pin for the connection write endpoints (QUO-187): their gates live in
// authorize.ts and the writer-failure mapping in connection-input.ts, so the
// scan covers those alongside the two route files.
const connectionSources = [
  "src/lib/api/authorize.ts",
  "src/lib/api/connection-input.ts",
  "src/app/api/v1/connections/route.ts",
  "src/app/api/v1/connections/[id]/route.ts",
].map((p) => readFileSync(resolve(process.cwd(), p), "utf8"))

const connectionReturned = [
  ...new Set(
    connectionSources.flatMap((src) =>
      [...src.matchAll(/jsonError\(\s*(\d{3}),\s*"([a-z_]+)"/g)].map(
        ([, status, code]) => `${status} ${code}`
      )
    )
  ),
]

describe("connections API error docs", () => {
  it("finds the error responses in the route and helper sources", () => {
    expect(connectionReturned.length).toBeGreaterThan(0)
  })

  it("documents every error the endpoints return, and nothing they do not", () => {
    const documented = CONNECTIONS_API_ERRORS.map(
      (e) => `${e.status} ${e.code}`
    )
    expect([...documented].sort()).toEqual([...connectionReturned].sort())
  })

  it("documents each error once", () => {
    const codes = CONNECTIONS_API_ERRORS.map((e) => e.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})
