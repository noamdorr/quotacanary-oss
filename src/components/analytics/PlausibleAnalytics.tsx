import Script from "next/script"

// Analytics is opt-in and set only by the hosted deployment. A self-hosted
// instance leaves PLAUSIBLE_SCRIPT_SRC unset and loads no third-party script,
// so its users' page paths never reach someone else's analytics.
export function PlausibleAnalytics() {
  const src = process.env.PLAUSIBLE_SCRIPT_SRC

  if (process.env.NODE_ENV !== "production" || !src) {
    return null
  }

  return (
    <>
      <Script
        id="plausible-script"
        src={src}
        strategy="afterInteractive"
        async
      />
      <Script id="plausible-init" strategy="afterInteractive">
        {
          "window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()"
        }
      </Script>
    </>
  )
}
