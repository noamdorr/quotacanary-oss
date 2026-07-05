"use client"

// Last-resort boundary: replaces the root layout when it throws, so nothing
// from the app shell (globals.css, fonts, components) can be assumed here.
// Deliberately dependency-free with inline styles.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          background: "#fffdf5",
          color: "#1a1a1a",
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          textAlign: "center",
          padding: "48px 24px",
        }}
      >
        <h1
          style={{
            fontFamily: "'Iowan Old Style', Georgia, serif",
            fontSize: "36px",
            fontWeight: 500,
            margin: 0,
          }}
        >
          Something broke. It wasn&apos;t you.
        </h1>
        <p style={{ maxWidth: "28rem", fontSize: "14px", color: "#6b6b66" }}>
          An unexpected error stopped the whole page. Try again - if it keeps
          happening, it&apos;s on us.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            background: "#ffc400",
            color: "#1a1a1a",
            border: "none",
            borderRadius: "10px",
            padding: "12px 18px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
