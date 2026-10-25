// Refreshes src/data/tools.json from the hosted catalog (the `tools` table).
//
// The directory pages are prerendered from that snapshot, so the marketing
// service needs no database at build time and the public mirror builds
// without one. When a tool is added or activated in the catalog, run
// `npm run tools:pull` here and commit the result.
//
// Reads SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY
// from the environment, falling back to ../.env.local. Read-only.
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const env = { ...process.env }
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    for (const line of readFileSync(join(here, "../../.env.local"), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"|"$/g, "")
    }
  } catch {}
}
const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("Need SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const columns =
  "id,name,logo_url,category,description,website_url,api_docs_url,key_instructions,topup_url,pools"
const res = await fetch(
  `${url}/rest/v1/tools?select=${columns}&is_active=eq.true&order=id`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } }
)
if (!res.ok) {
  console.error(`tools query failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}
const tools = await res.json()
const out = join(here, "../src/data/tools.json")
writeFileSync(out, `${JSON.stringify(tools, null, 2)}\n`)
console.log(`wrote ${tools.length} tools to ${out}`)
