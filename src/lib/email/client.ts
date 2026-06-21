import { EMAIL_FROM, MESSAGE_STREAM } from "./constants"

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
  tag?: string
}

export type SendEmailResult = { ok: true } | { ok: false; error: string }

export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const token = process.env.POSTMARK_SERVER_TOKEN
  if (!token) {
    console.error("[email] POSTMARK_SERVER_TOKEN is not set; skipping send")
    return { ok: false, error: "Email not configured." }
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
    })
    if (!res.ok) {
      const detail = await res.text()
      console.error(`[email] Postmark ${res.status}: ${detail}`)
      return { ok: false, error: `Postmark error ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    console.error("[email] send failed", err)
    return { ok: false, error: "Email send failed." }
  }
}
