-- Correct the Apollo catalog link without rewriting the already-applied 062.
-- Only the credit-usage endpoint matches the scoped key used by the adapter.
update public.tools
set api_docs_url = 'https://docs.apollo.io/reference/view-credit-usage-stats'
where id = 'apollo';
