import type { CredentialField } from "./types"

const DEFAULT_CREDENTIAL_FIELD: CredentialField = {
  name: "apiKey",
  label: "API key",
  type: "password",
}

export type CredentialValues = Record<string, string>

export function credentialFieldsFor(
  fields: CredentialField[] | null | undefined
): CredentialField[] {
  return fields?.length ? fields : [DEFAULT_CREDENTIAL_FIELD]
}

export function credentialInputName(field: CredentialField): string {
  return field.name === "apiKey" ? "apiKey" : `credential_${field.name}`
}

export function credentialPlaceholder(
  toolName: string,
  field: CredentialField
): string {
  return field.placeholder ?? `Paste your ${toolName} ${field.label}`
}

export function credentialsComplete(
  fields: CredentialField[] | null | undefined,
  values: CredentialValues
): boolean {
  return credentialFieldsFor(fields).every((field) =>
    Boolean(values[field.name]?.trim())
  )
}

export function appendCredentialValues(
  formData: FormData,
  fields: CredentialField[] | null | undefined,
  values: CredentialValues
): void {
  for (const field of credentialFieldsFor(fields)) {
    formData.set(credentialInputName(field), values[field.name] ?? "")
  }
}

export function buildCredentialSecret(
  fields: CredentialField[] | null | undefined,
  formData: FormData
):
  | { ok: true; secret: string; hintValue: string }
  | { ok: false; error: string } {
  const normalized = credentialFieldsFor(fields)
  const values: CredentialValues = {}
  let hintValue = ""

  for (const field of normalized) {
    const value = String(formData.get(credentialInputName(field)) ?? "").trim()
    if (!value) return { ok: false, error: `${field.label} is required.` }
    values[field.name] = value
    hintValue = value
  }

  if (!fields?.length) {
    return { ok: true, secret: values.apiKey, hintValue }
  }

  return { ok: true, secret: JSON.stringify(values), hintValue }
}
