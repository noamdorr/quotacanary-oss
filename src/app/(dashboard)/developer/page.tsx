import { redirect } from "next/navigation"

// The developer surface moved into Settings → Integrations. Keep this route as
// a redirect so existing bookmarks/links still land in the right place.
export default function DeveloperPage() {
  redirect("/settings#integrations")
}
