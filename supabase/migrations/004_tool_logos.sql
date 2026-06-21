-- =============================================================================
-- 004_tool_logos.sql
-- Populate public.tools.logo_url with self-hosted logo assets.
--
-- Logos are committed under /public/logos/ rather than pulled from a third-party
-- logo service (e.g. Clearbit, now sunset) so the public app has no external
-- image dependency. The dashboard cards and catalog grid fall back to the tool's
-- first letter when logo_url is null.
--
-- NOTE: seed.sql also sets these same logo_url values in its upsert (for fresh
-- setups). This migration is the one-time backfill for DBs provisioned BEFORE
-- logo_url was in the seed. Keep the two in sync if logo paths ever change.
--
-- Idempotent.
-- =============================================================================

update public.tools set logo_url = '/logos/neverbounce.png'     where id = 'neverbounce';
update public.tools set logo_url = '/logos/millionverifier.png' where id = 'millionverifier';
update public.tools set logo_url = '/logos/openrouter.png'      where id = 'openrouter';
