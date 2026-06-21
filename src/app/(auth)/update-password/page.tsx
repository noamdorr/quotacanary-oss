import { UpdatePasswordForm } from "@/components/auth/UpdatePasswordForm"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function UpdatePasswordPage() {
  return (
    <Card className="w-full border-border bg-card shadow-sm">
      <CardHeader className="space-y-1 pb-2">
        <CardTitle
          className="text-2xl font-bold tracking-tight"
          style={{ fontFamily: "var(--f-display)", color: "var(--ink)" }}
        >
          Set a new password
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Choose a new password for your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <UpdatePasswordForm />
      </CardContent>
    </Card>
  )
}
