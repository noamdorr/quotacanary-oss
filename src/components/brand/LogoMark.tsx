// The approved Q/canary mark (QUO-171), copied verbatim from the brand
// package; public/favicon.svg carries the same path. Never edit it by hand.
const LOGO_MARK_PATH =
  "M83.087 62.984 94 73 74.284 76.284A40 40 0 1 1 83.087 62.984ZM66.4 48a20.4 20.4 0 1 0-40.8 0 20.4 20.4 0 1 0 40.8 0Z"

export function LogoMark({ height = 24 }: { height?: number }) {
  const width = Math.round((height * 100) / 96)
  return (
    <svg
      viewBox="0 0 100 96"
      width={width}
      height={height}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", flex: "0 0 auto" }}
    >
      <path fillRule="evenodd" d={LOGO_MARK_PATH} />
    </svg>
  )
}
