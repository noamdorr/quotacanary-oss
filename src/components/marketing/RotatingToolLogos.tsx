"use client"

import { useEffect, useRef, useState } from "react"

import {
  INITIAL_ROTATING_TOOL_INDEXES,
  ROTATING_TOOL_LOGOS,
  makeLogoQueue,
  makeSlotQueue,
  preloadRotatingToolLogos,
} from "@/lib/marketing-rotating-tools"

const ADVANCE_MS = 1550
const SLOT_IDS = ["zero", "one", "two", "three"] as const

function fallbackToolIndex(current: readonly number[], slot: number) {
  const used = new Set(current.filter((_, index) => index !== slot))

  for (let offset = 1; offset <= ROTATING_TOOL_LOGOS.length; offset += 1) {
    const next = (current[slot] + offset) % ROTATING_TOOL_LOGOS.length

    if (!used.has(next)) {
      return next
    }
  }

  return current[slot]
}

export function RotatingToolLogos() {
  const logoQueue = useRef<number[]>([])
  const slotQueue = useRef<number[]>([])
  const [visibleIndexes, setVisibleIndexes] = useState(
    INITIAL_ROTATING_TOOL_INDEXES
  )
  const [logosReady, setLogosReady] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(true)

  useEffect(() => {
    let cancelled = false

    preloadRotatingToolLogos().then(() => {
      if (!cancelled) {
        setLogosReady(true)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const syncPreference = () => setReducedMotion(media.matches)

    syncPreference()
    media.addEventListener("change", syncPreference)

    return () => media.removeEventListener("change", syncPreference)
  }, [])

  useEffect(() => {
    if (!logosReady || reducedMotion || isPaused) {
      return
    }

    const interval = window.setInterval(() => {
      setVisibleIndexes((current) => {
        if (slotQueue.current.length === 0) {
          slotQueue.current = makeSlotQueue()
        }

        if (logoQueue.current.length === 0) {
          logoQueue.current = makeLogoQueue(current)
        }

        const slot = slotQueue.current.shift() ?? 0
        const next =
          logoQueue.current.shift() ?? fallbackToolIndex(current, slot)

        return current.map((index, currentSlot) =>
          currentSlot === slot ? next : index
        )
      })
    }, ADVANCE_MS)

    return () => window.clearInterval(interval)
  }, [isPaused, logosReady, reducedMotion])

  return (
    <div
      className="qc-rotating-tools"
      onBlurCapture={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="qc-rotating-tools__header">
        <span>60+ credit tools watched</span>
        <span aria-hidden="true">live stack radar</span>
      </div>
      <ul
        className="qc-rotating-tools__rail"
        aria-live="off"
        aria-label="Examples of supported tools"
      >
        {SLOT_IDS.map((slotId, slot) => {
          const toolIndex = visibleIndexes[slot]
          const tool = ROTATING_TOOL_LOGOS[toolIndex]

          return (
            <li
              aria-label={tool.name}
              className="qc-rotating-tool-slot"
              key={slotId}
            >
              <img
                alt=""
                className="qc-rotating-tool-icon"
                decoding="async"
                height={20}
                key={`${slotId}-${tool.name}-icon`}
                loading="eager"
                src={tool.logo}
                width={20}
              />
              <span
                className="qc-rotating-tool-name"
                key={`${slotId}-${tool.name}-name`}
              >
                {tool.name}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
