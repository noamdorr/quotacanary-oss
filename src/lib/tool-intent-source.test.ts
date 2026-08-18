import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// The hops between the pure helpers (tool-intent.test.ts) and the redirect
// (auth/confirm/route.test.ts) are all JSX, and this suite runs in node with
// no DOM, so the wiring is asserted against source the same way the rest of
// the connect flow is. QUO-14.
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

const loginPage = read("src/app/(auth)/login/page.tsx")
const magicLinkForm = read("src/components/auth/MagicLinkForm.tsx")
const loginActions = read("src/app/(auth)/login/actions.ts")
const connectPage = read("src/app/(dashboard)/connect/page.tsx")
const toolGrid = read("src/components/connect/ToolGrid.tsx")
const connectModal = read("src/components/connect/ConnectModal.tsx")
const directoryPage = read("src/app/(marketing)/directory/[id]/page.tsx")

describe("tool intent survives directory -> login -> email -> connect", () => {
  it("still emits the tool id from the directory CTA", () => {
    expect(directoryPage).toContain("&tool=${tool.id}")
  })

  it("reads the tool param on the login page and hands it to the form", () => {
    expect(loginPage).toContain("tool?: string")
    expect(loginPage).toContain("sanitizeToolId(params.tool)")
    expect(loginPage).toContain("<MagicLinkForm toolId={toolId} />")
  })

  it("submits the tool id with the email so the action can see it", () => {
    expect(magicLinkForm).toContain("toolId")
    expect(magicLinkForm).toContain('type="hidden"')
    expect(magicLinkForm).toContain('name="tool"')
  })

  it("builds the emailed redirect from the submitted tool id", () => {
    expect(loginActions).toContain("magicLinkRedirectUrl(")
    expect(loginActions).toContain('formData.get("tool")')
    // The old unconditional literal must be gone, or the intent is built and
    // then thrown away.
    expect(loginActions).not.toContain("}/auth/confirm`")
  })

  it("checks the arriving id against the catalog before preselecting", () => {
    expect(connectPage).toContain("searchParams")
    expect(connectPage).toContain("sanitizeToolId(")
    expect(connectPage).toContain("t.id === requestedToolId")
    expect(connectPage).toContain("preselectToolId={preselectToolId}")
  })

  it("opens the credential modal on the preselected tool", () => {
    expect(toolGrid).toContain("preselectToolId")
    expect(toolGrid).toContain("tools.find((t) => t.id === preselectToolId)")
  })

  it("measures both ends of the path so abandonment is derivable", () => {
    expect(toolGrid).toContain('trackPlausibleEvent("Tool Intent Preselected")')
    expect(toolGrid).toContain('trackPlausibleEvent("Tool Intent Connected")')
    expect(connectModal).toContain("onConnected?.(tool.id)")
  })

  it("never reaches for the service-role catalog at sign-in time", () => {
    // public.tools is readable `to authenticated` only, so the sign-in path
    // has no catalog to check against; getToolById would mean an admin client
    // in an unauthenticated route and returns null under APP_ONLY anyway.
    expect(loginActions).not.toContain("getToolById")
    expect(loginPage).not.toContain("getToolById")
    expect(magicLinkForm).not.toContain("getToolById")
  })
})
