import { isRetryableHttpStatus } from "@/lib/retryable-http"
import { EMAIL_FROM, MESSAGE_STREAM } from "./constants"

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
  tag?: string
}

export type SendEmailResult =
  | { ok: true }
  | { ok: false; error: string; retryable: boolean }

export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const token = process.env.POSTMARK_SERVER_TOKEN
  if (!token) {
    console.error("[email] POSTMARK_SERVER_TOKEN is not set; skipping send")
    // Retryable: the send starts working once the operator configures the token.
    return { ok: false, error: "Email not configured.", retryable: true }
  }

  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify({
        From: EMAIL_FROM,
        To: input.to,
        Subject: input.subject,
        HtmlBody: input.html,
        TextBody: input.text,
        MessageStream: MESSAGE_STREAM,
        Tag: input.tag,
      }),
      // A hanging Postmark request must not stall the whole alert dispatch.
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      // Don't read/log the response body: Postmark echoes the recipient
      // address (PII) back in error payloads.
      console.error(`[email] Postmark ${res.status}`)
      return {
        ok: false,
        error: `Postmark error ${res.status}`,
        retryable: isRetryableHttpStatus(res.status),
      }
    }
    return { ok: true }
  } catch (err) {
    console.error("[email] send failed", err)
    return { ok: false, error: "Email send failed.", retryable: true }
  }
}
