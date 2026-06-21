"use client"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { trackPlausibleEvent } from "@/lib/plausible-events"
import { PlayCircle, X } from "lucide-react"
import { useRef, useState } from "react"

const VIDEO_SRC = "/video/quotacanary-launch.mp4"
const POSTER_SRC = "/video/quotacanary-launch-poster.jpg"

export function LaunchVideoDialog() {
  const [open, setOpen] = useState(false)
  const playTrackedRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)

    if (nextOpen) {
      playTrackedRef.current = false
      return
    }

    videoRef.current?.pause()
  }

  function handleCtaClick() {
    trackPlausibleEvent("Video CTA Click")
    handleOpenChange(true)
  }

  function handlePlay() {
    if (playTrackedRef.current) {
      return
    }

    playTrackedRef.current = true
    trackPlausibleEvent("Video Play")
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "14px 18px", fontSize: 15 }}
        onClick={handleCtaClick}
      >
        <PlayCircle size={18} strokeWidth={2.2} aria-hidden="true" />
        See how it works (26s)
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-[min(960px,calc(100vw-32px))] gap-0 overflow-hidden border-ink bg-ink p-0 text-cream shadow-2xl">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3">
            <DialogTitle className="text-sm font-medium text-cream">
              QuotaCanary launch video
            </DialogTitle>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 text-cream transition hover:bg-white/10"
              aria-label="Close video"
              onClick={() => handleOpenChange(false)}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {/* biome-ignore lint/a11y/useMediaCaption: The launch video has music only; no spoken content needs captions. */}
          <video
            ref={videoRef}
            controls
            playsInline
            preload="metadata"
            poster={POSTER_SRC}
            className="block aspect-video w-full bg-black"
            onPlay={handlePlay}
            onEnded={() => trackPlausibleEvent("Video Complete")}
          >
            <source src={VIDEO_SRC} type="video/mp4" />
          </video>
        </DialogContent>
      </Dialog>
    </>
  )
}
