-- tools: short marketing description for the public tool directory
-- (/directory and /directory/[id]). Nullable; pages omit the line when absent.
alter table public.tools
  add column if not exists description text;
