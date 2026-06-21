-- Add Firecrawl credit usage support. Firecrawl exposes remaining team credits
-- through a read-only Bearer-authenticated API endpoint.
insert into public.tools (
  id,
  name,
  logo_url,
  api_docs_url,
  key_instructions,
  category,
  integration_type,
  default_alert_threshold,
  is_active,
  default_low_threshold
)
values (
  'firecrawl',
  'Firecrawl',
  '/logos/firecrawl.png',
  'https://docs.firecrawl.dev/api-reference/endpoint/credit-usage',
  'Go to Firecrawl dashboard → API Keys → copy your API key',
  'data',
  'api',
  5000,
  true,
  15000
)
on conflict (id) do update set
  name                    = excluded.name,
  logo_url                = excluded.logo_url,
  api_docs_url            = excluded.api_docs_url,
  key_instructions        = excluded.key_instructions,
  category                = excluded.category,
  integration_type        = excluded.integration_type,
  default_alert_threshold = excluded.default_alert_threshold,
  is_active               = excluded.is_active,
  default_low_threshold   = excluded.default_low_threshold;
