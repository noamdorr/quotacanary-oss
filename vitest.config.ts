import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      // crypto.ts/admin.ts import "server-only" as a client-bundle tripwire;
      // the real module throws outside React Server, so stub it for node.
      "server-only": resolve(__dirname, "./src/test-stubs/server-only.ts"),
    },
  },
})
