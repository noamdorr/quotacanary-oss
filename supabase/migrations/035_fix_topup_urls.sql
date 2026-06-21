-- Corrections to migration 034 after HTTP-verifying every backfilled topup_url
-- actually resolved (checked 2026-06-21). Three needed fixing; the other 38
-- resolve as intended -- several 403s were just Cloudflare bot challenges on
-- pages that load fine in a real browser (emailhippo, findymail, emailable), so
-- those were left unchanged.
--
--   captaindata: the .co host was wrong. Every app.captaindata.co path 404'd,
--     root included; captaindata.co only redirects to captaindata.com. The live
--     app is app.captaindata.com and the plans screen is /settings/plans.
--   hyperbolic: app.hyperbolic.xyz moved to app.hyperbolic.ai. The old link
--     still 301s today, but point at the canonical .ai billing URL so the CTA
--     does not lean on a legacy-domain redirect.
--   scrapegraphai: was the bare dashboard login root (flagged low confidence).
--     scrapegraphai.com/pricing is the real public plans page.

update public.tools set topup_url = 'https://app.captaindata.com/settings/plans' where id = 'captaindata';   -- was app.captaindata.co/settings/plan (404 on every path)
update public.tools set topup_url = 'https://app.hyperbolic.ai/settings/billing' where id = 'hyperbolic';    -- was app.hyperbolic.xyz/billing (domain moved .xyz -> .ai)
update public.tools set topup_url = 'https://scrapegraphai.com/pricing'          where id = 'scrapegraphai'; -- was dashboard.scrapegraphai.com (login root, not a plans page)
