-- Backfill topup_url for the 41 tools that had none, so the "Get more" CTA
-- (dashboard rows, burn-rate hero, connection drawer, alert emails, and the
-- public tool directory) resolves for every tool instead of only the 21 that
-- already had a URL.
--
-- Each URL is that tool's canonical "go add credits / upgrade" destination,
-- researched 2026-06-21. Where the real billing screen sits behind login, the
-- URL is the verified app entry point or public pricing page (a logged-in user
-- still lands in the right place). The trailing comment on each line is the
-- billing model + research confidence -- spot-check the `low`/`medium` ones
-- before trusting the deep link. billing_model is kept as a comment (not a
-- column) on purpose: nothing consumes it yet. Promote it to a real column if
-- we ever make the label adapt per billing model.
--
-- Updates only -- no schema change, no newly-selected column -- safe to apply
-- before or after a deploy.

-- AI / inference (prepaid wallet top-up)
update public.tools set topup_url = 'https://platform.deepseek.com/top_up'                       where id = 'deepseek';        -- prepaid_credits | high
update public.tools set topup_url = 'https://app.hyperbolic.xyz/billing'                         where id = 'hyperbolic';      -- prepaid_credits | high

-- Email finding / enrichment
update public.tools set topup_url = 'https://anymailfinder.com/pricing'                          where id = 'anymailfinder';   -- subscription | high
update public.tools set topup_url = 'https://app.dropcontact.com/billing'                        where id = 'dropcontact';     -- subscription | high
update public.tools set topup_url = 'https://enrow.io/pricing'                                   where id = 'enrow';           -- subscription | medium (app billing login-gated)
update public.tools set topup_url = 'https://www.findymail.com/pricing/'                         where id = 'findymail';       -- subscription | medium (no in-app billing path found)
update public.tools set topup_url = 'https://app.fullenrich.com/app/settings/billing'            where id = 'fullenrich';      -- hybrid | high (confirmed)
update public.tools set topup_url = 'https://app.leadmagic.io/settings/billing'                  where id = 'leadmagic';       -- hybrid | high
update public.tools set topup_url = 'https://dashboard.lusha.com/account'                        where id = 'lusha';           -- hybrid | medium (login-gated)
update public.tools set topup_url = 'https://app.prospeo.io/account/subscription'                where id = 'prospeo';         -- subscription | high
update public.tools set topup_url = 'https://rocketreach.co/pricing'                             where id = 'rocketreach';     -- subscription | medium (in-app slug unconfirmed)
update public.tools set topup_url = 'https://app.surfe.com/lighthouse/home?open-buy-credits=true' where id = 'surfe';          -- hybrid | high (opens buy-credits modal)
update public.tools set topup_url = 'https://wiza.co/app/settings/billing'                       where id = 'wiza';            -- hybrid | high

-- Email verification
update public.tools set topup_url = 'https://www.usebouncer.com/pricing/'                        where id = 'bouncer';         -- hybrid | high (in-app buy login-gated)
update public.tools set topup_url = 'https://bouncify.io/pricing.html'                           where id = 'bouncify';        -- credit_pack | high
update public.tools set topup_url = 'https://app.clearout.io/public/credits'                     where id = 'clearout';        -- hybrid | medium (login-gated)
update public.tools set topup_url = 'https://debounce.com/pricing/'                              where id = 'debounce';        -- prepaid_credits | high (dashboard plans login-gated)
update public.tools set topup_url = 'https://app.emailable.com/checkout/credits'                 where id = 'emailable';       -- hybrid | high (in-app credits checkout)
update public.tools set topup_url = 'https://app.emailhippo.com/'                                where id = 'emailhippo';      -- subscription | medium (Manage subscription behind login)
update public.tools set topup_url = 'https://app.emaillistverify.com/signin'                     where id = 'emaillistverify'; -- hybrid | high (billing behind login)
update public.tools set topup_url = 'https://app.mailercheck.com/'                               where id = 'mailercheck';     -- hybrid | medium (Buy credits in-app, login-gated)
update public.tools set topup_url = 'https://client.myemailverifier.com/login?buyCredit=10000'   where id = 'myemailverifier'; -- hybrid | high (buy-credits deep link)
update public.tools set topup_url = 'https://emailverifier.reoon.com/'                           where id = 'reoon';           -- hybrid | medium (buy-credits path login-gated)
update public.tools set topup_url = 'https://www.zerobounce.net/members/pricing'                 where id = 'zerobounce';      -- hybrid | high (members purchase page)

-- Data / scraping / proxy / SERP
update public.tools set topup_url = 'https://console.apify.com/billing/subscription'             where id = 'apify';           -- hybrid | high
update public.tools set topup_url = 'https://brightdata.com/cp/billing'                          where id = 'brightdata';      -- prepaid_credits | high (wallet add-balance)
update public.tools set topup_url = 'https://app.captaindata.co/settings/plan'                   where id = 'captaindata';     -- subscription | medium (.co domain; /settings/plans variant)
update public.tools set topup_url = 'https://www.firecrawl.dev/pricing'                          where id = 'firecrawl';       -- hybrid | medium (in-app billing not URL-confirmed)
update public.tools set topup_url = 'https://dashboard.netnut.io'                                where id = 'netnut';          -- subscription | low (dashboard root; exact path undocumented)
update public.tools set topup_url = 'https://dashboard.scrapegraphai.com'                        where id = 'scrapegraphai';   -- hybrid | low (dashboard root; exact route login-gated)
update public.tools set topup_url = 'https://scrapeops.io/app/login/'                            where id = 'scrapeops';       -- subscription | medium (billing under dashboard settings)
update public.tools set topup_url = 'https://dashboard.scraperapi.com/billing'                   where id = 'scraperapi';      -- hybrid | medium (path inferred from docs)
update public.tools set topup_url = 'https://scrapfly.io/dashboard/billing'                      where id = 'scrapfly';        -- hybrid | medium (redirects to login)
update public.tools set topup_url = 'https://app.scrapingant.com/dashboard'                      where id = 'scrapingant';     -- subscription | medium (SPA hides exact billing route)
update public.tools set topup_url = 'https://app.scrapingbee.com/billing/plans'                  where id = 'scrapingbee';     -- subscription | high (KB-linked upgrade page)
update public.tools set topup_url = 'https://www.scrapingdog.com/pricing/'                       where id = 'scrapingdog';     -- hybrid | high (plans + PAYG top-ups)
update public.tools set topup_url = 'https://www.searchapi.io/pricing'                           where id = 'searchapi';       -- subscription | high (pricing has buy buttons)
update public.tools set topup_url = 'https://serpapi.com/change-plan'                            where id = 'serpapi';         -- subscription | high (in-app change-plan page)
update public.tools set topup_url = 'https://app.serpwow.com/'                                   where id = 'serpwow';         -- subscription | medium (Traject dashboard; shared billing)
update public.tools set topup_url = 'https://app.valueserp.com/'                                 where id = 'valueserp';       -- subscription | medium (Traject dashboard; shared billing)
update public.tools set topup_url = 'https://zenserp.com/pricing-plans/'                         where id = 'zenserp';         -- subscription | medium (in-app billing behind login)
