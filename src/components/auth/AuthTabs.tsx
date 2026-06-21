"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AuthTab } from "@/lib/auth-tab"
import Link from "next/link"
import { useState } from "react"
import { LoginForm } from "./LoginForm"
import { SignupForm } from "./SignupForm"

interface AuthTabsProps {
  initialTab?: AuthTab
}

export function AuthTabs({ initialTab = "login" }: AuthTabsProps) {
  const [activeTab, setActiveTab] = useState<AuthTab>(initialTab)
  const activeTabClass =
    "data-active:bg-[var(--canary-tint)] data-active:text-[var(--ink)]"

  return (
    <Card className="w-full border-border bg-card shadow-sm">
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="leading-none">
          <Link
            href="/"
            className="qc-nav-logo w-fit rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="QuotaCanary"
          >
            <img
              src="/logo.png"
              alt="QuotaCanary"
              width="122"
              height="27"
              style={{ width: 122, height: 27 }}
            />
          </Link>
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {activeTab === "login" ? "Welcome back" : "Create your account"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as AuthTab)}
        >
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="login" className={activeTabClass}>
              Sign in
            </TabsTrigger>
            <TabsTrigger value="signup" className={activeTabClass}>
              Sign up
            </TabsTrigger>
          </TabsList>
          <TabsContent value="login">
            <LoginForm />
          </TabsContent>
          <TabsContent value="signup">
            <SignupForm />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
