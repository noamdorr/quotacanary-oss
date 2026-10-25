"use client"

import { useEffect, useRef, useState } from "react"

import {
  INITIAL_ROTATING_TOOL_INDEXES,
  ROTATING_TOOL_LOGOS,
  makeLogoQueue,
  makeSlotQueue,
  preloadRotatingToolLogos,
} from "@/lib/marketing-rotating-tools"

const ADVANCE_MS = 4500
const SLOT_IDS = ["zero", "one", "two", "three"] as const

type VisibleSlot = {
  current: number
  previous: number | null
}

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
  const root = useRef<HTMLDivElement>(null)
  const logoQueue = useRef<number[]>([])
  const slotQueue = useRef<number[]>([])
  const [visibleSlots, setVisibleSlots] = useState<VisibleSlot[]>(
    INITIAL_ROTATING_TOOL_INDEXES.map((current) => ({
      current,
      previous: null,
    }))
  )
  const [reducedMotion, setReducedMotion] = useState(true)
  const shownIndexes = useRef<number[]>([...INITIAL_ROTATING_TOOL_INDEXES])

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const syncPreference = () => setReducedMotion(media.matches)

    syncPreference()
    media.addEventListener("change", syncPreference)

    return () => media.removeEventListener("change", syncPreference)
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      return
    }

    // Only the four visible logos load with the page. Each later logo is
    // fetched one tick before it appears, so the crossfade has it in cache.
    const preloadUpcomingLogo = () => {
      if (logoQueue.current.length === 0) {
        logoQueue.current = makeLogoQueue(shownIndexes.current)
      }

      void preloadRotatingToolLogos([
        ROTATING_TOOL_LOGOS[logoQueue.current[0]].logo,
      ])
    }

    preloadUpcomingLogo()

    const interval = window.setInterval(() => {
      const section = root.current?.closest("section")

      if (
        root.current?.matches(":hover") ||
        section?.contains(document.activeElement)
      ) {
        return
      }

      if (slotQueue.current.length === 0) {
        slotQueue.current = makeSlotQueue()
      }

      const slot = slotQueue.current.shift() ?? 0
      const next =
        logoQueue.current.shift() ??
        fallbackToolIndex(shownIndexes.current, slot)

      shownIndexes.current = shownIndexes.current.map((current, index) =>
        index === slot ? next : current
      )
      setVisibleSlots((currentSlots) =>
        currentSlots.map((visibleSlot, currentSlot) =>
          currentSlot === slot
            ? { current: next, previous: visibleSlot.current }
            : visibleSlot
        )
      )
      preloadUpcomingLogo()
    }, ADVANCE_MS)

    return () => window.clearInterval(interval)
  }, [reducedMotion])

  return (
    <div ref={root} className="qc-rotating-tools">
      <ul
        className="qc-rotating-tools__rail"
        aria-live="off"
        aria-label="Examples of supported tools"
      >
        {SLOT_IDS.map((slotId, slot) => {
          const visibleSlot = visibleSlots[slot]
          const tool = ROTATING_TOOL_LOGOS[visibleSlot.current]
          const previousTool =
            visibleSlot.previous === null
              ? null
              : ROTATING_TOOL_LOGOS[visibleSlot.previous]

          return (
            <li
              aria-label={tool.name}
              className="qc-rotating-tool-slot"
              key={slotId}
            >
              {previousTool && (
                <span
                  aria-hidden="true"
                  className="qc-rotating-tool-face qc-rotating-tool-face--previous"
                  key={`${slotId}-${previousTool.name}`}
                >
                  <img
                    alt=""
                    className="qc-rotating-tool-icon"
                    decoding="async"
                    height={20}
                    loading="eager"
                    src={previousTool.logo}
                    width={20}
                  />
                  <span className="qc-rotating-tool-name">
                    {previousTool.name}
                  </span>
                </span>
              )}
              <span
                className="qc-rotating-tool-face qc-rotating-tool-face--current"
                data-changing={previousTool !== null}
                key={`${slotId}-${tool.name}`}
              >
                <img
                  alt=""
                  className="qc-rotating-tool-icon"
                  decoding="async"
                  height={20}
                  loading="eager"
                  src={tool.logo}
                  width={20}
                />
                <span className="qc-rotating-tool-name">{tool.name}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
