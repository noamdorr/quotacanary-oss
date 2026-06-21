-- =============================================================================
-- 006_balance_unit.sql
-- Add a `unit` to balance readings so the dashboard can format each balance
-- correctly: credit counts, US dollars, or bandwidth.
--
-- Why: not every tracked balance is a "credit" count. AI providers (OpenRouter,
-- DeepSeek, Hyperbolic) report a USD balance; proxy/scraping tools report GB.
-- Without a unit the UI renders "$4.20" identically to "4 credits".
--
-- Freeform text with a 'credits' default (NOT an enum/check) so new units can
-- be introduced by an adapter without a follow-up migration. The display layer
-- formats known units (credits / usd / gb) and falls back to a plain number.
--
-- Existing rows backfill to 'credits' via the default — correct, since every
-- pre-006 adapter reported credit counts (OpenRouter's USD was shown as
-- "credits" before this change).
--
-- Idempotent.
-- =============================================================================

alter table public.balances
  add column if not exists unit text not null default 'credits';
