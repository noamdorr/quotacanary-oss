import type { CredentialField } from "@/lib/types"
import { Fragment, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { CredentialFields, credentialFieldState } from "./CredentialFields"

// Vitest runs in node with no DOM, so these render the real component to HTML
// and read the attributes a browser would get. Blur is the one interaction
// static rendering cannot fire, so the touched state is exercised through
// credentialFieldState, the function the component renders every field from.

const MULTI: CredentialField[] = [
  { name: "login", label: "API login", type: "text" },
  { name: "password", label: "API password", type: "password" },
]

function render(props: Parameters<typeof CredentialFields>[0]): string {
  return renderToStaticMarkup(createElement(CredentialFields, props))
}

function attr(html: string, tag: string, name: string): string[] {
  const values: string[] = []
  for (const element of html.match(new RegExp(`<${tag}\\b[^>]*>`, "g")) ?? []) {
    const match = element.match(new RegExp(`\\s${name}="([^"]*)"`))
    if (match) values.push(match[1])
  }
  return values
}

describe("CredentialFields", () => {
  it("renders the default API key field labelled, named and masked", () => {
    const html = render({ toolName: "Acme", fields: null })

    const [inputId] = attr(html, "input", "id")
    expect(attr(html, "label", "for")).toEqual([inputId])
    expect(html).toContain(">API key</label>")
    expect(attr(html, "input", "name")).toEqual(["apiKey"])
    expect(attr(html, "input", "type")).toEqual(["password"])
    expect(attr(html, "input", "placeholder")).toEqual([
      "Paste your Acme API key",
    ])
  })

  it("renders every field of a multi-field credential with its own label", () => {
    const html = render({ toolName: "Acme", fields: MULTI })

    const ids = attr(html, "input", "id")
    expect(ids).toHaveLength(2)
    expect(attr(html, "label", "for")).toEqual(ids)
    expect(html).toContain(">API login</label>")
    expect(html).toContain(">API password</label>")
    expect(attr(html, "input", "name")).toEqual([
      "credential_login",
      "credential_password",
    ])
    expect(attr(html, "input", "type")).toEqual(["text", "password"])
  })

  it("treats every field as a secret rather than a login", () => {
    const html = render({ toolName: "Acme", fields: MULTI })

    for (const input of html.match(/<input\b[^>]*>/g) ?? []) {
      expect(input).toContain('autoComplete="off"')
      expect(input).toContain('data-1p-ignore="true"')
      expect(input).toContain('data-lpignore="true"')
      expect(input).toContain('autoCapitalize="off"')
      expect(input).toContain('autoCorrect="off"')
      expect(input).toContain('spellCheck="false"')
    }
  })

  it("hangs shared help text off every field", () => {
    const html = render({ toolName: "Acme", fields: MULTI, helpId: "key-help" })

    expect(attr(html, "input", "aria-describedby")).toEqual([
      "key-help",
      "key-help",
    ])
  })

  it("keeps identifiers unique when two forms render at once", () => {
    const html = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(CredentialFields, { toolName: "Acme", fields: MULTI }),
        createElement(CredentialFields, { toolName: "Acme", fields: MULTI })
      )
    )

    const ids = attr(html, "input", "id")
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    expect(attr(html, "label", "for")).toEqual(ids)
  })

  it("shows no error on untouched empty fields, even when validating", () => {
    const html = render({
      toolName: "Acme",
      fields: MULTI,
      values: {},
      onValuesChange: () => {},
      validateOnBlur: true,
    })

    expect(html).not.toContain('aria-invalid="')
    expect(html).not.toContain('role="alert"')
  })

  it("renders controlled values and passes required and disabled through", () => {
    const html = render({
      toolName: "Acme",
      fields: MULTI,
      values: { login: "me" },
      onValuesChange: () => {},
      required: true,
      disabled: true,
    })

    expect(attr(html, "input", "value")).toEqual(["me", ""])
    for (const input of html.match(/<input\b[^>]*>/g) ?? []) {
      expect(input).toContain('required=""')
      expect(input).toContain('disabled=""')
    }
  })
})

describe("credentialFieldState", () => {
  const field = MULTI[0]
  const base = { idBase: "f", toolName: "Acme", field, helpId: "key-help" }

  it("flags a touched empty field and points at the error before the help", () => {
    const state = credentialFieldState({ ...base, value: "  ", touched: true })

    expect(state.error).toBe("API login is required.")
    expect(state.input["aria-invalid"]).toBe(true)
    expect(state.input["aria-describedby"]).toBe(`${state.errorId} key-help`)
  })

  it("leaves a touched field alone once it has a value", () => {
    const state = credentialFieldState({ ...base, value: "me", touched: true })

    expect(state.error).toBeNull()
    expect(state.input["aria-invalid"]).toBeUndefined()
    expect(state.input["aria-describedby"]).toBe("key-help")
  })

  it("leaves an untouched empty field alone", () => {
    const state = credentialFieldState({ ...base, value: "", touched: false })

    expect(state.error).toBeNull()
    expect(state.input["aria-invalid"]).toBeUndefined()
  })
})
