// Tool makers submit through a GitHub issue form on the public mirror (QUO-333).
// The form file lives in the mirror's .github/ISSUE_TEMPLATE/, so the link must
// name that same file.
// Runs against the built dist/ (npm run build first; CI does).
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { describe, it } from "node:test"

const FORM = "tool-submission.yml"
const LINK = `https://github.com/noamdorr/quotacanary-oss/issues/new?template=${FORM}`
const directory = new URL("../dist/directory.html", import.meta.url).pathname
const staged = new URL(`../../scripts/public-issue-templates/${FORM}`, import.meta.url).pathname
const published = new URL(`../../.github/ISSUE_TEMPLATE/${FORM}`, import.meta.url).pathname
// scripts/ is never exported, so on the mirror the copied form is the file to check.
const template = existsSync(staged) ? staged : published

describe("tool submission link", () => {
  it("the directory links to the mirror's submission form", () => {
    const html = readFileSync(directory, "utf8")
    assert.ok(html.includes(`href="${LINK}"`), `no link to ${LINK}`)
  })

  it("the linked form exists as a staged template", () => {
    assert.ok(existsSync(template), `missing ${template}`)
    assert.match(readFileSync(template, "utf8"), /Never paste an API key/)
  })
})
