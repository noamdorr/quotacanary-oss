"use client"

import { useEffect } from "react"

// One chirp per page load, not per client-side navigation.
let sung = false

const BIRD = String.raw`
   ('v')   chirp.
  <(   )>
    " "
`

export function ConsoleEgg() {
  useEffect(() => {
    if (sung) return
    sung = true
    console.log(
      "%c the bird that sings before the credits die ",
      "background:#FFC400;color:#1a1a1a;font-weight:600;padding:3px 6px;border-radius:4px;"
    )
    console.log(
      `${BIRD}
You check under the hood. The bird respects that.
Everything on the dashboard is also a plain API: https://quotacanary.com/docs
Open source, feathers and all: https://github.com/noamdorr/quotacanary-oss`
    )
  }, [])
  return null
}
