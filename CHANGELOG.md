# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and self-host
releases use [semantic versioning](https://semver.org/).

Self-hosters: each release calls out any new environment variable or database
migration under **Upgrade notes**. Always run the migration step after updating.

## [Unreleased]

### Added
- Open-source release: public mirror, self-hosting guide, security disclosure.
- `APP_ONLY` flag for single-domain self-host instances.
- `supabase/config.toml` for a one-command local Supabase stack.

### Upgrade notes
- New optional env var `APP_ONLY` (set `true` for single-domain self-host).
- Run `supabase db push` (hosted) or `supabase db reset` (local) after pulling.
