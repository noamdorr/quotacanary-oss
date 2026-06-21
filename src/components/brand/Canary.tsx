"use client"

import { type CSSProperties, useId } from "react"

export type CanaryMood = "perched" | "singing" | "sleepy" | "alert" | "dry"

const CANARY = "#FFC400"
const CANARY_DEEP = "#E0AC00"
const INK = "#1a1a1a"

export function Canary({
  size = 64,
  mood = "perched",
  style,
}: {
  size?: number
  mood?: CanaryMood
  style?: CSSProperties
}) {
  const dying = mood === "dry"
  const sleepy = mood === "sleepy" || dying
  const singing = mood === "singing"
  const filterId = `qc-rough-${useId()}`

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ overflow: "visible", ...style }}
      aria-hidden="true"
    >
      <defs>
        <filter id={filterId} x="0" y="0" width="100%" height="100%">
          <feTurbulence baseFrequency="0.06" numOctaves={2} seed={3} />
          <feDisplacementMap in="SourceGraphic" scale={1.4} />
        </filter>
      </defs>

      {singing && (
        <g
          className="qc-canary-note"
          style={{ animation: "note-float 1.4s ease-out infinite" }}
          fill="none"
          stroke={INK}
          strokeWidth={1.4}
          strokeLinecap="round"
        >
          <circle cx="86" cy="22" r="3" fill={INK} stroke="none" />
          <path d="M 88.5 22 L 88.5 9 q 4 1 4 5" />
        </g>
      )}

      <path
        d="M 14 84 q 36 1 72 0"
        stroke={INK}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />

      <g
        className="qc-canary-breathe"
        style={{
          animation: dying ? "none" : "breathe 3.2s ease-in-out infinite",
          transformOrigin: "50px 60px",
        }}
        transform={dying ? "translate(0 5) rotate(3 50 60)" : undefined}
      >
        <path
          d="M 22 60 q -2 -28 28 -30 q 30 0 30 22 q 0 22 -30 24 q -26 0 -28 -16 z"
          fill={CANARY}
          filter={`url(#${filterId})`}
        />
        <path
          d="M 22 60 q -2 -28 28 -30 q 30 0 30 22 q 0 22 -30 24 q -26 0 -28 -16 z"
          fill="none"
          stroke={INK}
          strokeWidth={1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
          filter={`url(#${filterId})`}
        />
        <path
          d="M 36 52 q 14 -4 26 6 q -6 14 -22 10 q -8 -4 -4 -16 z"
          fill="none"
          stroke={INK}
          strokeWidth={1.4}
          strokeLinecap="round"
          filter={`url(#${filterId})`}
        />
        <path
          d="M 44 56 q 8 -2 14 6"
          fill="none"
          stroke={INK}
          strokeWidth={1.2}
          filter={`url(#${filterId})`}
        />
        <path
          d="M 78 40 l 7 -1 l -7 5 z"
          fill={CANARY_DEEP}
          stroke={INK}
          strokeWidth={1.2}
          strokeLinejoin="round"
          filter={`url(#${filterId})`}
        />
        <path
          d="M 56 24 q 1 -7 5 -7 q -1 4 0 8"
          fill="none"
          stroke={INK}
          strokeWidth={1.4}
          strokeLinecap="round"
          filter={`url(#${filterId})`}
        />
        {sleepy ? (
          <path
            d="M 63 40 q 4 3 8 0"
            stroke={INK}
            strokeWidth={1.6}
            fill="none"
            strokeLinecap="round"
            filter={`url(#${filterId})`}
          />
        ) : (
          <circle cx="67" cy="40" r="1.8" fill={INK} />
        )}
        <path
          d="M 22 62 l -8 -6 m 8 6 l -10 2 m 10 -2 l -6 8"
          stroke={INK}
          strokeWidth={1.4}
          fill="none"
          strokeLinecap="round"
          filter={`url(#${filterId})`}
        />
        <path
          d="M 30 70 q 22 8 44 -2"
          stroke={INK}
          strokeWidth={0.7}
          fill="none"
          opacity={0.4}
          filter={`url(#${filterId})`}
        />
      </g>

      <path
        d="M 42 82 l 0 -6 m -2 6 l 4 0 M 56 82 l 0 -6 m -2 6 l 4 0"
        stroke={INK}
        strokeWidth={1.4}
        fill="none"
        strokeLinecap="round"
      />

      {sleepy && !dying && (
        <text
          x="76"
          y="20"
          fontFamily="serif"
          fontStyle="italic"
          fontSize="14"
          fill={INK}
          opacity={0.55}
        >
          z
        </text>
      )}
    </svg>
  )
}
