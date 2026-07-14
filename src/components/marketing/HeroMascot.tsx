"use client"

import { FirstToolConfetti } from "@/components/dashboard/FirstToolConfetti"
import { CanaryCallout } from "@/components/marketing/CanaryCallout"
import { MASCOT_LINES } from "@/lib/marketing-mascot"
import { useEffect, useRef, useState } from "react"

// Poke the bird enough times and it performs. Cycles through the lines so
// repeat offenders get fresh material.
const ENCORE_LINES = [
  "Okay, okay. Encore.",
  "That's all the songs I know.",
  "Please. I'm a professional.",
]

const POKES_FOR_ENCORE = 5
const ENCORE_MS = 4200

export function HeroMascot() {
  const pokes = useRef(0)
  const encores = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [encore, setEncore] = useState<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  function poke() {
    if (encore != null) return
    pokes.current += 1
    if (pokes.current < POKES_FOR_ENCORE) return
    pokes.current = 0
    setEncore(encores.current % ENCORE_LINES.length)
    encores.current += 1
    timer.current = setTimeout(() => setEncore(null), ENCORE_MS)
  }

  return (
    <>
      <div className="qc-hero-mascot" onPointerDown={poke}>
        {encore != null ? (
          <CanaryCallout
            line={ENCORE_LINES[encore]}
            mood="singing"
            size={132}
          />
        ) : (
          <CanaryCallout
            line={MASCOT_LINES.hero}
            mood="singing"
            revealOnHover
            size={132}
          />
        )}
      </div>
      {/* Outside the wrapper: its transform would otherwise become the
          containing block for the confetti's position:fixed. */}
      {encore != null && <FirstToolConfetti key={encores.current} />}
    </>
  )
}
