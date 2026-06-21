import Script from "next/script"

const PLAUSIBLE_SCRIPT_SRC =
  "https://plausible.reechee.io/js/pa-vH2mFIl_JJCwlSkaJOMtS.js"

export function PlausibleAnalytics() {
  if (process.env.NODE_ENV !== "production") {
    return null
  }

  return (
    <>
      <Script
        id="plausible-script"
        src={PLAUSIBLE_SCRIPT_SRC}
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
