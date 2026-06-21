import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { markAlertEventRead } from "@/lib/actions/alerts"
import type { AlertEvent } from "@/lib/types"

export function AlertEventList({ events }: { events: AlertEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-card p-4">
        <p className="text-sm text-muted-foreground">
          No alerts yet. A quiet bird is good news.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <article
          key={event.id}
          className="rounded-lg border border-border/60 bg-card p-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    event.level === "critical" ? "destructive" : "default"
                  }
                >
                  {event.level}
                </Badge>
                {!event.read_at && <Badge variant="secondary">Unread</Badge>}
                <time className="text-xs text-muted-foreground">
                  {new Date(event.created_at).toLocaleString()}
                </time>
              </div>
              <div>
                <h2 className="text-sm font-semibold">{event.title}</h2>
                <p className="text-sm text-muted-foreground">{event.body}</p>
              </div>
              {event.pools.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {event.pools.map((pool) => (
                    <span
                      key={`${event.id}-${pool.label}`}
                      className="rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground"
                    >
                      {pool.label}: {pool.balance}
                      {pool.unit ? ` ${pool.unit}` : ""} left
                    </span>
                  ))}
                </div>
              )}
            </div>
            {!event.read_at && (
              <form action={markAlertEventRead}>
                <input type="hidden" name="id" value={event.id} />
                <Button type="submit" size="sm" variant="secondary">
                  Mark read
                </Button>
              </form>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
