import { AuthTabs } from "@/components/auth/AuthTabs"
import { resolveAuthTab } from "@/lib/auth-tab"

interface LoginPageProps {
  searchParams: Promise<{ error?: string; message?: string; tab?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const error = params.error
  const message = params.message
  const initialTab = resolveAuthTab(params.tab)

  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-[var(--dry)] bg-[var(--dry-bg)] px-4 py-3 text-sm text-[var(--dry)]"
        >
          {error === "confirmation_failed"
            ? 'Email confirmation failed. The link may have expired. Use "Forgot password?" below to send yourself a fresh one.'
            : decodeURIComponent(error)}
        </div>
      )}
      {message && (
        <output className="mb-4 block rounded-md border border-[var(--healthy)] bg-[var(--healthy-bg)] px-4 py-3 text-sm text-[var(--healthy-text)]">
          {message === "check_email"
            ? "Check your email for a password reset link."
            : decodeURIComponent(message)}
        </output>
      )}
      <AuthTabs initialTab={initialTab} />
    </>
  )
}
