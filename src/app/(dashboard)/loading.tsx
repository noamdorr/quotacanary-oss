import { Skeleton } from "@/components/ui/skeleton"

// Route-group loading state: the header and sidebar render instantly from the
// layout; this fills the content area while a page's server queries run. Kept
// generic (title, control bar, rows) so it reads right on every dashboard page.
export default function DashboardLoading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto w-full max-w-[1520px] flex-1 p-4 sm:p-8"
    >
      <Skeleton className="mb-6 h-8 w-44" />
      <div className="space-y-3">
        <Skeleton className="h-9 w-full max-w-sm" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-2/3" />
      </div>
    </main>
  )
}
