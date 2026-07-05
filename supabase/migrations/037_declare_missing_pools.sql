-- =============================================================================
-- 037_declare_missing_pools.sql
-- Declare tools.pools for the four multi-pool tools that never got one:
-- emaillistverify, reoon, surfe, valueserp.
--
-- Their adapters have always reported multiple credit_types, but without a
-- pools declaration the connect flow can't offer a watched-pools picker and
-- the public directory doesn't list what a tool exposes. credit_type, label,
-- and unit mirror each adapter's readBalance output exactly.
-- =============================================================================

-- EmailListVerify: on-demand credits plus optional daily subscription credits.
update public.tools
  set pools = '[
    {"credit_type":"ondemand","label":"Credits","unit":"credits"},
    {"credit_type":"subscription","label":"Daily Credits","unit":"credits"}
  ]'::jsonb
  where id = 'emaillistverify';

-- Reoon: instant credits plus daily credits.
update public.tools
  set pools = '[
    {"credit_type":"instant","label":"Credits","unit":"credits"},
    {"credit_type":"daily","label":"Daily Credits","unit":"credits"}
  ]'::jsonb
  where id = 'reoon';

-- Surfe: separate email, mobile, and search credit pools.
update public.tools
  set pools = '[
    {"credit_type":"email","label":"Email Credits","unit":"credits"},
    {"credit_type":"mobile","label":"Mobile Credits","unit":"credits"},
    {"credit_type":"search","label":"Search Credits","unit":"credits"}
  ]'::jsonb
  where id = 'surfe';

-- ValueSERP: monthly plan credits plus top-up credits.
update public.tools
  set pools = '[
    {"credit_type":"monthly","label":"Monthly Credits","unit":"credits"},
    {"credit_type":"topup","label":"Top-up Credits","unit":"credits"}
  ]'::jsonb
  where id = 'valueserp';
