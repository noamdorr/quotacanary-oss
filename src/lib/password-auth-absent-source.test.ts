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

const marketingFiles = collectSourceFiles(
  resolve(process.cwd(), "src/app/(marketing)")
)

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8")

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

// QUO-95: the code lost passwords in QUO-73, but the privacy policy and terms
// kept describing them for two months. The pages whose whole job is being
// factually correct were the last to hear. This pins the copy to the code.
describe("public legal copy matches passwordless auth", () => {
  it("no marketing page describes an account password as a thing that exists", () => {
    // A rule, not a blocklist of retired sentences: the word is allowed on a
    // marketing page only where it is being denied ("there is no password",
    // "passwordless"). Any affirmative use - "your password", "a password is
    // hashed", "choose a password" - is the drift coming back, whatever the
    // wording. Whitespace is collapsed first because JSX wraps these lines.
    const negated = /(no|never|without|not)\s(a\s|any\s)?password|passwordless/
    for (const file of marketingFiles) {
      const source = readFileSync(file, "utf8")
        .toLowerCase()
        .replace(/\s+/g, " ")
      for (const match of source.matchAll(/password/g)) {
        const context = source.slice(
          Math.max(0, match.index - 30),
          match.index + 20
        )
        expect(
          context,
          `${file} mentions a password outside a denial: "...${context}..."`
        ).toMatch(negated)
      }
    }
  })

  it("privacy says the account is an email and explains passwordless sign-in", () => {
    const privacy = read("src/app/(marketing)/privacy/page.tsx")
    expect(privacy).toContain("Sign-in is passwordless")
    expect(privacy).toContain("one-time link")
  })

  it("terms tells the user their inbox is the credential", () => {
    expect(read("src/app/(marketing)/terms/page.tsx")).toContain("sign-in link")
  })
})
