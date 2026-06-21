-- tools: canonical homepage for the public directory's "Website" button and the
-- JSON-LD url. Optional override; toolWebsiteUrl() falls back to deriving a root
-- from topup_url / api_docs_url when this is null, so most tools need no value.
alter table public.tools
  add column if not exists website_url text;
