"use client"

import { ConnectModal } from "@/components/connect/ConnectModal"
import { Button } from "@/components/ui/button"
import type { Tool } from "@/lib/types"
import { useState } from "react"

export function AddConnectionButton({ tool }: { tool: Tool }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Add connection</Button>
      <ConnectModal tool={tool} open={open} onOpenChange={setOpen} />
    </>
  )
}
