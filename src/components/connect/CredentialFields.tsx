"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  type CredentialValues,
  credentialFieldsFor,
  credentialInputName,
  credentialPlaceholder,
} from "@/lib/credentials"
import type { CredentialField } from "@/lib/types"
import { cn } from "@/lib/utils"
import { type ChangeEvent, useId, useState } from "react"

// The one place a credential field gets its label, identifiers, help and error
// wiring, and secret-input protections. Every form that takes a vendor key
// renders its fields through here; the form around it keeps its own layout,
// submission and flow. Field names come from credentialInputName, so
// buildCredentialSecret reads them back on the server unchanged.

export function credentialFieldState({
  idBase,
  toolName,
  field,
  value,
  touched,
  helpId,
}: {
  idBase: string
  toolName: string
  field: CredentialField
  value: string | undefined
  touched: boolean
  helpId?: string
}) {
  const inputId = `${idBase}-${credentialInputName(field)}`
  const errorId = `${inputId}-error`
  const error = touched && !value?.trim() ? `${field.label} is required.` : null
  const describedBy = [error ? errorId : null, helpId ?? null].filter(Boolean)

  return {
    inputId,
    errorId,
    error,
    input: {
      id: inputId,
      name: credentialInputName(field),
      type: field.type,
      placeholder: credentialPlaceholder(toolName, field),
      // An API key is a secret, not a login. Password managers must not offer
      // the user's account password here or save this as one, and mobile
      // keyboards must not capitalize or "correct" a pasted key.
      autoComplete: "off",
      "data-1p-ignore": true,
      "data-lpignore": "true",
      autoCapitalize: "off",
      autoCorrect: "off",
      spellCheck: false,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy.length
        ? describedBy.join(" ")
        : undefined,
    },
  }
}

type CredentialFieldsProps = {
  toolName: string
  fields: CredentialField[] | null | undefined
  // Id of help text that describes every field, such as where to find the key.
  helpId?: string
  required?: boolean
  disabled?: boolean
  // Smaller label and input, for the inline rekey form on the tools page.
  compact?: boolean
  fieldClassName?: string
} & (
  | {
      values: CredentialValues
      // Takes an updater, like a useState setter, so back-to-back changes to
      // different fields (an autofill of a multi-field key) never drop one.
      onValuesChange: (
        update: (values: CredentialValues) => CredentialValues
      ) => void
      // Report a missing value on a field once the user has left it.
      validateOnBlur?: boolean
    }
  | {
      values?: undefined
      onValuesChange?: undefined
      validateOnBlur?: undefined
    }
)

export function CredentialFields({
  toolName,
  fields,
  helpId,
  required,
  disabled,
  compact,
  fieldClassName = "space-y-1.5",
  values,
  onValuesChange,
  validateOnBlur,
}: CredentialFieldsProps) {
  // useId keeps two forms on one page (a row's rekey form beside another's)
  // from sharing a label target.
  const idBase = useId()
  const [touched, setTouched] = useState<string[]>([])

  return credentialFieldsFor(fields).map((field) => {
    const state = credentialFieldState({
      idBase,
      toolName,
      field,
      value: values?.[field.name],
      touched: touched.includes(field.name),
      helpId,
    })
    return (
      <div key={field.name} className={fieldClassName}>
        <Label
          htmlFor={state.inputId}
          className={compact ? "text-xs" : undefined}
        >
          {field.label}
        </Label>
        <Input
          {...state.input}
          className={compact ? "h-8 w-full" : undefined}
          required={required}
          disabled={disabled}
          {...(values && {
            value: values[field.name] ?? "",
            onChange: (event: ChangeEvent<HTMLInputElement>) => {
              const value = event.target.value
              onValuesChange((current) => ({ ...current, [field.name]: value }))
            },
          })}
          onBlur={
            validateOnBlur
              ? () =>
                  setTouched((names) =>
                    names.includes(field.name) ? names : [...names, field.name]
                  )
              : undefined
          }
        />
        {state.error && (
          <p
            id={state.errorId}
            role="alert"
            className="text-xs text-[var(--dry)]"
          >
            {state.error}
          </p>
        )}
      </div>
    )
  })
}
