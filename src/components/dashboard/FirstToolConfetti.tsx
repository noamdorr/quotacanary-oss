"use client"

import type { CSSProperties } from "react"

// Gold-forward "canary feather" confetti for the first connected tool.
// Weighted toward Canary Gold with one healthy-green accent - no alarm red,
// since red is the "dry" status color and reads wrong in a celebration.
const COLORS = [
  "#ffc400", // canary
  "#ffc400",
  "#ffc400",
  "#e0ac00", // canary-deep
  "#e0ac00",
  "#2f8f4b", // healthy green accent
  "#fff3c2", // canary-tint sparkle
]

const COUNT = 54

type WrapperStyle = CSSProperties & {
  "--qc-confetti-fall": string
  "--qc-confetti-delay": string
}

type FlakeStyle = CSSProperties & {
  "--qc-confetti-sway": string
  "--qc-confetti-flutter": string
  "--qc-confetti-delay": string
}

const PIECES = Array.from({ length: COUNT }, (_, i) => {
  // Even column coverage with a little per-piece jitter so it never lines up.
  const left = (i / COUNT) * 100 + (((i * 53) % 11) - 5)
  return {
    id: i,
    left: `${Math.max(0, Math.min(99, left))}%`,
    sway: `${10 + ((i * 13) % 16)}px`, // horizontal flutter amplitude
    fall: `${1600 + ((i * 73) % 1000)}ms`, // 1.6s - 2.6s descent
    flutter: `${600 + ((i * 37) % 500)}ms`, // 0.6s - 1.1s sway/flip cycle
    delay: `${(i * 41) % 450}ms`,
    color: COLORS[i % COLORS.length],
    width: i % 5 === 0 ? 9 : i % 3 === 0 ? 6 : 7,
    height: i % 4 === 0 ? 12 : i % 2 === 0 ? 8 : 10,
  }
})

function wrapperStyle(piece: (typeof PIECES)[number]): WrapperStyle {
  return {
    left: piece.left,
    "--qc-confetti-fall": piece.fall,
    "--qc-confetti-delay": piece.delay,
  }
}

function flakeStyle(piece: (typeof PIECES)[number]): FlakeStyle {
  return {
    width: piece.width,
    height: piece.height,
    backgroundColor: piece.color,
    "--qc-confetti-sway": piece.sway,
    "--qc-confetti-flutter": piece.flutter,
    "--qc-confetti-delay": piece.delay,
  }
}

export function FirstToolConfetti() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      {PIECES.map((piece) => (
        <span
          key={piece.id}
          className="qc-confetti-piece absolute top-[-24px]"
          style={wrapperStyle(piece)}
        >
          <span
            className="qc-confetti-flake block rounded-[1.5px] shadow-[0_1px_1px_rgba(26,26,26,0.12)]"
            style={flakeStyle(piece)}
          />
        </span>
      ))}
    </div>
  )
}
