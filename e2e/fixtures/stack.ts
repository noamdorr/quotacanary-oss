import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

// Next reads .env.local on its own, but the Playwright process does not, so the
// suite would otherwise need every value exported by hand. Load it here (this
// module is the first thing every spec pulls in) without overriding anything
// already in the environment, which is how CI passes the stack's real keys.
function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local")
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key] !== undefined) continue
    process.env[key] = rawValue.replace(/^["']|["']$/g, "")
  }
}

loadEnvLocal()

// The Supabase CLI's own fixed development keys - printed by `supabase status`,
// identical on every machine, and worthless outside a local container - so CI can
// run this suite on a fork PR without a repository secret. Never point them at a
// remote project.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324"

// The app surface. `localhost` resolves to "app" in resolveHost and 127.0.0.1 to
// "marketing", so the two hostnames are not interchangeable here.
export const APP_ORIGIN = process.env.E2E_APP_ORIGIN ?? "http://localhost:3000"
export const MARKETING_ORIGIN =
  process.env.E2E_MARKETING_ORIGIN ?? "http://127.0.0.1:3000"

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"])

// This client holds the service role and the fixtures delete users with it, so
// a .env.local left pointing at a remote project would upsert a fake tool into
// the live catalog and cascade real accounts away on teardown. Refuse before any
// of that can happen: the suite is only ever meant to touch a local stack.
function assertLocalStack(url: string): void {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "")
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run the e2e suite against ${host}. It uses the service role and deletes users, so it only runs against a local Supabase stack. Check NEXT_PUBLIC_SUPABASE_URL in your environment or .env.local.`
    )
  }
}

export function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is unset. Run `supabase status` and export it, or put it in .env.local, before the e2e suite."
    )
  }
  assertLocalStack(SUPABASE_URL)
  return createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
