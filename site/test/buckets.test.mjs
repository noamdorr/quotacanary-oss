// The directory filters on a site-only bucket map (src/lib/buckets.mjs), not
// on the catalog's category column. A tool added to tools.json without a
// bucket would vanish from every chip and every All-view section, so this
// fails first.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { BUCKETS, TOOL_BUCKET } from "../src/lib/buckets.mjs"

const snapshot = JSON.parse(readFileSync(new URL("../src/data/tools.json", import.meta.url), "utf8"))
const ids = snapshot.map((tool) => tool.id)

describe("directory buckets", () => {
  it("puts every tool in tools.json in a bucket", () => {
    const homeless = ids.filter((id) => !(id in TOOL_BUCKET))
    assert.deepEqual(homeless, [], `no bucket for: ${homeless.join(", ")}`)
  })

  it("names no tool that is not in tools.json", () => {
    const known = new Set(ids)
    const unknown = Object.keys(TOOL_BUCKET).filter((id) => !known.has(id))
    assert.deepEqual(unknown, [], `not in tools.json: ${unknown.join(", ")}`)
  })

  it("puts each tool in exactly one bucket", () => {
    const listed = BUCKETS.flatMap((bucket) => bucket.tools)
    const twice = listed.filter((id, i) => listed.indexOf(id) !== i)
    assert.deepEqual(twice, [], `in more than one bucket: ${twice.join(", ")}`)
  })

  it("maps every tool to a known bucket id", () => {
    const bucketIds = new Set(BUCKETS.map((bucket) => bucket.id))
    const bad = Object.entries(TOOL_BUCKET).filter(([, bucket]) => !bucketIds.has(bucket))
    assert.deepEqual(bad, [])
  })

  it("keeps every bucket under 40% of the tools", () => {
    for (const bucket of BUCKETS) {
      assert.ok(
        bucket.tools.length < ids.length * 0.4,
        `${bucket.label} holds ${bucket.tools.length} of ${ids.length}`
      )
    }
  })
})
