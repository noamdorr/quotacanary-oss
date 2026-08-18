import { expect } from "@playwright/test"
import { MAILPIT_URL } from "./stack"

type MailpitSummary = {
  ID: string
  To: { Address: string }[]
  Subject: string
}

// The local stack routes GoTrue's mail to Mailpit, so the suite reads the real
// delivered message instead of minting a link through the admin API. That keeps
// "did the magic link actually get sent" inside the test rather than assumed.
async function latestMessageIdFor(email: string): Promise<string | null> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`)
  if (!res.ok) return null
  const body = (await res.json()) as { messages?: MailpitSummary[] }
  const match = body.messages?.find((m) =>
    m.To?.some((t) => t.Address.toLowerCase() === email.toLowerCase())
  )
  return match?.ID ?? null
}

async function messageBody(id: string): Promise<string> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)
  if (!res.ok) throw new Error(`Mailpit returned ${res.status} for ${id}`)
  const body = (await res.json()) as { Text?: string; HTML?: string }
  return `${body.Text ?? ""}\n${body.HTML ?? ""}`
}

// Mail arrives a beat after the form POST resolves, so poll rather than sleep.
export async function waitForMagicLink(email: string): Promise<string> {
  const ids: string[] = []
  await expect
    .poll(
      async () => {
        const id = await latestMessageIdFor(email)
        if (id) ids.push(id)
        return ids.length
      },
      {
        message: `No magic-link email reached ${email}`,
        timeout: 20_000,
        intervals: [250, 500, 1000],
      }
    )
    .toBeGreaterThan(0)

  const body = await messageBody(ids[0])
  // GoTrue's template links at the project's /auth/v1/verify endpoint, which
  // then redirects on to the app's own /auth/confirm route.
  const link = /https?:\/\/[^\s"'<>]*\/auth\/v1\/verify[^\s"'<>]*/.exec(body)
  if (!link) {
    throw new Error(`Delivered mail to ${email} carried no verify link`)
  }
  return link[0].replaceAll("&amp;", "&")
}
