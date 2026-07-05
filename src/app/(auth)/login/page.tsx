import { AuthTabs } from "@/components/auth/AuthTabs"
import { resolveAuthTab } from "@/lib/auth-tab"
import { loginErrorNotice, loginMessageNotice } from "@/lib/login-notice"

interface LoginPageProps {
  searchParams: Promise<{ error?: string; message?: string; tab?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const errorNotice = loginErrorNotice(params.error)
  const messageNotice = loginMessageNotice(params.message)
  const initialTab = resolveAuthTab(params.tab)

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
      {messageNotice && (
        <output className="mb-4 block rounded-md border border-[var(--healthy)] bg-[var(--healthy-bg)] px-4 py-3 text-sm text-[var(--healthy-text)]">
          {messageNotice}
        </output>
      )}
      <AuthTabs initialTab={initialTab} />
    </>
  )
}
