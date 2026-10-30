import robots from "@/app/robots"
import { expect, it } from "vitest"

it("lets crawlers read app noindex headers without publishing a marketing sitemap", () => {
  expect(robots()).toEqual({
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
  })
})
