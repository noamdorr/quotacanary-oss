"use client"

import { CATEGORY_ORDER, categoryLabel } from "@/lib/marketing/tool-directory"
import type { Tool } from "@/lib/types"
import { useMemo, useState } from "react"

export function ToolsDirectory({ tools }: { tools: Tool[] }) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string>("all")

  const categories = useMemo(() => {
    const present = new Set(tools.map((t) => t.category ?? ""))
    return CATEGORY_ORDER.filter((c) => present.has(c))
  }, [tools])

  const filtered = tools.filter((t) => {
    const matchesCategory = category === "all" || t.category === category
    const q = query.trim().toLowerCase()
    const matchesQuery = q === "" || t.name.toLowerCase().includes(q)
    return matchesCategory && matchesQuery
  })

  return (
    <section style={{ padding: "72px 0" }}>
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Tool directory
          </div>
          <h1
            className="f-display text-balance"
            style={{
              fontSize: "clamp(28px, 3.6vw, 44px)",
              margin: 0,
              maxWidth: 640,
              marginInline: "auto",
            }}
          >
            Every tool QuotaCanary watches.
          </h1>
          <p
            className="text-pretty"
            style={{
              fontSize: 15,
              color: "var(--ink-3)",
              marginTop: 16,
              maxWidth: 520,
              marginInline: "auto",
            }}
          >
            Click any one to see how to check its balance and what it bills you
            on. This is the whole list; if yours isn&apos;t on it,{" "}
            <a href="mailto:hey@quotacanary.com?subject=Tool%20request">
              ask for it
            </a>
            .
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
          }}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools..."
            aria-label="Search tools"
            className="min-w-0 outline-none transition-[border-color,box-shadow] duration-150 ease-out focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            style={{
              flex: "1 1 220px",
              maxWidth: 320,
              minHeight: 40,
              padding: "8px 12px",
              border: "1px solid var(--hairline)",
              borderRadius: 10,
              background: "var(--cream)",
              fontSize: 14,
            }}
          />
          <FilterChip
            label="All"
            active={category === "all"}
            onClick={() => setCategory("all")}
          />
          {categories.map((c) => (
            <FilterChip
              key={c}
              label={categoryLabel(c)}
              active={category === c}
              onClick={() => setCategory(c)}
            />
          ))}
        </div>

        <p
          className="f-mono tabular-nums"
          style={{
            fontSize: 11,
            color: "var(--ink-3)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 16,
          }}
        >
          {filtered.length} {filtered.length === 1 ? "tool" : "tools"}
        </p>

        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 8,
          }}
        >
          {filtered.map((t) => (
            <li key={t.id}>
              <a
                href={`/directory/${t.id}`}
                className="flex min-h-11 items-center gap-2.5 rounded-[10px] border border-[var(--hairline)] bg-[var(--cream)] px-3.5 py-2.5 text-inherit no-underline outline-none transition-[background-color,border-color,box-shadow,scale] duration-150 ease-out hover:border-foreground/20 hover:bg-[var(--cream-2)] hover:shadow-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96] active:border-foreground/30 active:bg-[var(--cream-3)] active:shadow-none motion-reduce:active:scale-100"
              >
                {t.logo_url ? (
                  <img
                    src={t.logo_url}
                    alt=""
                    width={20}
                    height={20}
                    style={{
                      width: 20,
                      height: 20,
                      objectFit: "contain",
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <span
                    aria-hidden
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      background: "var(--canary)",
                      color: "var(--ink)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {t.name.charAt(0)}
                  </span>
                )}
                <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>
                  {t.name}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-10 cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-medium text-[var(--ink)] outline-none transition-[background-color,border-color,box-shadow,scale] duration-150 ease-out focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96] active:shadow-none motion-reduce:active:scale-100 ${
        active
          ? "border-[var(--canary-deep)] bg-[var(--canary)] shadow-sm hover:bg-[var(--canary-deep)] active:bg-[var(--canary-deep)]"
          : "border-[var(--hairline)] bg-[var(--cream)] hover:border-foreground/20 hover:bg-[var(--cream-2)] active:border-foreground/30 active:bg-[var(--cream-3)]"
      }`}
    >
      {label}
    </button>
  )
}
