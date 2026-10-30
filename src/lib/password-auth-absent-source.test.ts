import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const loginActionsPath = resolve(
  process.cwd(),
  "src/app/(auth)/login/actions.ts"
)
const loginActionsSource = readFileSync(loginActionsPath, "utf8")

// Scans all of src/, unlike the single-file convention other *-source tests
// use: the claim below is "nowhere in the app", so a one-file check would
// miss a reintroduction anywhere else.
function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(full)
    if (!/\.(ts|tsx)$/.test(entry.name)) return []
    if (/\.test\.tsx?$/.test(entry.name)) return []
    return [full]
  })
}

const allSourceFiles = collectSourceFiles(resolve(process.cwd(), "src"))

describe("no password-based auth path exists", () => {
  it("sign-in is magic-link only", () => {
    expect(loginActionsSource).toContain("signInWithOtp")
  })

  it("never calls a password-setting or password-auth Supabase method", () => {
    // QUO-73 replaced password auth with magic links; QUO-10's claim that a
    // user can't receive alert mail without proving they own the address
    // depends on this staying true. signUp/signInWithPassword re-add a path
    // to register with any address; resetPasswordForEmail/updateUser can set
    // or change a password (updateUser can also rewrite the account email)
    // without proving ownership the way the magic-link confirm route does.
    const forbidden = [
      ".auth.signUp(",
      ".auth.signInWithPassword(",
      ".auth.resetPasswordForEmail(",
      ".auth.updateUser(",
    ]
    for (const file of allSourceFiles) {
      const source = readFileSync(file, "utf8")
      for (const pattern of forbidden) {
        expect(source, `${file} contains ${pattern}`).not.toContain(pattern)
      }
    }
  })
})
