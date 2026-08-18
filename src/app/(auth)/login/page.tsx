import { MagicLinkForm } from "@/components/auth/MagicLinkForm"
import { loginErrorNotice } from "@/lib/login-notice"
import { sanitizeToolId } from "@/lib/tool-intent"

interface LoginPageProps {
  searchParams: Promise<{ error?: string; tool?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const errorNotice = loginErrorNotice(params.error)
  // Set by the directory CTAs (`?tool=<id>`). Carried into the form so it can
  // ride the magic-link round trip; dropped here if it is not a bare slug.
  const toolId = sanitizeToolId(params.tool)

  return (
    <>
      {errorNotice && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-[var(--dry)] bg-[var(--dry-bg)] px-4 py-3 text-sm text-[var(--dry)]"
        >
          {errorNotice}
        </div>
      )}
      <MagicLinkForm toolId={toolId} />
    </>
  )
}
