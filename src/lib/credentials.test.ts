import { describe, expect, it } from "vitest"
import {
  appendCredentialValues,
  buildCredentialSecret,
  credentialsComplete,
} from "./credentials"
import type { CredentialField } from "./types"

const dataforseoFields: CredentialField[] = [
  { name: "login", label: "API login", type: "text" },
  { name: "password", label: "API password", type: "password" },
]

describe("credentials", () => {
  it("uses apiKey as the default single-field credential", () => {
    const formData = new FormData()
    formData.set("apiKey", "secret-key")

    expect(buildCredentialSecret(null, formData)).toEqual({
      ok: true,
      secret: "secret-key",
      hintValue: "secret-key",
    })
  })

  it("serializes multi-field credentials into one secret payload", () => {
    const formData = new FormData()
    formData.set("credential_login", "api-login")
    formData.set("credential_password", "api-password")

    expect(buildCredentialSecret(dataforseoFields, formData)).toEqual({
      ok: true,
      secret: JSON.stringify({
        login: "api-login",
        password: "api-password",
      }),
      hintValue: "api-password",
    })
  })

  it("requires every configured credential field", () => {
    const formData = new FormData()
    formData.set("credential_login", "api-login")

    expect(buildCredentialSecret(dataforseoFields, formData)).toEqual({
      ok: false,
      error: "API password is required.",
    })
  })

  it("appends controlled credential values to form data", () => {
    const formData = new FormData()

    appendCredentialValues(formData, dataforseoFields, {
      login: "api-login",
      password: "api-password",
    })

    expect(formData.get("credential_login")).toBe("api-login")
    expect(formData.get("credential_password")).toBe("api-password")
  })

  it("knows when controlled credential values are complete", () => {
    expect(
      credentialsComplete(dataforseoFields, {
        login: "api-login",
        password: "",
      })
    ).toBe(false)
    expect(
      credentialsComplete(dataforseoFields, {
        login: "api-login",
        password: "api-password",
      })
    ).toBe(true)
  })
})
