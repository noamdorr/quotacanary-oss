# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and self-host
releases use [semantic versioning](https://semver.org/).

Self-hosters: each release calls out any new environment variable or database
migration under **Upgrade notes**. Always run the migration step after updating.

## [Unreleased]

## [1.0.1] - 2026-06-22

### Security
- Harden alert webhook delivery against SSRF: destination URLs are re-validated at
  delivery time, hosts resolving to private/loopback/link-local/cloud-metadata
  addresses are blocked, and redirects are no longer followed.
- Send connected-tool API keys via a request header instead of a URL query string
  wherever the vendor supports it, so keys stop leaking into vendor logs and proxies.
- Patch dependency advisories (Next.js 16.1.6 -> 16.2.9 plus transitive fixes).

### Fixed
- Enforce the signed-in route boundary across the whole dashboard area in
  middleware, not just `/dashboard`.

### Upgrade notes
- No new environment variables or database migrations. Pull and rebuild.

## [1.0.0] - 2026-06-21

### Added
- Open-source release: public mirror, self-hosting guide, security disclosure.
- `APP_ONLY` flag for single-domain self-host instances.
- `supabase/config.toml` for a one-command local Supabase stack.

### Upgrade notes
- New optional env var `APP_ONLY` (set `true` for single-domain self-host).
- Run `supabase db push` (hosted) or `supabase db reset` (local) after pulling.

[unreleased]: https://github.com/noamdorr/quotacanary-oss/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/noamdorr/quotacanary-oss/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/noamdorr/quotacanary-oss/releases/tag/v1.0.0
