// Rebuilds src/data/tools.json, the snapshot the directory pages are
// prerendered from, so the site needs no database at build time.
//
// Source: the `tools` table as the repo's migrations and seed define it, read
// with psql from a local database (the Supabase stack's Postgres by default,
// or any Postgres in DB_URL with the migrations applied). The hosted catalog
// this used to read is gone. Only ids the Mac app supports are written, and
// the run fails if one of them has no active row.
//
// key_instructions is kept as it is in the current snapshot. A new tool takes
// the Mac app's key hint (Copy.swift keyRequirements) or stays empty: the
// migrations' "go to X -> Y" paths go stale.
//
// The site serves logos as .webp. The catalog's logo_url names the web app's
// PNG, so it is rewritten to .webp here, and a logo missing from public/logos/
// is converted from the web app's ../public/logos/ PNG with cwebp (lossless).
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { macKeyRequirements, macToolIds } from "./mac-tools.mjs"

const dbUrl = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
const out = new URL("../src/data/tools.json", import.meta.url).pathname
const siteLogos = new URL("../public", import.meta.url).pathname
const webLogos = new URL("../../public", import.meta.url).pathname

const columns =
  "id, name, logo_url, category, description, website_url, api_docs_url, key_instructions, topup_url, pools"
const sql = `select coalesce(json_agg(t order by t.id), '[]') from (select ${columns} from public.tools where is_active) t`
let rows
try {
  rows = JSON.parse(execFileSync("psql", [dbUrl, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }))
} catch (error) {
  console.error(`tools query failed against ${dbUrl.replace(/\/\/[^@]*@/, "//")}: ${error.message}`)
  process.exit(1)
}

const macIds = macToolIds()
const byId = new Map(rows.map((row) => [row.id, row]))
const missing = macIds.filter((id) => !byId.has(id))
if (missing.length > 0) {
  console.error(`no active catalog row for Mac tools: ${missing.join(", ")}`)
  process.exit(1)
}
const skipped = rows.filter((row) => !macIds.includes(row.id)).map((row) => row.id)

const current = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : []
const currentKeyText = new Map(current.map((tool) => [tool.id, tool.key_instructions]))
const keyHints = macKeyRequirements()

const tools = macIds.map((id) => {
  const row = byId.get(id)
  const key_instructions = currentKeyText.has(id) ? currentKeyText.get(id) : (keyHints[id] ?? "")
  const logo_url = row.logo_url?.replace(/\.png$/, ".webp") ?? null
  if (logo_url && !existsSync(siteLogos + logo_url) && existsSync(webLogos + row.logo_url)) {
    execFileSync("cwebp", ["-quiet", "-lossless", "-z", "9", webLogos + row.logo_url, "-o", siteLogos + logo_url])
  }
  return { ...row, logo_url, key_instructions }
})

writeFileSync(out, `${JSON.stringify(tools, null, 2)}\n`)
console.log(`wrote ${tools.length} tools to ${out}`)
if (skipped.length > 0) console.log(`skipped (not in the Mac app): ${skipped.join(", ")}`)
