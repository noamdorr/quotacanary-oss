"use client"

import { type CSSProperties, useId } from "react"

export type CanaryMood = "perched" | "singing" | "sleepy" | "alert" | "dry"

const CANARY = "#FFC400"
const CANARY_DEEP = "#E0AC00"
const INK = "#1a1a1a"
const CREAM = "#FFFDF5"

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
  const sleepy = mood === "sleepy"
  const alert = mood === "alert"
  const singing = mood === "singing"
  const eyesOpen = !sleepy && !dying
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
        <>
          <g
            className="qc-canary-note"
            style={{ animation: "note-float 1.6s ease-out infinite" }}
            fill="none"
            stroke={INK}
            strokeWidth={1.4}
            strokeLinecap="round"
          >
            <circle cx="86" cy="22" r="3" fill={INK} stroke="none" />
            <path d="M 88.5 22 L 88.5 9 q 4 1 4 5" />
          </g>
          <g
            className="qc-canary-note"
            style={
              {
                animation: "note-float 1.6s ease-out infinite",
                animationDelay: "0.8s",
                animationFillMode: "backwards",
                "--qc-note-delay": "0.8s",
              } as CSSProperties
            }
            fill="none"
            stroke={INK}
            strokeWidth={1.2}
            strokeLinecap="round"
          >
            <circle cx="79" cy="16" r="2.2" fill={INK} stroke="none" />
            <path d="M 80.9 16 L 80.9 6.5 q 3 0.8 3 3.6" />
          </g>
        </>
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
          animation: dying
            ? "none"
            : `breathe ${alert ? 2.1 : 3.2}s ease-in-out infinite`,
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
        {singing ? (
          <g
            fill={CANARY_DEEP}
            stroke={INK}
            strokeWidth={1.2}
            strokeLinejoin="round"
          >
            <path
              d="M 78 38.5 l 7.5 -2.5 q -3.5 3.5 -7 3.5 z"
              filter={`url(#${filterId})`}
            />
            <path
              d="M 78.5 42.5 l 6 3 q -3.5 1.2 -6.5 -0.5 z"
              filter={`url(#${filterId})`}
            />
          </g>
        ) : (
          <path
            d="M 78 40 l 7 -1 l -7 5 z"
            fill={CANARY_DEEP}
            stroke={INK}
            strokeWidth={1.2}
            strokeLinejoin="round"
            filter={`url(#${filterId})`}
          />
        )}
        {dying ? (
          <path
            d="M 57 25 q 5 -4 8 -2 q -4 1 -5 5"
            fill="none"
            stroke={INK}
            strokeWidth={1.4}
            strokeLinecap="round"
            filter={`url(#${filterId})`}
          />
        ) : (
          <path
            d="M 56 24 q 1 -7 5 -7 q -1 4 0 8"
            fill="none"
            stroke={INK}
            strokeWidth={1.4}
            strokeLinecap="round"
            filter={`url(#${filterId})`}
          />
        )}
        {alert && (
          <path
            d="M 62 26 q 4 -7 7 -6 q -2 4 -1 8"
            fill="none"
            stroke={INK}
            strokeWidth={1.4}
            strokeLinecap="round"
            filter={`url(#${filterId})`}
          />
        )}
        {eyesOpen ? (
          <>
            <g className={alert ? undefined : "qc-canary-eye"}>
              <circle cx="67" cy="40" r={alert ? 2.6 : 1.8} fill={INK} />
              <circle
                cx={alert ? 66.1 : 66.4}
                cy={alert ? 39 : 39.4}
                r={alert ? 0.8 : 0.55}
                fill={CREAM}
              />
            </g>
            {!alert && (
              <path
                className="qc-canary-eye-lid"
                d="M 63.5 40 q 3.5 2.8 7 0"
                stroke={INK}
                strokeWidth={1.6}
                fill="none"
                strokeLinecap="round"
              />
            )}
          </>
        ) : dying ? (
          <path
            d="M 65.2 38.2 l 3.6 3.6 M 68.8 38.2 l -3.6 3.6"
            stroke={INK}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
            filter={`url(#${filterId})`}
          />
        ) : (
          <path
            d="M 63 40 q 4 3 8 0"
            stroke={INK}
            strokeWidth={1.6}
            fill="none"
            strokeLinecap="round"
            filter={`url(#${filterId})`}
          />
        )}
        <g
          className={dying || sleepy ? undefined : "qc-canary-tail"}
          style={{ transformOrigin: "22px 62px" }}
        >
          <path
            d="M 22 62 l -8 -6 m 8 6 l -10 2 m 10 -2 l -6 8"
            stroke={INK}
            strokeWidth={1.4}
            fill="none"
            strokeLinecap="round"
            filter={`url(#${filterId})`}
          />
        </g>
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
