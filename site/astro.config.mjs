import { defineConfig } from "astro/config"

// Static build: every page is prerendered into dist/ and served by
// server.mjs, which owns the response headers (CSP and friends), the
// www -> apex redirect and the 404. No SSR adapter: nothing on the marketing
// site is per-request.
export default defineConfig({
  site: "https://quotacanary.com",
  output: "static",
  trailingSlash: "never",
  build: {
    // Clean URLs that match the Next routes (/directory/hunter, not /directory/hunter/).
    format: "file",
    // Keep stylesheets as files too; the CSP has no 'unsafe-inline' for scripts
    // and we would rather not depend on it for styles either.
    inlineStylesheets: "never",
  },
  vite: {
    build: {
      // Never inline a <script> into the HTML: the CSP allows only same-origin
      // script files, no inline scripts and no nonces.
      assetsInlineLimit: 0,
    },
  },
})
