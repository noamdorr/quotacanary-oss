export default function SecurityPage() {
  return (
    <main className="flex-1 p-8">
      <h1 className="mb-6 text-2xl font-bold">Security &amp; privacy</h1>
      <div className="max-w-2xl space-y-5 text-sm text-muted-foreground">
        <section>
          <h2 className="font-semibold text-foreground">
            QuotaCanary only reads your balance
          </h2>
          <p>
            We never spend credits or change your account. QuotaCanary makes a
            single read-only balance call per tool, a strictly smaller ask than
            the tools you already trust to act on your behalf.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-foreground">
            Your keys are encrypted
          </h2>
          <p>
            API keys are encrypted at rest with AES-256. We store only the last
            4 characters for display so you can tell connections apart.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-foreground">
            Use scoped keys where you can
          </h2>
          <p>
            Where a tool offers read-only or limited keys, we recommend using
            those. Our connect instructions point you to the right place.
          </p>
        </section>
      </div>
    </main>
  )
}
