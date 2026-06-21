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
            className="f-display"
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
            style={{
              fontSize: 15,
              color: "var(--ink-3)",
              marginTop: 16,
              maxWidth: 520,
              marginInline: "auto",
            }}
          >
            Click any one to see how to check its balance and what it bills you
            on.
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
          className="f-mono"
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  background: "var(--cream)",
                  border: "1px solid var(--hairline)",
                  borderRadius: 10,
                  textDecoration: "none",
                  color: "inherit",
                }}
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
      onClick={onClick}
      style={{
        minHeight: 40,
        padding: "6px 14px",
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: active ? "var(--canary)" : "var(--cream)",
        color: "var(--ink)",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  )
}
