import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"

const exec = promisify(execFile)
const fixtureSecret = "fixture-only-secret-never-log"

async function runExample(
  status: number | "disconnect",
  invalidConfig = false
) {
  const dir = await mkdtemp(join(tmpdir(), "quo-poll-docs-"))
  const requests: { method?: string; authorization?: string }[] = []
  const server = createServer((req, res) => {
    requests.push({
      method: req.method,
      authorization: req.headers.authorization,
    })
    if (status === "disconnect") {
      req.socket.destroy()
      return
    }
    res.writeHead(status, { Location: "/redirect-target" })
    // An upstream proxy may echo credentials in its error page.
    res.end(`untrusted response: ${fixtureSecret}`)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("No port")
    const docs = await readFile("docs/SELF_HOSTING.md", "utf8")
    const script = docs.match(/```sh\n(#!\/bin\/sh\n[\s\S]*?)\n```/)?.[1]
    expect(
      script,
      "self-host guide must include the runnable poll script"
    ).toBeDefined()
    const scriptPath = join(dir, "poll.sh")
    const configPath = join(dir, "poll.curl")
    await writeFile(scriptPath, script as string)
    await writeFile(
      configPath,
      invalidConfig
        ? `invalid-${fixtureSecret}\n`
        : `url = "http://127.0.0.1:${address.port}/api/poll"\nheader = "Authorization: Bearer ${fixtureSecret}"\n`,
      { mode: 0o600 }
    )
    const result = await exec("sh", [scriptPath, configPath], {
      timeout: 5_000,
      env: { ...process.env, NO_PROXY: "127.0.0.1" },
    }).then(
      (output) => ({ ...output, code: 0 }),
      (error) => ({
        stdout: String(error.stdout),
        stderr: String(error.stderr),
        code: error.code,
      })
    )
    expect(result.stdout).toBe("")
    expect(result.stderr).not.toContain(fixtureSecret)
    expect(result.stderr).not.toContain("untrusted response")
    return { ...result, requests }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(dir, { recursive: true, force: true })
  }
}

describe("documented self-host poll command (real curl, local HTTP only)", () => {
  it.each([200, 204])(
    "accepts HTTP %i with the required POST and bearer",
    async (status) => {
      const result = await runExample(status)
      expect(result.code).toBe(0)
      expect(result.stderr).toBe("")
      expect(result.requests).toEqual([
        { method: "POST", authorization: `Bearer ${fixtureSecret}` },
      ])
    }
  )

  it.each([302, 401, 500, 503])(
    "fails HTTP %i without redirecting, retrying, or leaking bodies",
    async (status) => {
      const result = await runExample(status)
      expect(result.code).toBe(1)
      expect(result.stderr).toContain(`HTTP ${status}`)
      expect(result.requests).toHaveLength(1)
    }
  )

  it("reports a transport failure without leaking curl diagnostics", async () => {
    const result = await runExample("disconnect")
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("curl exit 52, HTTP 000")
    expect(result.requests).toHaveLength(1)
  })

  it("sanitizes config errors before curl's silent option can take effect", async () => {
    const result = await runExample(200, true)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("poll failed")
    expect(result.requests).toHaveLength(0)
  })
})
