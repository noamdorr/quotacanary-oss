// Tools whose vendor API only takes the key in the request URL (query string or
// path), so the vendor's logs or a proxy's can record it. Site-only on purpose,
// like buckets.mjs: the catalog shape stays shared with the Mac app.
//
// Declarative tools come from a committed snapshot of the Mac catalog (`auth.in`
// of query or path): the Railway service builds from site/ alone, so the build
// cannot read ../mac. test/key-in-url.test.mjs fails when the snapshot drifts
// from the catalog, or when a hand-written Swift adapter builds a URL with its
// secret in the query string and is missing below (or the reverse).
import DECLARATIVE_KEY_IN_URL from "../data/key-in-url.json" with { type: "json" }

export { DECLARATIVE_KEY_IN_URL }

export const HAND_WRITTEN_KEY_IN_URL = ["crawlbase", "diffbot", "enrichcrm", "semrush", "zerobounce"]

export const KEY_IN_URL = new Set([...DECLARATIVE_KEY_IN_URL, ...HAND_WRITTEN_KEY_IN_URL])
